import type { ReactNode } from "react";

import Link from "next/link";

import { APP_NAME } from "@shared/constants";
import { routes } from "@shared/navigation/routes";

import { Icon } from "./Icon";
import { CommandPaletteTrigger } from "./CommandPaletteTrigger";
import { SideNav, type ShellCounts } from "./SideNav";

/**
 * The persistent frame: sidebar, search, capture.
 *
 * This renders in the route-group layout rather than inside each page, which is
 * what makes navigation feel instant — the sidebar and topbar stay mounted and
 * interactive while only the content area swaps to its skeleton. Rendering the
 * shell per page meant every click tore the whole frame down and rebuilt it.
 */

export type { ShellCounts };

export function AppShell({
  children,
  counts = {},
  account,
}: {
  children: ReactNode;
  counts?: ShellCounts;
  /** Signed-in identity and the sign-out action. Absent before auth is wired. */
  account?: { email: string | null; signOut: () => Promise<void> };
}) {
  return (
    <div className="ro-shell">
      <aside className="ro-sidebar">
        <Link className="ro-brand" href="/">
          <span className="ro-brand__mark">
            <Icon name="ask" size={14} />
          </span>
          <span className="ro-brand__name">{APP_NAME}</span>
        </Link>

        <SideNav counts={counts} />

        {account ? (
          <div className="ro-signout">
            {account.email ? (
              <p className="ro-signout__who" title={account.email}>
                {account.email}
              </p>
            ) : null}
            <form action={account.signOut}>
              <button className="ro-btn ro-btn--ghost" type="submit">
                Sign out
              </button>
            </form>
          </div>
        ) : null}
      </aside>

      <div className="ro-main">
        <header className="ro-topbar">
          <CommandPaletteTrigger />
          {/* Through the registry, like everything else. This is the one href the
              shell renders twice — the sidebar has it too — and when the two
              disagreed about prefetching they thrashed the same cache entry
              between them, refetching the route without end. */}
          <Link className="ro-btn ro-btn--primary" href={routes.inbox()}>
            <Icon name="capture" size={14} />
            Capture
          </Link>
        </header>
        <main className="ro-content">{children}</main>
      </div>
    </div>
  );
}
