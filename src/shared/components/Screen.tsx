import type { ReactNode } from "react";

import { signOut } from "@app/login/actions";
import { getShellCounts, getWorkspaceContext } from "@shared/services/workspace";

import { AppShell } from "./AppShell";
import { EmptyState } from "./primitives";

/**
 * Wraps a screen in the shell and resolves the workspace once.
 *
 * Route files stay one-liners: they say which path is active and what to render
 * with the context, and nothing else. Without this every page repeats the same
 * eight lines of workspace-resolution and no-workspace handling.
 */
export async function Screen({
  activePath,
  render,
}: {
  activePath: string;
  render: (context: {
    db: NonNullable<Awaited<ReturnType<typeof getWorkspaceContext>>>["db"];
    workspaceId: string;
  }) => Promise<ReactNode>;
}) {
  const context = await getWorkspaceContext();

  if (!context) {
    return (
      <AppShell activePath={activePath}>
        <EmptyState
          title="No workspace yet"
          body="Set the Supabase environment variables and run the seed corpus to get started."
        />
      </AppShell>
    );
  }

  const [content, counts] = await Promise.all([
    render({ db: context.db, workspaceId: context.workspaceId }),
    getShellCounts(context.db, context.workspaceId),
  ]);

  return (
    <AppShell
      activePath={activePath}
      counts={counts}
      account={{ email: context.userEmail, signOut }}
    >
      {content}
    </AppShell>
  );
}

/** Shown when an id in the URL does not resolve to a record. */
export function NotFoundBody({ what }: { what: string }) {
  return (
    <EmptyState
      title={`That ${what} does not exist`}
      body="It may have been merged into another record, or the link is stale."
    />
  );
}
