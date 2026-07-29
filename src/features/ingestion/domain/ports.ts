import type { PrincipalContext, SummarySubject } from "./prompts";
import type { ParsedSource, SourceExtraction } from "./types";

/**
 * The two model-backed capabilities the pipeline needs, as domain ports.
 *
 * The pipeline depends on these signatures rather than on Claude and Voyage
 * directly, which is what lets the seed script run the whole thing against
 * recorded fixtures — every stage exercised for real except the network call.
 *
 * Both return null on failure rather than throwing: an unavailable model means a
 * stage is skipped and reported, not a half-written source.
 */

export type ExtractionPort = (
  source: ParsedSource,
  principal: PrincipalContext,
) => Promise<SourceExtraction | null>;

export type EmbeddingPort = (texts: string[]) => Promise<number[][] | null>;

export type SummaryPort = (
  subject: SummarySubject,
  excerpts: { title: string; occurredAt: string | null; content: string }[],
  principal: PrincipalContext,
) => Promise<string | null>;
