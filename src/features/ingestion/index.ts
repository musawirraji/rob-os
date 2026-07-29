// Public API of the `ingestion` feature.
// Other features import from here and nowhere else inside this slice.

export { ingestSource } from "./application/ingestSource";
export type { IngestDeps } from "./application/ingestSource";

export { chunkText, estimateTokens } from "./domain/chunking";
export { validateExtraction } from "./domain/validation";
export {
  resolve,
  matchName,
  normalizeName,
  scoreCandidate,
  AUTO_MATCH_THRESHOLD,
  REVIEW_FLOOR,
  AMBIGUITY_MARGIN,
} from "./domain/resolution";
export type {
  ResolutionCandidate,
  ResolutionDecision,
  ScoredCandidate,
} from "./domain/resolution";

export type { EmbeddingPort, ExtractionPort, SummaryPort } from "./domain/ports";
export type { PrincipalContext } from "./domain/prompts";
export type {
  IngestionReport,
  ParsedSource,
  PendingChunk,
  SourceExtraction,
} from "./domain/types";

export { parseFile } from "./services/parsers";
export type { ParsedFile, RawFile } from "./services/parsers";
export { extractWithClaude, summariseWithClaude } from "./services/claudeExtraction";
