import "server-only";

import { completeStructured, completeText } from "@shared/services/llm";

import { EXTRACTION_SCHEMA } from "../domain/extractionSchema";
import {
  EXTRACTION_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
  buildExtractionPrompt,
  buildSummaryPrompt,
} from "../domain/prompts";
import type { ExtractionPort, SummaryPort } from "../domain/ports";
import type { SourceExtraction } from "../domain/types";

/**
 * Claude-backed implementations of the extraction and summary ports.
 *
 * Extraction runs on the fast tier: it is per-chunk-volume work with a fixed
 * schema, so capability matters less than cost. Summaries run on the strong tier
 * because they produce text the user reads and trusts.
 */

const EMPTY_EXTRACTION: SourceExtraction = {
  people: [],
  companies: [],
  projects: [],
  commitments: [],
  tasks: [],
  decisions: [],
  risks: [],
  openQuestions: [],
  sentiment: "unknown",
  gist: "",
};

/** Structured outputs guarantee the shape, but a null field still needs a floor. */
function withDefaults(partial: Partial<SourceExtraction>): SourceExtraction {
  return {
    people: partial.people ?? [],
    companies: partial.companies ?? [],
    projects: partial.projects ?? [],
    commitments: partial.commitments ?? [],
    tasks: partial.tasks ?? [],
    decisions: partial.decisions ?? [],
    risks: partial.risks ?? [],
    openQuestions: partial.openQuestions ?? [],
    sentiment: partial.sentiment ?? EMPTY_EXTRACTION.sentiment,
    gist: partial.gist ?? "",
  };
}

export const extractWithClaude: ExtractionPort = async (source, principal) => {
  const result = await completeStructured<Partial<SourceExtraction>>({
    tier: "fast",
    system: EXTRACTION_SYSTEM_PROMPT,
    prompt: buildExtractionPrompt(source, principal),
    schema: EXTRACTION_SCHEMA,
    // A long transcript yields a lot of records; truncation here would silently
    // drop commitments, so give it room.
    maxTokens: 12_000,
  });

  return result === null ? null : withDefaults(result);
};

export const summariseWithClaude: SummaryPort = async (
  subject,
  excerpts,
  principal,
) => {
  if (excerpts.length === 0) return null;

  return completeText({
    tier: "strong",
    system: SUMMARY_SYSTEM_PROMPT,
    prompt: buildSummaryPrompt(subject, excerpts, principal),
    maxTokens: 1_200,
    // A four-sentence summary does not need deep reasoning, and this runs once
    // per touched entity per ingest.
    effort: "medium",
  });
};
