import "server-only";

import type { AdminClient } from "./supabase/adminClient";
import type { SourceKind, StatusTone } from "@shared/interfaces/objects";
import type { FactType } from "@shared/interfaces/provenance";

/**
 * The source-cited activity feed behind every object page.
 *
 * Person, company and project all need the same thing: everything the corpus
 * records about this object, newest first, each row carrying the source it came
 * from. So the query lives here once rather than three times.
 *
 * A feed entry with no source is not returned. On an object page the feed *is*
 * the evidence — a row the user cannot click through to is worse than an absent
 * one, because it looks like a fact.
 */

export type FeedSourceChip = {
  sourceId: string;
  kind: SourceKind;
  title: string;
};

export type FeedEntry = {
  id: string;
  kind: "mention" | "commitment" | "decision" | "task";
  title: string;
  detail: string | null;
  occurredAt: string | null;
  factType: FactType;
  badgeLabel: string | null;
  badgeTone: StatusTone | null;
  sources: FeedSourceChip[];
};

export type ObjectColumn = "person_id" | "company_id" | "project_id";

/** Relative age, as the reference renders it: 2d, 6d, now. */
export function relativeAge(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "";
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d";
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo` : `${Math.floor(months / 12)}y`;
}

function chipsFor(
  sourceIds: string[],
  sourceById: Map<string, FeedSourceChip>,
): FeedSourceChip[] {
  return sourceIds
    .map((id) => sourceById.get(id))
    .filter((chip): chip is FeedSourceChip => chip !== undefined);
}

export async function loadObjectFeed(
  db: AdminClient,
  workspaceId: string,
  column: ObjectColumn,
  entityId: string,
  today: string,
): Promise<FeedEntry[]> {
  // Mentions carry the excerpt, which is what makes a feed row quotable.
  const mentions = await db
    .from("source_mention")
    .select("id, excerpt, fact_type, confidence, source:source(id, kind, title, occurred_at)")
    .eq("workspace_id", workspaceId)
    .eq(column, entityId)
    .order("created_at", { ascending: false })
    .limit(40);

  if (mentions.error) {
    console.warn("[rob-os] object feed mentions failed:", mentions.error.message);
  }

  const sourceById = new Map<string, FeedSourceChip>();
  const entries: FeedEntry[] = [];

  for (const row of mentions.data ?? []) {
    const source = row.source as
      | { id: string; kind: SourceKind; title: string; occurred_at: string | null }
      | null;
    if (!source) continue;

    sourceById.set(source.id, {
      sourceId: source.id,
      kind: source.kind,
      title: source.title,
    });

    entries.push({
      id: `mention-${row.id}`,
      kind: "mention",
      title: source.title,
      detail: row.excerpt,
      occurredAt: source.occurred_at,
      factType: row.fact_type,
      badgeLabel: null,
      badgeTone: null,
      sources: [
        { sourceId: source.id, kind: source.kind, title: source.title },
      ],
    });
  }

  // Commitments only attach to a person — a company does not owe you anything, a
  // named person does.
  if (column === "person_id") {
    const commitments = await db
      .from("commitment")
      .select(
        "id, what, deadline, status, fact_type, confidence, source_ids, owed_by_principal, owed_to_principal",
      )
      .eq("workspace_id", workspaceId)
      .or(`owed_by_person_id.eq.${entityId},owed_to_person_id.eq.${entityId}`)
      .order("deadline", { ascending: true, nullsFirst: false });

    if (commitments.error) {
      console.warn("[rob-os] object feed commitments failed:", commitments.error.message);
    }

    const missing = [
      ...new Set(
        (commitments.data ?? [])
          .flatMap((row) => row.source_ids)
          .filter((id) => !sourceById.has(id)),
      ),
    ];

    if (missing.length > 0) {
      const { data } = await db.from("source").select("id, kind, title").in("id", missing);
      for (const row of data ?? []) {
        sourceById.set(row.id, { sourceId: row.id, kind: row.kind, title: row.title });
      }
    }

    for (const row of commitments.data ?? []) {
      const overdue =
        row.deadline !== null &&
        row.deadline < today &&
        ["open", "due", "overdue"].includes(row.status);
      const dueToday = row.deadline === today;

      entries.push({
        id: `commitment-${row.id}`,
        kind: "commitment",
        title: row.owed_by_principal ? "Commitment — yours" : "Waiting on them",
        detail: row.what,
        occurredAt: row.deadline,
        factType: row.fact_type,
        badgeLabel: overdue
          ? `Overdue · ${row.deadline}`
          : dueToday
            ? "Due today"
            : row.deadline
              ? `Due ${row.deadline}`
              : "No deadline",
        badgeTone: overdue ? "crit" : dueToday ? "warn" : "neutral",
        sources: chipsFor(row.source_ids, sourceById),
      });
    }
  }

  // Decisions reach a person through `decision_person`, so a decision that binds
  // someone shows on their page even if they did not make it.
  if (column === "person_id" || column === "project_id") {
    const query = db
      .from("decision")
      .select("id, statement, decided_on, fact_type, source_ids, reversible")
      .eq("workspace_id", workspaceId)
      .order("decided_on", { ascending: false, nullsFirst: false })
      .limit(20);

    const decisions =
      column === "project_id"
        ? await query.eq("project_id", entityId)
        : await query.eq("decision_maker_person_id", entityId);

    const missing = [
      ...new Set(
        (decisions.data ?? [])
          .flatMap((row) => row.source_ids)
          .filter((id) => !sourceById.has(id)),
      ),
    ];

    if (missing.length > 0) {
      const { data } = await db.from("source").select("id, kind, title").in("id", missing);
      for (const row of data ?? []) {
        sourceById.set(row.id, { sourceId: row.id, kind: row.kind, title: row.title });
      }
    }

    for (const row of decisions.data ?? []) {
      entries.push({
        id: `decision-${row.id}`,
        kind: "decision",
        title: "Decision",
        detail: row.statement,
        occurredAt: row.decided_on,
        factType: row.fact_type,
        badgeLabel: row.reversible === false ? "Hard to reverse" : null,
        badgeTone: row.reversible === false ? "warn" : null,
        sources: chipsFor(row.source_ids, sourceById),
      });
    }
  }

  return entries
    .filter((entry) => entry.sources.length > 0)
    .sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));
}

/**
 * Formats an instant in the workspace's own timezone.
 *
 * A meeting stored as `14:00+01:00` renders as "13:00" if you slice the ISO
 * string, which is the wrong answer for a user in London — and on a product about
 * meetings, showing the wrong time is not a cosmetic problem.
 */
export function formatInZone(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    // An invalid timezone should not blank the field.
    return iso.slice(0, 16).replace("T", " ");
  }
}
