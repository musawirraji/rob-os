import "server-only";

import { completeStructured } from "@shared/services/llm";

import { ASK_SYSTEM_PROMPT, buildAskPrompt, type AskPromptContext, type StructuredFact } from "../domain/prompts";
import { SYNTHESIS_SCHEMA } from "../domain/synthesisSchema";
import type { Citation, RawSynthesis } from "../domain/types";

/**
 * Synthesis runs on the strong tier. This is the one call whose output the user
 * reads and acts on, so it gets the most capable model — and `high` effort,
 * because splitting a question into what is supported and what is not is the
 * hard part of the job, not the prose.
 */
export type SynthesisPort = (
  question: string,
  citations: Citation[],
  facts: StructuredFact[],
  context: AskPromptContext,
) => Promise<RawSynthesis | null>;

export const synthesiseWithClaude: SynthesisPort = async (
  question,
  citations,
  facts,
  context,
) =>
  completeStructured<RawSynthesis>({
    tier: "strong",
    system: ASK_SYSTEM_PROMPT,
    prompt: buildAskPrompt(question, citations, facts, context),
    schema: SYNTHESIS_SCHEMA,
    maxTokens: 8_000,
    effort: "high",
  });
