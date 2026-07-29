/** Anything the model is less sure about than this goes to the Review Queue. */
export const REVIEW_THRESHOLD = 0.75;

/** Treated as "this person has gone quiet" on the Today brief. */
export const COOLING_AFTER_DAYS = 5;

/** Chunking targets for ingestion. Tokens, approximate. */
export const CHUNK_TARGET_TOKENS = 500;
export const CHUNK_OVERLAP_TOKENS = 80;

/** How many chunks hybrid retrieval hands to synthesis. */
export const RETRIEVAL_TOP_K = 12;

export const APP_NAME = "Rob OS";
