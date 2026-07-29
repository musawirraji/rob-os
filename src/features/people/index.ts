// Public API of the `people` feature.
// Other features import from here and nowhere else inside this slice.

export { loadPersonScreen } from "./application/loadPersonScreen";
export type { PersonState } from "./application/loadPersonScreen";
export { loadPeopleScreen } from "./application/loadPeopleScreen";
export type { PeopleState } from "./application/loadPeopleScreen";
export { PersonScreen } from "./ui/screens/PersonScreen";
export { PeopleScreen } from "./ui/screens/PeopleScreen";
