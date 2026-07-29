import type { ObjectKind, SourceKind } from "@shared/interfaces/objects";
import type { ProvenanceLabel } from "@shared/interfaces/provenance";

/**
 * The Ask contract (brief §8).
 *
 * The shape here is the contract, not a convenience: a claim cannot exist without
 * a citation list, and the parts of a question that could not be answered are a
 * first-class field rather than something the prose is left to imply.
 */

/** A retrieved passage, numbered so claims can point at it. */
export type Citation = {
  /** 1-based, as rendered in the answer. */
  index: number;
  sourceId: string;
  chunkId: string | null;
  kind: SourceKind;
  title: string;
  occurredAt: string | null;
  excerpt: string;
};

export type AnswerClaim = {
  text: string;
  label: ProvenanceLabel;
  /** Citation indices. Never empty on a claim that survives validation. */
  citations: number[];
};

/** An object worth surfacing in the "objects in this answer" rail. */
export type AnsweredObject = {
  kind: ObjectKind;
  id: string;
  name: string;
  subtitle: string | null;
};

export type AskAnswer = {
  question: string;
  claims: AnswerClaim[];
  /**
   * Sub-questions the corpus does not support. Rendered verbatim in the abstain
   * block — "I don't have a source for that. I won't guess."
   */
  abstained: string[];
  /**
   * True only when the question was answered entirely from sources: at least one
   * claim, every claim cited, and nothing abstained.
   */
  grounded: boolean;
  sources: Citation[];
  objects: AnsweredObject[];
  suggestedNext: string[];
  /** Populated when the engine could not run at all, rather than faking an answer. */
  unavailableReason: string | null;
};

/** What the synthesis model is asked to return, before validation. */
export type RawSynthesis = {
  claims: { text: string; label: string; citations: number[] }[];
  abstained: string[];
  suggestedNext: string[];
};

/**
 * Step 1 of the engine. Deliberately deterministic: a question is routed by what
 * it literally asks for, so the same question always retrieves the same way and a
 * regression in retrieval cannot be blamed on a model's mood.
 */
export type QueryPlan = {
  /** Which object tables to also look up directly, alongside chunk retrieval. */
  objectTypes: ObjectKind[];
  /** Restrict retrieval to sources at or after this instant. */
  since: string | null;
  /** Restrict retrieval to these kinds of source. */
  sourceKinds: SourceKind[] | null;
  /**
   * Questions after an exact string (a figure, a date, a name) lean on full text;
   * questions about a situation lean on the vector arm.
   */
  semanticWeight: number;
  fullTextWeight: number;
  matchCount: number;
  /** Human-readable, surfaced in the ask log so a bad plan is debuggable. */
  rationale: string[];
};
