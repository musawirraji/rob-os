import type { ReactNode } from "react";

import { getWorkspaceContext } from "@shared/services/workspace";

import { EmptyState } from "./primitives";

/**
 * Resolves the workspace for a screen and hands it to the render function.
 *
 * Route files stay one-liners: they say what to render with the context, and
 * nothing else. Without this every page repeats the same eight lines of
 * workspace-resolution and no-workspace handling.
 *
 * The shell is *not* here — it lives in `app/(shell)/layout.tsx` so it survives a
 * navigation. This component only produces the content that goes inside it.
 */
export async function Screen({
  render,
}: {
  render: (context: {
    db: NonNullable<Awaited<ReturnType<typeof getWorkspaceContext>>>["db"];
    workspaceId: string;
  }) => Promise<ReactNode>;
}) {
  const context = await getWorkspaceContext();

  if (!context) {
    return (
      <EmptyState
        title="No workspace yet"
        body="Set the Supabase environment variables and run the seed corpus to get started."
      />
    );
  }

  return render({ db: context.db, workspaceId: context.workspaceId });
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
