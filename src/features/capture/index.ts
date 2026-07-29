// Public API of the `capture` feature.
// Other features import from here and nowhere else inside this slice.

export { captureText, captureFile } from "./application/captureSource";
export type { CaptureResult } from "./application/captureSource";
export { loadInboxScreen } from "./application/loadInboxScreen";
export type { InboxRow, InboxState } from "./application/loadInboxScreen";
export { InboxScreen } from "./ui/screens/InboxScreen";
export { CaptureForms } from "./ui/components/CaptureForms";
