import "server-only";

import type { AdminClient } from "@shared/services/supabase/adminClient";

/**
 * Stores original artefacts in Supabase Storage.
 *
 * Uploaded before anything is parsed, so a capture is never lost to a parser
 * failure — §7's "store the original immediately" is only true if it happens
 * first. Failure to store is reported, not thrown: the source still gets ingested
 * from the bytes in memory, it just carries no `storage_path`.
 */

export const SOURCE_BUCKET = "sources";

/** Strips anything that would make a storage key ambiguous or traversable. */
function safeName(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "file";
  return base
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

export type StoredOriginal = {
  path: string | null;
  reason: string | null;
};

export async function storeOriginal(
  db: AdminClient,
  workspaceId: string,
  filename: string,
  bytes: Uint8Array,
  contentType: string | null,
): Promise<StoredOriginal> {
  // Workspace-prefixed and timestamped: keys never collide, and every object is
  // attributable to a workspace from the path alone.
  const path = `${workspaceId}/${Date.now()}-${safeName(filename)}`;

  const { error } = await db.storage.from(SOURCE_BUCKET).upload(path, bytes, {
    contentType: contentType ?? "application/octet-stream",
    upsert: false,
  });

  if (error) {
    console.warn("[rob-os] could not store the original:", error.message);
    return { path: null, reason: `original not stored: ${error.message}` };
  }

  return { path, reason: null };
}

/**
 * A short-lived signed URL, so "open the original" works without making the
 * bucket public. Ten minutes is long enough to read a document and short enough
 * that a leaked link is not a standing hole.
 */
export async function signedUrlFor(
  db: AdminClient,
  storagePath: string,
  expiresInSeconds = 600,
): Promise<string | null> {
  const { data, error } = await db.storage
    .from(SOURCE_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data) {
    console.warn("[rob-os] could not sign the storage URL:", error?.message);
    return null;
  }
  return data.signedUrl;
}
