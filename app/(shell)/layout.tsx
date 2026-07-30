import type { ReactNode } from "react";

import { signOut } from "@app/login/actions";
import { AppShell } from "@shared/components/AppShell";
import { getShellCounts, getWorkspaceContext } from "@shared/services/workspace";

/**
 * The shell layout, wrapping every signed-in screen.
 *
 * Living here rather than inside each page is what lets `loading.tsx` work: the
 * sidebar and topbar stay mounted across a navigation and only `.ro-content` is
 * replaced by the route's skeleton. Login and the auth callback sit outside this
 * group precisely because they must render without the frame.
 *
 * `getWorkspaceContext` is request-memoised, so resolving it here costs the pages
 * below nothing.
 */

export const dynamic = "force-dynamic";

export default async function ShellLayout({ children }: { children: ReactNode }) {
  const context = await getWorkspaceContext();

  if (!context) {
    // No workspace is a real state — a fresh account before the seed has run. The
    // frame still renders so the app does not look broken; the page inside says
    // what to do about it.
    return <AppShell>{children}</AppShell>;
  }

  const counts = await getShellCounts(context.db, context.workspaceId);

  return (
    <AppShell counts={counts} account={{ email: context.userEmail, signOut }}>
      {children}
    </AppShell>
  );
}
