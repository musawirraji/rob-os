import "server-only";

import type { AdminClient } from "@shared/services/supabase/adminClient";
import type { Enums } from "@shared/interfaces/db";

import type { ReviewCandidate, ReviewItem } from "../domain/types";

/** The one data call behind the Review Queue screen. */

export type ReviewState = {
  items: ReviewItem[];
  pendingCount: number;
};

/** Why this item needs a person, in the user's language rather than an enum. */
const REASON_COPY: Record<Enums<"review_reason">, string> = {
  low_confidence: "Not confident enough to file",
  ambiguous_entity: "Could be more than one record",
  conflicting_sources: "Sources disagree",
  unparsed_date: "Could not read the date",
  inference_needs_confirm: "Inferred — needs confirming",
};

function describe(entityKind: string, proposed: Record<string, unknown>): {
  headline: string;
  detail: string | null;
} {
  const str = (key: string): string | null => {
    const value = proposed[key];
    return typeof value === "string" && value.length > 0 ? value : null;
  };

  switch (entityKind) {
    case "person":
      return {
        headline: str("name") ?? "Unnamed person",
        detail: [str("role"), str("companyName"), str("email")]
          .filter((part): part is string => part !== null)
          .join(" · ") || null,
      };
    case "company":
      return { headline: str("name") ?? "Unnamed company", detail: str("industry") };
    case "project":
      return { headline: str("name") ?? "Unnamed project", detail: str("outcome") };
    case "commitment": {
      const what = str("what") ?? "A commitment";
      const owedBy = str("owedBy");
      const owedTo = str("owedTo");
      const unresolved = str("unresolvedParty");
      return {
        headline: what,
        detail:
          (owedBy && owedTo ? `${owedBy} → ${owedTo}` : null) +
            (unresolved ? ` · could not identify "${unresolved}"` : "") || null,
      };
    }
    case "task":
      return { headline: str("description") ?? "A task", detail: str("owner") };
    case "decision":
      return { headline: str("statement") ?? "A decision", detail: str("decisionMaker") };
    default:
      return { headline: entityKind, detail: null };
  }
}

export async function loadReviewScreen(
  db: AdminClient,
  workspaceId: string,
): Promise<ReviewState> {
  const { data, error } = await db
    .from("review_item")
    .select("*, source:source(id, kind, title)")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    // Lowest confidence first: the items most likely to be wrong are the ones
    // worth a human's attention soonest.
    .order("confidence", { ascending: true })
    .limit(50);

  if (error) {
    console.warn("[rob-os] could not load the review queue:", error);
    return { items: [], pendingCount: 0 };
  }

  const items: ReviewItem[] = (data ?? []).map((row) => {
    const proposed = (row.proposed ?? {}) as Record<string, unknown>;
    const { headline, detail } = describe(row.entity_kind, proposed);
    const source = row.source as
      | { id: string; kind: Enums<"source_kind">; title: string }
      | null;

    return {
      id: row.id,
      reason: row.reason,
      entityKind: row.entity_kind,
      confidence: row.confidence,
      excerpt: row.excerpt,
      proposed,
      candidates: (Array.isArray(row.candidates) ? row.candidates : []) as ReviewCandidate[],
      source: source ? { id: source.id, kind: source.kind, title: source.title } : null,
      createdAt: row.created_at,
      headline,
      detail,
    };
  });

  return { items, pendingCount: items.length };
}

export { REASON_COPY };
