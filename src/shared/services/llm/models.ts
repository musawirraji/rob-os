/**
 * Model routing. Rob OS never sends one giant prompt — work is split across two
 * tiers so that the cheap, high-volume path stays cheap and the path that
 * produces user-visible claims stays as capable as possible.
 *
 * fast   — classification, entity extraction, entity resolution. Runs once per
 *          chunk during ingestion, so volume is high and each call is narrow.
 * strong — living summaries and Ask synthesis. These produce the cited claims
 *          the product is judged on, so they get the most capable model.
 */
export const CLAUDE_MODELS = {
  fast: "claude-haiku-4-5",
  strong: "claude-opus-5",
} as const;

export type ModelTier = keyof typeof CLAUDE_MODELS;

/** Reasoning depth. Only the strong tier accepts it — Haiku 4.5 rejects it. */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

type TierCapabilities = {
  /** `output_config.effort` is rejected on Haiku 4.5. */
  readonly supportsEffort: boolean;
  readonly defaultEffort: Effort;
  readonly defaultMaxTokens: number;
};

export const TIER_CAPABILITIES: Record<ModelTier, TierCapabilities> = {
  fast: {
    supportsEffort: false,
    defaultEffort: "low",
    defaultMaxTokens: 8_000,
  },
  strong: {
    supportsEffort: true,
    // Ask synthesis is the correctness-critical path; the grounding contract is
    // worth the tokens.
    defaultEffort: "high",
    defaultMaxTokens: 16_000,
  },
};
