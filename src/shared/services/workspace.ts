import "server-only";

import { cache } from "react";

import { getSignedInUser } from "./auth";
import { getAdminSupabase, type AdminClient } from "./supabase/adminClient";

/**
 * Resolving "which workspace am I in".
 *
 * The workspace is looked up from the *signed-in user*, not taken as the first row
 * in the table. Phase 1 is still one workspace per user, but the lookup is
 * user-scoped from the start — so multi-user is a policy change, not a rewrite of
 * every screen.
 *
 * Returns null when nobody is signed in. `proxy.ts` redirects before that happens
 * on a page request; the null path covers server actions and route handlers, which
 * must not fall back to "some workspace".
 *
 * Memoised per request with React `cache`, because the shell layout and the page
 * inside it both need it. Without this every navigation resolves the user and the
 * workspace twice — two round trips to show one screen.
 */
export type WorkspaceContext = {
  db: AdminClient;
  workspaceId: string;
  principalName: string;
  userId: string;
  userEmail: string | null;
};

export const getWorkspaceContext = cache(async function getWorkspaceContext(): Promise<WorkspaceContext | null> {
  const db = getAdminSupabase();
  if (!db) return null;

  const user = await getSignedInUser();
  if (!user) return null;

  const { data, error } = await db
    .from("workspace")
    .select("id, principal_name")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("[rob-os] could not resolve the workspace:", error.message);
    return null;
  }

  if (!data) {
    // A signed-in user with no workspace is a real state — a fresh account before
    // the seed has run. Screens show their empty state rather than borrowing
    // somebody else's data.
    return null;
  }

  return {
    db,
    workspaceId: data.id,
    principalName: data.principal_name,
    userId: user.id,
    userEmail: user.email,
  };
});

/** Counts for the sidebar badges. Cheap head-only queries. */
export async function getShellCounts(
  db: AdminClient,
  workspaceId: string,
): Promise<{ inbox: number; projects: number; review: number }> {
  const [inbox, projects, review] = await Promise.all([
    db
      .from("source")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .neq("status", "ingested"),
    db
      .from("project")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .not("status", "in", "(done,abandoned)"),
    db
      .from("review_item")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "pending"),
  ]);

  return {
    inbox: inbox.count ?? 0,
    projects: projects.count ?? 0,
    review: review.count ?? 0,
  };
}
