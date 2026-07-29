import "server-only";

import type { AdminClient } from "./supabase/adminClient";
import type { Tables } from "@shared/interfaces/db";

/**
 * Undo for AI writes.
 *
 * §6 and §10 both require that model-made changes are reversible. `audit_log`
 * records `prev_value` on every mutation, but a stored previous value is only a
 * promise until something can act on it — this is the part that makes the claim
 * true.
 *
 * The rule that matters is the staleness check: an entry can only be reverted if
 * it is still the **latest** change to that entity. Restoring an old `prev_value`
 * over a newer edit would silently destroy work the user did afterwards, which is
 * a worse failure than refusing to undo.
 */

export type RevertOutcome = {
  ok: boolean;
  message: string;
  /** True when the refusal is because something newer landed on this entity. */
  stale?: boolean;
};

const REVERTABLE_TABLES = new Set([
  "person",
  "company",
  "project",
  "meeting",
  "commitment",
  "task",
  "decision",
]);

/**
 * Rows that would be affected by deleting a given entity.
 *
 * The foreign keys are mostly `on delete set null`, so Postgres would happily let
 * the delete through and quietly detach whatever pointed at it — reverting a
 * company create would strip the company off its people without saying so. A
 * silent side effect is the one thing this whole system is built not to do, so the
 * revert checks for dependents itself and refuses.
 *
 * Declared explicitly rather than derived from pg_constraint: it is short, it is
 * readable, and a new relationship is a deliberate line here rather than a
 * behaviour change nobody noticed.
 */
const DEPENDENTS: Record<string, { table: string; column: string; label: string }[]> = {
  company: [
    { table: "person", column: "company_id", label: "people" },
    { table: "project", column: "company_id", label: "projects" },
    { table: "meeting", column: "company_id", label: "meetings" },
    { table: "person_company", column: "company_id", label: "person links" },
    { table: "project_company", column: "company_id", label: "project links" },
  ],
  person: [
    { table: "project_person", column: "person_id", label: "project links" },
    { table: "person_company", column: "person_id", label: "company links" },
    { table: "meeting_person", column: "person_id", label: "meeting attendance" },
    { table: "decision_person", column: "person_id", label: "decisions" },
    { table: "source_mention", column: "person_id", label: "activity" },
  ],
  project: [
    { table: "task", column: "project_id", label: "tasks" },
    { table: "meeting", column: "project_id", label: "meetings" },
    { table: "project_person", column: "project_id", label: "people" },
    { table: "source_mention", column: "project_id", label: "activity" },
  ],
  meeting: [
    { table: "meeting_person", column: "meeting_id", label: "attendees" },
    { table: "commitment", column: "meeting_id", label: "commitments" },
    { table: "decision", column: "meeting_id", label: "decisions" },
  ],
  commitment: [],
  task: [],
  decision: [{ table: "decision_person", column: "decision_id", label: "people" }],
};

/** Anything that would be detached or removed by deleting this row. */
async function findDependents(
  db: AdminClient,
  entityKind: string,
  entityId: string,
): Promise<string[]> {
  const found: string[] = [];

  for (const dependent of DEPENDENTS[entityKind] ?? []) {
    const { count, error } = await db
      // The table name is from a closed literal map, never from user input.
      .from(dependent.table as never)
      .select("*", { count: "exact", head: true })
      .eq(dependent.column, entityId);

    if (error) continue;
    if ((count ?? 0) > 0) found.push(`${count} ${dependent.label}`);
  }

  return found;
}

