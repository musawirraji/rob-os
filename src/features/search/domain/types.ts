import type { ObjectKind, TileColor } from "@shared/interfaces/objects";

/**
 * The palette returns real objects, grouped by type — never a list of text
 * matches. Picking a result navigates to a record, so every hit carries the href
 * and the tile colour it renders with.
 */
export type SearchHit = {
  kind: Extract<ObjectKind, "person" | "company" | "project" | "meeting">;
  tile: TileColor;
  id: string;
  name: string;
  /** The one line of context that tells the user which record this is. */
  subtitle: string | null;
  href: string;
};

export type SearchGroup = {
  kind: SearchHit["kind"];
  label: string;
  hits: SearchHit[];
};

export type SearchResponse = {
  query: string;
  groups: SearchGroup[];
  total: number;
};
