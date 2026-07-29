import type { Enums } from "./db";
import type { SourceKind } from "./objects";

/**
 * Provenance is the product. Every extracted field carries where it came from,
 * whether it is a fact or an inference, and how confident the system is. A
 * conclusion without a source is never stored as one, and never rendered as one.
 */
export type FactType = Enums<"fact_type">;

/** What the UI shows: the quiet `fact` / `inference` tag, nothing louder. */
export type ProvenanceLabel = "fact" | "inference" | "recommendation";

export function provenanceLabel(factType: FactType): ProvenanceLabel {
  switch (factType) {
    // Traceable to something a source actually says.
    case "direct_source_fact":
    case "user_stated":
    case "extracted":
      return "fact";
    // The model's reading across sources. Always labelled as such.
    case "inference":
      return "inference";
    case "recommendation":
      return "recommendation";
  }
}

export type Provenance = {
  factType: FactType;
  /** 0–1. Below `REVIEW_THRESHOLD` the item is routed to the Review Queue. */
  confidence: number;
  /** Never empty for a stored claim — this is what the citation resolves to. */
  sourceIds: string[];
};

/** A citation as it renders: `[icon] Source · title`. */
export type SourceChip = {
  sourceId: string;
  kind: SourceKind;
  title: string;
};
