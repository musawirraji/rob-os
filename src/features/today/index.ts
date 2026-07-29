// Public API of the `today` feature.
// Other features import from here and nowhere else inside this slice.

export { loadTodayScreen } from "./application/loadTodayScreen";
export type { TodayLine, TodaySourceChip, TodayState } from "./application/loadTodayScreen";
export { buildBrief } from "./domain/brief";
export type { BriefDraft, BriefInput, BriefLine } from "./domain/brief";
export { loadBriefInputs, storeBrief } from "./services/briefRepository";
export { TodayScreen } from "./ui/screens/TodayScreen";
