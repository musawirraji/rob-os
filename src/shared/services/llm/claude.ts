import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { isClaudeConfigured, serverEnv } from "@shared/config/serverEnv";

import {
  CLAUDE_MODELS,
  TIER_CAPABILITIES,
  type Effort,
  type ModelTier,
} from "./models";

let cached: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!isClaudeConfigured) {
    console.warn("[rob-os] ANTHROPIC_API_KEY is not set — Claude calls will no-op.");
    return null;
  }

  cached ??= new Anthropic({ apiKey: serverEnv.anthropicApiKey });
  return cached;
}

export type CompleteOptions = {
  tier: ModelTier;
  system: string;
  prompt: string;
  maxTokens?: number;
  effort?: Effort;
};

export type StructuredOptions = CompleteOptions & {
  /** JSON Schema the response is constrained to. `additionalProperties: false`. */
  schema: Record<string, unknown>;
};

function buildRequest(options: CompleteOptions): Anthropic.MessageCreateParamsNonStreaming {
  const caps = TIER_CAPABILITIES[options.tier];
  const effort = options.effort ?? caps.defaultEffort;

  return {
    model: CLAUDE_MODELS[options.tier],
    max_tokens: options.maxTokens ?? caps.defaultMaxTokens,
    system: options.system,
    messages: [{ role: "user" as const, content: options.prompt }],
    ...(caps.supportsEffort ? { output_config: { effort } } : {}),
  };
}

function describeFailure(scope: string, error: unknown): void {
  if (error instanceof Anthropic.RateLimitError) {
    console.warn(`[rob-os] Claude rate-limited during ${scope}.`);
  } else if (error instanceof Anthropic.APIConnectionError) {
    console.warn(`[rob-os] Could not reach Claude during ${scope}.`);
  } else if (error instanceof Anthropic.APIError) {
    console.warn(`[rob-os] Claude error ${error.status} during ${scope}:`, error.message);
  } else {
    console.warn(`[rob-os] Unexpected failure during ${scope}:`, error);
  }
}

/**
 * Plain text completion. Returns `null` on refusal, misconfiguration, or any
 * API failure — services degrade rather than throwing out of the call.
 */
export async function completeText(options: CompleteOptions): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const response = await client.messages.create(buildRequest(options));

    if (response.stop_reason === "refusal") {
      console.warn("[rob-os] Claude declined the request.", response.stop_details);
      return null;
    }

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    return text.length > 0 ? text : null;
  } catch (error) {
    describeFailure("completeText", error);
    return null;
  }
}

/**
 * Schema-constrained completion. Used by ingestion (entity/commitment/decision
 * extraction) and by the Ask engine, both of which need parseable output rather
 * than prose. Returns `null` on any failure.
 */
export async function completeStructured<T>(
  options: StructuredOptions,
): Promise<T | null> {
  const client = getClient();
  if (!client) return null;

  const { schema, ...rest } = options;
  const request = buildRequest(rest);
  const outputConfig = {
    ...(request.output_config ?? {}),
    format: { type: "json_schema" as const, schema },
  };

  try {
    const response = await client.messages.create({ ...request, output_config: outputConfig });

    if (response.stop_reason === "refusal") {
      console.warn("[rob-os] Claude declined the request.", response.stop_details);
      return null;
    }

    if (response.stop_reason === "max_tokens") {
      console.warn("[rob-os] Structured output truncated — raise maxTokens.");
      return null;
    }

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    return JSON.parse(text) as T;
  } catch (error) {
    describeFailure("completeStructured", error);
    return null;
  }
}
