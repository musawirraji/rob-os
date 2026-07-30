/**
 * JSON Schema handed to Claude via `output_config.format`. Structured outputs
 * guarantee the shape, which means the pipeline never has to defend against a
 * prose answer where an object was expected.
 *
 * Constraints are deliberately limited to what structured outputs support:
 * types, enums, `required`, and `additionalProperties: false`. No minLength, no
 * numeric bounds — those are validated in `validateExtraction` instead.
 */

const provenanceProps = {
  quote: {
    type: "string",
    description:
      "Verbatim text from the source that supports this item. Must appear in the source exactly.",
  },
  factType: {
    type: "string",
    enum: ["direct_source_fact", "extracted", "inference"],
    description:
      "direct_source_fact if the source states this outright; extracted if you pulled it out of surrounding wording; inference if you concluded it.",
  },
  confidence: {
    type: "number",
    description: "0 to 1. Your honest confidence. Do not inflate.",
  },
} as const;

const provenanceRequired = ["quote", "factType", "confidence"];

const PROPERTIES: Record<string, unknown> = {
  people: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: [...provenanceRequired, "name", "role", "companyName", "email"],
      properties: {
        ...provenanceProps,
        name: { type: "string", description: "As written in the source." },
        role: { type: ["string", "null"] },
        companyName: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
      },
    },
  },
  companies: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: [...provenanceRequired, "name", "industry"],
      properties: {
        ...provenanceProps,
        name: { type: "string" },
        industry: { type: ["string", "null"] },
      },
    },
  },
  projects: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: [
        ...provenanceRequired,
        "name",
        "outcome",
        "status",
        "deadline",
        "companyName",
        "peopleInvolved",
      ],
      properties: {
        ...provenanceProps,
        name: { type: "string" },
        outcome: {
          type: ["string", "null"],
          description: "What done looks like, if the source says.",
        },
        status: {
          // No `type` alongside `enum`. The structured-output validator rejects a
          // union type declared next to an enum — it checks each enum value
          // against the union and fails on the first string, so the whole request
          // 400s with "Enum value 'not_started' does not match declared type".
          // The enum already constrains the value, and null is one of its members,
          // so the nullability survives. Every other enum in this schema pairs
          // with a plain `type: "string"`, which is fine; this was the only union.
          enum: [
            "not_started",
            "on_track",
            "at_risk",
            "slipping",
            "blocked",
            "done",
            "abandoned",
            null,
          ],
        },
        deadline: {
          type: ["string", "null"],
          description: "ISO date (YYYY-MM-DD). Null if the source is vague.",
        },
        companyName: { type: ["string", "null"] },
        peopleInvolved: {
          type: "array",
          items: { type: "string" },
          description:
            "Names the source shows working on this project. Only someone the document actually connects to it.",
        },
      },
    },
  },
  commitments: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: [
        ...provenanceRequired,
        "owedBy",
        "owedTo",
        "what",
        "deadline",
        "commitmentType",
      ],
      properties: {
        ...provenanceProps,
        owedBy: {
          type: "string",
          description:
            'Who owes it, as written. Use exactly "principal" when it is the workspace owner.',
        },
        owedTo: {
          type: "string",
          description:
            'Who it was made to. Use "principal" for the workspace owner.',
        },
        what: { type: "string" },
        deadline: {
          type: ["string", "null"],
          description:
            "ISO date. Resolve relative dates against the source date given in the prompt. Null if genuinely unstated.",
        },
        commitmentType: {
          type: "string",
          enum: ["explicit", "implied", "suggested", "delegated", "waiting"],
        },
      },
    },
  },
  tasks: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: [
        ...provenanceRequired,
        "description",
        "owner",
        "dueDate",
        "priority",
        "projectName",
      ],
      properties: {
        ...provenanceProps,
        description: { type: "string" },
        owner: { type: ["string", "null"] },
        dueDate: { type: ["string", "null"] },
        priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
        projectName: { type: ["string", "null"] },
      },
    },
  },
  decisions: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: [
        ...provenanceRequired,
        "statement",
        "decisionMaker",
        "rationale",
        "alternatives",
        "reversible",
        "peopleInvolved",
      ],
      properties: {
        ...provenanceProps,
        statement: { type: "string" },
        decisionMaker: { type: ["string", "null"] },
        rationale: { type: ["string", "null"] },
        alternatives: { type: "array", items: { type: "string" } },
        reversible: { type: ["boolean", "null"] },
        peopleInvolved: {
          type: "array",
          items: { type: "string" },
          description:
            "Others the decision binds, beyond the decision maker. Only those the document names.",
        },
      },
    },
  },
  risks: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: [...provenanceRequired, "description", "subject"],
      properties: {
        ...provenanceProps,
        description: { type: "string" },
        subject: {
          type: ["string", "null"],
          description: "The person, company or project the risk attaches to.",
        },
      },
    },
  },
  openQuestions: {
    type: "array",
    items: { type: "string" },
    description:
      "Questions this source raises but does not answer. Used later to know what the corpus cannot answer.",
  },
  sentiment: {
    type: "string",
    enum: ["positive", "neutral", "tense", "negative", "unknown"],
  },
  gist: {
    type: "string",
    description: "One or two sentences. What this source is, in plain terms.",
  },
};

/**
 * Extraction runs as two calls, not one.
 *
 * The combined schema compiled to a grammar the API refuses outright — ten
 * top-level arrays of nested objects, each carrying provenance and several
 * nullable enums, returns "The compiled grammar is too large". Splitting it also
 * happens to be what this project's own rule asks for: never one giant prompt.
 *
 * The split is along a real seam rather than an arbitrary halfway point.
 * **Entities** are the resolution spine — who and what this source is about.
 * **Claims** are what the source says happened or is owed. The two passes read the
 * same text and run concurrently, and their results are merged before anything is
 * written, so the rest of the pipeline sees exactly one extraction as before.
 */
function subset(keys: readonly string[]): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: [...keys],
    properties: Object.fromEntries(keys.map((key) => [key, PROPERTIES[key]])),
  };
}

export const ENTITY_KEYS = [
  "people",
  "companies",
  "projects",
  "sentiment",
  "gist",
] as const;
export const CLAIM_KEYS = [
  "commitments",
  "tasks",
  "decisions",
  "risks",
  "openQuestions",
] as const;

export const ENTITY_SCHEMA = subset(ENTITY_KEYS);
export const CLAIM_SCHEMA = subset(CLAIM_KEYS);
