import type { Database } from "./database.types";

/**
 * Shorthands over the generated schema types. `database.types.ts` is produced by
 * `npm run db:types` and must never be hand-edited — regenerate it after every
 * migration so the types cannot drift from the database.
 */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Inserts<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type Updates<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];

/** One row from the hybrid retrieval RPC, ready to become a citation. */
export type MatchedChunk =
  Database["public"]["Functions"]["match_chunks"]["Returns"][number];

export type MatchChunksArgs =
  Database["public"]["Functions"]["match_chunks"]["Args"];

export type { Database };