/** Is this still the most recent audited change to the entity? */
async function isLatest(
  db: AdminClient,
  entry: Tables<"audit_log">,
): Promise<boolean> {
  const { data } = await db
    .from("audit_log")
    .select("id, created_at")
    .eq("workspace_id", entry.workspace_id)
    .eq("entity_kind", entry.entity_kind)
    .eq("entity_id", entry.entity_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.id === entry.id;
}

export async function revertAuditEntry(
  db: AdminClient,
  workspaceId: string,
  auditId: string,
  revertedBy: string | null = null,
): Promise<RevertOutcome> {
  const { data: entry, error } = await db
    .from("audit_log")
    .select()
    .eq("id", auditId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error || !entry) {
    return { ok: false, message: "That audit entry does not exist." };
  }

  if (!REVERTABLE_TABLES.has(entry.entity_kind)) {
    return {
      ok: false,
      message: `Changes to ${entry.entity_kind} are not revertable this way.`,
    };
  }

  if (!(await isLatest(db, entry))) {
    return {
      ok: false,
      stale: true,
      message:
        "Something changed on this record after that entry. Reverting would discard the newer change.",
    };
  }

  const table = entry.entity_kind as
    | "person"
    | "company"
    | "project"
    | "meeting"
    | "commitment"
    | "task"
    | "decision";

  // ── Undo a create: remove the row ──────────────────────────────────────────
  if (entry.action === "create") {
    const dependents = await findDependents(db, entry.entity_kind, entry.entity_id);
    if (dependents.length > 0) {
      return {
        ok: false,
        message: `Cannot remove that ${table} — ${dependents.join(", ")} still point at it. Detaching them silently would lose information nobody asked to delete.`,
      };
    }

    const { error: deleteError } = await db
      .from(table)
      .delete()
      .eq("id", entry.entity_id)
      .eq("workspace_id", workspaceId);

    if (deleteError) {
      // Almost always a foreign key: something now references this row. Say so
      // rather than cascading and taking unrelated records with it.
      return {
        ok: false,
        message: `Could not remove that ${table} — something else references it now.`,
      };
    }

    await db.from("audit_log").insert({
      workspace_id: workspaceId,
      entity_kind: entry.entity_kind,
      entity_id: entry.entity_id,
      action: "delete",
      reason: `reverted audit entry ${entry.id}`,
      prev_value: entry.new_value,
      new_value: null,
      source_ids: entry.source_ids,
      approved_by: revertedBy,
    });

    return { ok: true, message: `Removed the ${table} that was created.` };
  }

  // ── Undo an update: restore prev_value ─────────────────────────────────────
  if (entry.action === "update") {
    if (entry.prev_value === null) {
      return {
        ok: false,
        message: "That entry has no previous value recorded, so it cannot be undone.",
      };
    }

    const previous = entry.prev_value as Record<string, unknown>;
    // Restore only the field the entry names, when it names one. Writing the whole
    // object back would revert fields the entry never touched.
    const patch =
      entry.field !== null && entry.field in previous
        ? { [entry.field]: previous[entry.field] }
        : previous;

    const { error: updateError } = await db
      .from(table)
      .update(patch as never)
      .eq("id", entry.entity_id)
      .eq("workspace_id", workspaceId);

    if (updateError) {
      return { ok: false, message: `Could not restore that ${table}: ${updateError.message}` };
    }

    await db.from("audit_log").insert({
      workspace_id: workspaceId,
      entity_kind: entry.entity_kind,
      entity_id: entry.entity_id,
      action: "update",
      field: entry.field,
      reason: `reverted audit entry ${entry.id}`,
      prev_value: entry.new_value,
      new_value: patch as never,
      source_ids: entry.source_ids,
      approved_by: revertedBy,
    });

    return {
      ok: true,
      message: entry.field
        ? `Restored the previous ${entry.field}.`
        : "Restored the previous values.",
    };
  }

  return {
    ok: false,
    message: `A "${entry.action}" entry cannot be reverted automatically.`,
  };
}

/** The recent audit trail for one entity, newest first. */
export async function getAuditTrail(
  db: AdminClient,
  workspaceId: string,
  entityKind: string,
  entityId: string,
  limit = 20,
): Promise<Tables<"audit_log">[]> {
  const { data, error } = await db
    .from("audit_log")
    .select()
    .eq("workspace_id", workspaceId)
    .eq("entity_kind", entityKind)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[rob-os] could not read the audit trail:", error.message);
    return [];
  }
  return data ?? [];
}
