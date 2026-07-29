// Public API of the `ask` feature.
// Other features import from here and nowhere else inside this slice.

export { ask } from "./application/ask";
export type { AskDeps, AskOptions } from "./application/ask";

export { planQuery } from "./domain/queryPlan";
export {
  validateSynthesis,
  pruneUncitedSources,
  unavailableAnswer,
} from "./domain/validateAnswer";
export type { ValidatedAnswer, ValidationNote } from "./domain/validateAnswer";
export { ASK_SYSTEM_PROMPT, buildAskPrompt } from "./domain/prompts";
export type { AskPromptContext, StructuredFact } from "./domain/prompts";
export { SYNTHESIS_SCHEMA } from "./domain/synthesisSchema";
export type {
  AnswerClaim,
  AnsweredObject,
  AskAnswer,
  Citation,
  QueryPlan,
  RawSynthesis,
} from "./domain/types";

export { synthesiseWithClaude } from "./services/claudeSynthesis";
export type { SynthesisPort } from "./services/claudeSynthesis";
export { retrieve } from "./services/retrieval";
export { AskScreen } from "./ui/screens/AskScreen";
