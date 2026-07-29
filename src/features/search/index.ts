// Public API of the `search` feature.
// Other features import from here and nowhere else inside this slice.

export { search } from "./services/searchRepository";
export type { SearchGroup, SearchHit, SearchResponse } from "./domain/types";
