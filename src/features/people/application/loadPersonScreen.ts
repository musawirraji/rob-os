import "server-only";

import type { AdminClient } from "@shared/services/supabase/adminClient";
import type { SourceKind } from "@shared/interfaces/objects";
import { provenanceLabel, type ProvenanceLabel } from "@shared/interfaces/provenance";
import { loadObjectFeed, relativeAge, type FeedEntry } from "@shared/services/objectFeed";
import type { DetailFact } from "@shared/components/objectPage";
import { COOLING_AFTER_DAYS } from "@shared/constants";

/** The one data call behind a Person record. */

export type PersonState = {
  id: string;
  name: string;
  initials: string;
  subtitle: string | null;
  facts: DetailFact[];
  summary: {
    text: string | null;
    label: ProvenanceLabel;
    confidence: number;
    updatedAt: string | null;
    sources: { sourceId: string; kind: SourceKind; title: string }[];
  };
  feed: FeedEntry[];
  /** Tab counts, so the record says how much is behind each one. */
  counts: { activity: number; commitments: number; decisions: number };
  companyHref: string | null;
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export async function loadPersonScreen(
  db: AdminClient,
  workspaceId: string,
  personId: string,
  now: Date = new Date(),
): Promise<PersonState | null> {
  const today = now.toISOString().slice(0, 10);

  const { data: person, error } = await db
    .from("person")
    .select(
      "id, name, role, relationship_type, relationship_strength, last_interaction, timezone, next_action, current_context, current_context_fact_type, current_context_confidence, current_context_source_ids, current_context_updated_at, company:company!person_company_id_fkey(id, name)",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", personId)
    .maybeSingle();

  if (error) console.warn("[rob-os] loadPersonScreen failed:", error.message);
  if (!person) return null;

  const company = person.company as { id: string; name: string } | null;

  const feed = await loadObjectFeed(db, workspaceId, "person_id", personId, today);

  const { data: commitments } = await db
    .from("commitment")
    .select("id, owed_by_principal, deadline, status")
    .eq("workspace_id", workspaceId)
    .or(`owed_by_person_id.eq.${personId},owed_to_person_id.eq.${personId}`)
    .in("status", ["open", "due", "overdue"]);

  const yours = (commitments ?? []).filter((row) => row.owed_by_principal);
  const overdue = yours.filter((row) => row.deadline !== null && row.deadline < today);

  const silentDays = person.last_interaction
    ? Math.floor(
        (now.getTime() - new Date(person.last_interaction).getTime()) / 86_400_000,
      )
    : null;

  const facts: DetailFact[] = [];

  // Both default to `unknown` until a source establishes them, and "unknown ·
  // unknown" reads like a rendering fault rather than an honest gap.
  const relationshipParts = [person.relationship_type, person.relationship_strength]
    .filter((part) => part !== "unknown")
    .map((part) => part.replace(/_/g, " "));

  facts.push({
    label: "Relationship",
    value: relationshipParts.length > 0 ? relationshipParts.join(" · ") : "not established",
  });

  if (company) facts.push({ label: "Company", value: company.name });

  facts.push({
    label: "Last interaction",
    value: person.last_interaction
      ? `${relativeAge(person.last_interaction, now)} ago`
      : "none recorded",
    // A contact who has gone quiet with a promise outstanding is the single most
    // actionable state in the product, so the panel says so rather than making the
    // user work it out from a date.
    tone:
      silentDays !== null && silentDays >= COOLING_AFTER_DAYS
        ? yours.length > 0
          ? "crit"
          : "warn"
        : undefined,
  });

  facts.push({
    label: "Open commitments",
    value:
      yours.length > 0
        ? `${yours.length} yours${overdue.length > 0 ? ` · ${overdue.length} overdue` : ""}`
        : `${(commitments ?? []).length} total`,
    tone: overdue.length > 0 ? "crit" : undefined,
  });

  if (person.next_action) facts.push({ label: "Next action", value: person.next_action });
  if (person.timezone) facts.push({ label: "Timezone", value: person.timezone });

  const sourceIds = person.current_context_source_ids;
  const sources: PersonState["summary"]["sources"] = [];

  if (sourceIds.length > 0) {
    const { data } = await db.from("source").select("id, kind, title").in("id", sourceIds);
    for (const row of data ?? []) {
      sources.push({ sourceId: row.id, kind: row.kind, title: row.title });
    }
  }

  return {
    id: person.id,
    name: person.name,
    initials: initialsOf(person.name),
    subtitle: [person.role, company?.name].filter(Boolean).join(" · ") || null,
    facts,
    summary: {
      text: person.current_context,
      label: provenanceLabel(person.current_context_fact_type),
      confidence: person.current_context_confidence,
      updatedAt: person.current_context_updated_at,
      sources,
    },
    feed,
    counts: {
      activity: feed.length,
      commitments: (commitments ?? []).length,
      decisions: feed.filter((entry) => entry.kind === "decision").length,
    },
    companyHref: company ? `/companies/${company.id}` : null,
  };
}
