import type { ParsedSource } from "./types";

/**
 * Prompts are domain, not service: they encode the product's rules about what
 * may be claimed, so they belong next to the types they produce and stay free of
 * I/O.
 */

export type PrincipalContext = {
  name: string;
  company: string | null;
  emails: string[];
  timezone: string;
};

export const EXTRACTION_SYSTEM_PROMPT = `You extract structured records from one work document at a time for a private personal operating system.

The system you are feeding makes one promise to its user: every claim it shows links to the source it came from, and anything it merely inferred is labelled as an inference. Your output is what makes that promise keepable, so the rules below are not style preferences.

Rules:

1. Extract only what the document supports. If the document does not say it, it does not exist. Do not fill gaps from general knowledge, and do not complete a pattern you think you recognise.
2. Every item needs a verbatim quote from the document. Copy the span exactly — do not tidy, paraphrase, or stitch two passages together. An item you cannot quote is an item you must not return.
3. Label honestly. Use direct_source_fact only when the document states it outright. Use extracted when you pulled it from surrounding wording. Use inference when you concluded it. Most things are extracted; inference is not a way to smuggle in a guess.
4. Set confidence to what you actually believe, not to what looks decisive. A hedge in the source ("might", "probably", "I think") caps confidence below 0.7. Something stated plainly and unambiguously can go above 0.9. A downstream review queue exists precisely so that a low number is useful rather than embarrassing.
5. Resolve relative dates against the document date given below, and return ISO dates. "By Friday" in a Thursday document is the next day's Friday. If a date is genuinely vague ("soon", "next quarter"), return null rather than inventing precision.
6. Names as written. Do not normalise "Sarah" to "Sarah Lin" unless the document itself makes that link — a separate resolution step handles that, and it needs the raw form to do its job.
7. A commitment is a specific obligation to a named party. General intent ("we should look at pricing") is not a commitment. Use commitmentType explicit when it was stated as a promise, implied when it follows from what was said, waiting when the principal is owed something by someone else.
8. Return empty arrays freely. A document that contains no decisions should return no decisions. Padding the output with weak items is worse than returning little.`;

export function buildExtractionPrompt(
  source: ParsedSource,
  principal: PrincipalContext,
): string {
  const principalLine = principal.company
    ? `${principal.name} of ${principal.company}`
    : principal.name;

  return [
    `The workspace owner (the "principal") is ${principalLine}.`,
    principal.emails.length > 0
      ? `Their email addresses: ${principal.emails.join(", ")}.`
      : null,
    `First person in this document — "I", "me", "we", "my" — refers to the principal when the author is the principal.`,
    `Use the literal string "principal" for owedBy / owedTo / owner when the party is the principal.`,
    "",
    `Document kind: ${source.kind}`,
    `Document title: ${source.title}`,
    `Document date: ${source.occurredAt ?? "unknown"} (timezone ${principal.timezone})`,
    source.author ? `Author: ${source.author}` : null,
    source.participants.length > 0
      ? `Participants: ${source.participants.join("; ")}`
      : null,
    "",
    "--- BEGIN DOCUMENT ---",
    source.text,
    "--- END DOCUMENT ---",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export const SUMMARY_SYSTEM_PROMPT = `You write the living summary shown at the top of a person, company, or project page in a private work operating system.

The summary sits directly above a row of source citations, and the user can click any of them. So it has to be true of the excerpts you are given and nothing else.

Rules:

1. Two to four sentences. It is read at a glance, before a call.
2. Only what the excerpts support. No advice, no encouragement, no filler about how the relationship is "progressing well" unless an excerpt says so.
3. Lead with what changed or what is outstanding — the reason the user opened this page. Background goes second, if at all.
4. If the principal owes this party something, say so plainly and say by when.
5. Name the tension if there is one. A summary that reads as smooth when the underlying situation is stuck is a failure, not tact.
6. Write prose. No headings, no bullets, no bold.
7. Do not cite inline. The interface renders the citations underneath; your job is the text.`;

export type SummarySubject = {
  kind: "person" | "company" | "project";
  name: string;
  /** Existing facts already on the record, so the summary can be consistent. */
  facts: string[];
};

export function buildSummaryPrompt(
  subject: SummarySubject,
  excerpts: { title: string; occurredAt: string | null; content: string }[],
  principal: PrincipalContext,
): string {
  const lines = [
    `The principal is ${principal.name}${principal.company ? ` of ${principal.company}` : ""}.`,
    `Write the living summary for this ${subject.kind}: ${subject.name}.`,
  ];

  if (subject.facts.length > 0) {
    lines.push("", "Known record:", ...subject.facts.map((fact) => `- ${fact}`));
  }

  lines.push("", "Excerpts, most recent first:");

  for (const excerpt of excerpts) {
    lines.push(
      "",
      `[${excerpt.occurredAt ?? "undated"}] ${excerpt.title}`,
      excerpt.content,
    );
  }

  return lines.join("\n");
}
