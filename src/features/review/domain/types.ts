import type { Enums } from "@shared/interfaces/db";
import type { SourceKind } from "@shared/interfaces/objects";

/**
 * The Review Queue. Every item is something the pipeline was not confident enough
 * to file on its own, and every item resolves in exactly one action.
 */

export type ReviewCandidate = {
  id: string;
  name: string;
  score: number;
  reasons: string[];
};

export type ReviewItem = {
  id: string;
  reason: Enums<"review_reason">;
  entityKind: string;
  confidence: number;
  /** The passage the user reads to decide. Without it the queue is guesswork. */
  excerpt: string | null;
  proposed: Record<string, unknown>;
  candidates: ReviewCandidate[];
  source: { id: string; kind: SourceKind; title: string } | null;
  createdAt: string;
  /** Human-readable summary of what filing this would do. */
  headline: string;
  detail: string | null;
};

/**
 * The three actions. `correct` carries either the candidate the user picked or an
 * edited version of the proposal — both are corrections, and both are remembered.
 */
export type ReviewDecision =
  | { action: "approve" }
  | { action: "reject" }
  | { action: "correct"; entityId: string | null; patch?: Record<string, unknown> };

export type ReviewOutcome = {
  ok: boolean;
  /** What changed, for the confirmation line. */
  message: string;
  /** True when the decision was stored as a hint for future resolution. */
  remembered: boolean;
};

/**
 * Why this item needs a person, in the user's language rather than an enum.
 *
 * This lives in `domain` rather than beside the query that used to own it because
 * it is pure copy with no I/O — and because the Review card is a client component.
 * Re-exporting it from a `server-only` module pulled the entire ingestion service
 * graph into the browser bundle and failed the build.
 */
export const REASON_COPY: Record<Enums<"review_reason">, string> = {
  low_confidence: "Not confident enough to file",
  ambiguous_entity: "Could be more than one record",
  conflicting_sources: "Sources disagree",
  unparsed_date: "Could not read the date",
  inference_needs_confirm: "Inferred — needs confirming",
};
