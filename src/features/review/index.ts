// Public API of the `review` feature.
// Other features import from here and nowhere else inside this slice.

export { applyReviewDecision } from "./application/applyReviewDecision";
export { loadReviewScreen, REASON_COPY } from "./application/loadReviewScreen";
export type { ReviewState } from "./application/loadReviewScreen";
export type {
  ReviewCandidate,
  ReviewDecision,
  ReviewItem,
  ReviewOutcome,
} from "./domain/types";
export { ReviewScreen } from "./ui/screens/ReviewScreen";
