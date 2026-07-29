import "server-only";

import type { Inserts, Tables } from "@shared/interfaces/db";
import type { AdminClient } from "@shared/services/supabase/adminClient";
import { normalizeName } from "@features/ingestion";

import type { ReviewDecision, ReviewOutcome } from "../domain/types";

/**
 * Applying a review decision.
 *
 * The important half is not the write — it is the *memory*. §2 and §7 both promise
 * that a correction improves future filing, and that only happens if the decision
 * is stored as a `resolution_hint` keyed on the surface form the model saw. Without
 * it, the same "Sarah" re-queues on every re-ingest and the queue never gets
 * shorter, which makes the whole surface feel pointless to use.
 *
 * A rejection is memory too: "this mention is never an entity" is exactly as
 * useful as "this mention is Sarah Lin".
 */

const ENTITY_TABLES = new Set(["person", "company", "project"]);

/** The surface form the model saw, which is what a future mention will match on. */
function mentionOf(item: Tables<"review_item">): string | null {
  const proposed = item.proposed as Record<string, unknown> | null;
  const name = proposed?.name;
  return typeof name === "string" && name.trim().length > 0
    ? normalizeName(name)
    : null;
}

export async function applyReviewDecision(
  db: AdminClient,
  workspaceId: string,
  reviewItemId: string,
  decision: ReviewDecision,
  resolvedBy: string | null = null,
): Promise<ReviewOutcome> {
  const { data: item, error } = await db
    .from("review_item")
    .select()
    .eq("id", reviewItemId)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !item) {
    return { ok: false, message: "That review item no longer exists.", remembered: false };
  }

  if (item.status !== "pending") {
    return { ok: false, message: "That item has already been resolved.", remembered: false };
  }

  const proposed = (item.proposed ?? {}) as Record<string, unknown>;
  const mention = mentionOf(item);
  let remembered = false;
  let message = "";
  let createdId: string | null = null;

  const remember = async (entityId: string | null): Promise<void> => {
    if (!mention || !ENTITY_TABLES.has(item.entity_kind)) return;
    remembered = await db
      .from("resolution_hint")
      .upsert(
        {
          workspace_id: workspaceId,
          entity_kind: item.entity_kind,
          mention,
          entity_id: entityId,
          created_from_review_item_id: item.id,
        },
        { onConflict: "workspace_id,entity_kind,mention" },
      )
      .then(({ error: hintError }) => {
        if (hintError) console.warn("[rob-os] could not store hint:", hintError);
        return !hintError;
      });
  };

  if (decision.action === "approve") {
    // Approving files the proposal as the user confirming it — so it is stored as
    // `user_stated` at full confidence, not as the model's guess.
    if (ENTITY_TABLES.has(item.entity_kind)) {
      const table = item.entity_kind as "person" | "company" | "project";
      const row = {
        workspace_id: workspaceId,
        name: String(proposed.name ?? "Untitled"),
        ...(table === "person"
          ? {
              role: (proposed.role as string | null) ?? null,
              emails: proposed.email ? [String(proposed.email).toLowerCase()] : [],
            }
          : {}),
        ...(table === "company" ? { industry: (proposed.industry as string | null) ?? null } : {}),
        ...(table === "project"
          ? {
              outcome: (proposed.outcome as string | null) ?? null,
              deadline: (proposed.deadline as string | null) ?? null,
            }
          : {}),
      };

      const { data: created, error: writeError } = await db
        .from(table)
        .insert(row as never)
        .select("id")
        .single();

      if (writeError || !created) {
        return { ok: false, message: `Could not create the ${table}.`, remembered: false };
      }
      createdId = created.id;
      await remember(created.id);
      message = `Created ${proposed.name} as a new ${table}.`;
    } else {
      // Claims (commitment / task / decision) are approved as-is by the user.
      message = `Approved the ${item.entity_kind}.`;
    }
  }

  if (decision.action === "reject") {
    // Remember the rejection so the same false positive does not come back.
    await remember(null);
    message = mention
      ? `Rejected. "${mention}" will not be filed again.`
      : "Rejected.";
  }

  if (decision.action === "correct") {
    await remember(decision.entityId);
    if (decision.entityId) {
      const { data: target } = await db
        .from(item.entity_kind as "person" | "company" | "project")
        .select("name")
        .eq("id", decision.entityId)
        .single();
      message = target
        ? `Filed under ${target.name}. Future mentions will resolve there.`
        : "Correction saved.";
    } else {
      message = "Correction saved.";
    }
  }

  const status =
    decision.action === "approve"
      ? "approved"
      : decision.action === "reject"
        ? "rejected"
        : "corrected";

  const { error: updateError } = await db
    .from("review_item")
    .update({
      status,
      correction:
        decision.action === "correct"
          ? ({ entityId: decision.entityId, patch: decision.patch ?? null } as never)
          : null,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", item.id);

  if (updateError) {
    return { ok: false, message: "Could not record the decision.", remembered };
  }

  const audit: Inserts<"audit_log">[] = [
    {
      workspace_id: workspaceId,
      entity_kind: item.entity_kind,
      entity_id:
        createdId ??
        (decision.action === "correct" ? decision.entityId : null) ??
        item.id,
      action: decision.action,
      reason: `review queue: ${item.reason}`,
      confidence: item.confidence,
      prev_value: { status: "pending", proposed } as never,
      new_value: { status, decision } as never,
      source_ids: item.source_ids,
      approved_by: resolvedBy,
    },
  ];

  const { error: auditError } = await db.from("audit_log").insert(audit);
  if (auditError) console.warn("[rob-os] could not audit review decision:", auditError);

  return { ok: true, message, remembered };
}
