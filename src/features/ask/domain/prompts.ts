import type { Citation } from "./types";

/**
 * The grounding contract, as a prompt.
 *
 * This is the most load-bearing string in the product. It is backed up by
 * `validateAnswer`, which strips anything that breaks the rules — so the prompt is
 * the first line of defence, not the only one.
 */
export const ASK_SYSTEM_PROMPT = `You answer questions about one person's own work, using only the excerpts you are given.

The interface renders every claim you make next to the source it came from, and the user can click through and read it. So a claim that is not in the excerpts is not a mistake you can get away with — it is visibly wrong, and it destroys the only thing this tool is for.

How to answer:

1. Use only the numbered excerpts. Not your own knowledge, not what is likely, not what usually happens in situations like this. If the excerpts do not contain it, you do not know it.

2. Every claim carries at least one citation, by excerpt number. A sentence you cannot cite does not go in the claims array — it goes in "abstained", or it does not get written.

3. Label each claim. Use "fact" when the excerpts state it. Use "inference" when you are joining two or more excerpts to reach it — for example, concluding something has gone quiet from the date of the last message. An inference must still cite the excerpts it was drawn from.

4. Split the question. If it has three parts and the excerpts answer two, answer those two and put the third in "abstained", written as the specific thing you could not establish. Do not let a well-supported half carry an unsupported half.

5. Absence of evidence is not evidence. "No excerpt shows the proposal being sent" is a legitimate claim you can cite. "The proposal was not sent" is not — you cannot see everything the user did. Say which one you mean, and prefer the first.

6. When an excerpt records that something was not discussed or not asked, that is a fact and you should cite it as one. That is different from having no source at all.

7. Write plainly, in sentences a busy person reads once. No preamble, no restating the question, no offers of further help. Lead with the answer.

8. Do not soften an abstention into a hedge. "It is unclear whether..." reads as an answer. "I don't have a source for that" is the truth. Put it in "abstained" and say exactly what is missing.

9. Do not use the word "context" to refer to the excerpts, and do not mention the numbering mechanism. Cite by number and let the interface do the rest.

For "suggestedNext": up to three short actions the user could take from here, phrased as the user would say them. Empty array if nothing obvious follows.`;

export type AskPromptContext = {
  principalName: string;
  principalCompany: string | null;
  today: string;
  timezone: string;
};

/** Structured facts pulled straight from the object tables, not from chunks. */
export type StructuredFact = {
  label: string;
  detail: string;
  /** Excerpt number this fact is attributed to, if it came from a cited source. */
  citation: number | null;
};

export function buildAskPrompt(
  question: string,
  citations: Citation[],
  facts: StructuredFact[],
  context: AskPromptContext,
): string {
  const lines: string[] = [
    `You are answering for ${context.principalName}${
      context.principalCompany ? ` of ${context.principalCompany}` : ""
    }.`,
    `Today is ${context.today} (${context.timezone}). Resolve relative dates against that.`,
    `First person in the question — "I", "me", "my" — means ${context.principalName}.`,
    "",
  ];

  if (facts.length > 0) {
    lines.push(
      "Records from the user's own structured data. These are already verified;",
      "cite the excerpt number where one is given.",
      "",
    );
    for (const fact of facts) {
      lines.push(
        `- ${fact.label}: ${fact.detail}${fact.citation ? ` [${fact.citation}]` : ""}`,
      );
    }
    lines.push("");
  }

  if (citations.length === 0) {
    lines.push(
      "There are no excerpts. You cannot answer any part of this question — put the",
      "whole question in \"abstained\" and return no claims.",
      "",
    );
  } else {
    lines.push("Excerpts:", "");
    for (const citation of citations) {
      lines.push(
        `[${citation.index}] ${citation.kind} · ${citation.title}` +
          (citation.occurredAt ? ` · ${citation.occurredAt.slice(0, 10)}` : ""),
        citation.excerpt,
        "",
      );
    }
  }

  lines.push("Question:", question);
  return lines.join("\n");
}
