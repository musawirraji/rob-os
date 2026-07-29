import type { ProvenanceLabel } from "@shared/interfaces/provenance";

import type { AnswerClaim, AskAnswer, Citation, RawSynthesis } from "./types";

/**
 * The enforcement layer.
 *
 * The prompt asks the model to cite everything. This makes it structurally
 * impossible not to: a claim with no valid citation never reaches the caller, so
 * a model that ignores the contract produces a thin answer or an abstention — not
 * a confident uncited one. That asymmetry is the whole design. The prompt is
 * persuasion; this is the guarantee.
 *
 * Everything stripped here is reported, so a misbehaving model shows up as a
 * degraded answer with a reason rather than as a silent quality drift.
 */

export type ValidationNote = {
  claim: string;
  reason: string;
};

export type ValidatedAnswer = {
  claims: AnswerClaim[];
  abstained: string[];
  grounded: boolean;
  notes: ValidationNote[];
};

const VALID_LABELS: ProvenanceLabel[] = ["fact", "inference", "recommendation"];

function normaliseLabel(raw: string): ProvenanceLabel {
  const lower = raw.trim().toLowerCase();
  if ((VALID_LABELS as string[]).includes(lower)) return lower as ProvenanceLabel;
  // An unrecognised label is treated as the weaker of the two. Guessing upward
  // would let a mislabelled inference render with a FACT tag.
  return "inference";
}

/**
 * Phrases that pretend to answer while conceding there is no source. The model is
 * told not to produce these; if one appears anyway it is converted into an honest
 * abstention rather than shown to the user as an answer.
 */
const WEASEL_PATTERNS: RegExp[] = [
  /\bit('s| is) (unclear|not clear|uncertain)\b/i,
  /\bno (explicit )?(information|source|mention|record|evidence) (is )?(available|provided|given)\b/i,
  /\bcannot be (determined|established|confirmed) from\b/i,
  /\bthe (excerpts|sources|documents) do(n't| not) (say|mention|specify|indicate)\b/i,
  /\bnot (specified|mentioned|stated) in the (excerpts|sources|context)\b/i,
  /\bI (don't|do not) have (a source|enough|any) /i,
];

export function validateSynthesis(
  raw: RawSynthesis,
  citations: Citation[],
): ValidatedAnswer {
  const notes: ValidationNote[] = [];
  const validIndices = new Set(citations.map((citation) => citation.index));
  const claims: AnswerClaim[] = [];
  const abstained = [...(raw.abstained ?? [])].map((entry) => entry.trim()).filter(Boolean);

  for (const candidate of raw.claims ?? []) {
    const text = (candidate.text ?? "").trim();
    if (text.length === 0) continue;

    // Keep only citations that point at an excerpt we actually retrieved. A
    // hallucinated index is the easiest way to fake groundedness.
    const cited = [...new Set(candidate.citations ?? [])].filter((index) =>
      validIndices.has(index),
    );

    const invalid = (candidate.citations ?? []).filter(
      (index) => !validIndices.has(index),
    );
    if (invalid.length > 0) {
      notes.push({
        claim: text,
        reason: `dropped citation(s) not in the retrieved set: ${invalid.join(", ")}`,
      });
    }

    if (cited.length === 0) {
      // The central rule. An uncited claim becomes an abstention, because the
      // honest version of "I believe this but cannot show you why" is silence.
      notes.push({ claim: text, reason: "no valid citation — moved to abstained" });
      abstained.push(text);
      continue;
    }

    const weasel = WEASEL_PATTERNS.find((pattern) => pattern.test(text));
    if (weasel) {
      notes.push({
        claim: text,
        reason: "hedged non-answer — moved to abstained",
      });
      abstained.push(text);
      continue;
    }

    claims.push({ text, label: normaliseLabel(candidate.label ?? ""), citations: cited });
  }

  // Grounded means the whole question was answered from sources. One abstention
  // is enough to make the answer partial, and the UI must say so.
  const grounded = claims.length > 0 && abstained.length === 0;

  return { claims, abstained: [...new Set(abstained)], grounded, notes };
}

/**
 * Drops excerpts nothing ended up citing, and renumbers so the user is not shown
 * a source list with gaps in it. Renumbering happens last, after validation, so
 * the model's indices are checked against what was actually retrieved.
 */
export function pruneUncitedSources(
  claims: AnswerClaim[],
  citations: Citation[],
): { claims: AnswerClaim[]; sources: Citation[] } {
  const used = new Set(claims.flatMap((claim) => claim.citations));
  const kept = citations.filter((citation) => used.has(citation.index));

  const renumber = new Map<number, number>();
  kept.forEach((citation, position) => renumber.set(citation.index, position + 1));

  return {
    claims: claims.map((claim) => ({
      ...claim,
      citations: claim.citations
        .map((index) => renumber.get(index))
        .filter((index): index is number => index !== undefined)
        .sort((a, b) => a - b),
    })),
    sources: kept.map((citation, position) => ({ ...citation, index: position + 1 })),
  };
}

/** The answer returned when the engine cannot run. Never a fabricated one. */
export function unavailableAnswer(question: string, reason: string): AskAnswer {
  return {
    question,
    claims: [],
    abstained: [question],
    grounded: false,
    sources: [],
    objects: [],
    suggestedNext: [],
    unavailableReason: reason,
  };
}
