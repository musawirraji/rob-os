/**
 * Schema for the synthesis call. Forcing this shape is what makes citations a
 * structural property of the answer rather than a formatting convention the model
 * may or may not follow.
 */
export const SYNTHESIS_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["claims", "abstained", "suggestedNext"],
  properties: {
    claims: {
      type: "array",
      description:
        "One entry per assertion. Every entry must cite at least one excerpt.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "label", "citations"],
        properties: {
          text: {
            type: "string",
            description: "One assertion, in plain prose. No citation markers in the text.",
          },
          label: {
            type: "string",
            enum: ["fact", "inference"],
            description:
              "fact when an excerpt states it; inference when you joined excerpts to reach it.",
          },
          citations: {
            type: "array",
            items: { type: "integer" },
            description:
              "Excerpt numbers supporting this claim. Must not be empty and must not include a number you were not given.",
          },
        },
      },
    },
    abstained: {
      type: "array",
      items: { type: "string" },
      description:
        "Each part of the question the excerpts do not support, written as the specific thing you could not establish.",
    },
    suggestedNext: {
      type: "array",
      items: { type: "string" },
      description: "Up to three short next actions, phrased as the user would say them.",
    },
  },
};
