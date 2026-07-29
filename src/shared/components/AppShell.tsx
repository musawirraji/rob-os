import type { ReactNode } from "react";

import { APP_NAME } from "@shared/constants";
import { attentionNav, primaryNav } from "@shared/navigation/routes";

import { Icon } from "./Icon";
import { CommandPaletteTrigger } from "./CommandPaletteTrigger";

/**
 * The persistent frame: sidebar, search, capture. Server-rendered — only the
 * palette trigger is interactive, so only that piece is a client component.
 */

export type ShellCounts = Partial<Record<"inbox" | "projects" | "review", number>>;

function NavList({
  items,
  counts,
  activePath,
}: {
  items: typeof primaryNav;
  counts: ShellCounts;
  activePath: string;
}) {
  return (
    <ul className="ro-nav">
      {items.map((item) => {
        // Exact match for the root, prefix match elsewhere, so /people/:id keeps
        // People lit.
        const active =
          item.href === "/" ? activePath === "/" : activePath.startsWith(item.href);
        const count = item.countKey ? counts[item.countKey] : undefined;

        return (
          <li key={item.href}>
            <a
              className={`ro-nav__item${active ? " is-active" : ""}`}
              href={item.href}
              aria-current={active ? "page" : undefined}
            >
              <Icon name={item.icon} size={15} />
              <span className="ro-nav__label">{item.label}</span>
              {count !== undefined && count > 0 ? (
                <span className="ro-nav__count">{count}</span>
              ) : null}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function AppShell({
  children,
  activePath,
  counts = {},
  account,
}: {
  children: ReactNode;
  activePath: string;
  counts?: ShellCounts;
  /** Signed-in identity and the sign-out action. Absent before auth is wired. */
  account?: { email: string | null; signOut: () => Promise<void> };
}) {
  return (
    <div className="ro-shell">
      <aside className="ro-sidebar">
        <a className="ro-brand" href="/">
          <span className="ro-brand__mark">
            <Icon name="ask" size={14} />
          </span>
          <span className="ro-brand__name">{APP_NAME}</span>
        </a>

        <nav aria-label="Primary">
          <NavList items={primaryNav} counts={counts} activePath={activePath} />
        </nav>

        <nav aria-label="Attention">
          <p className="ro-eyebrow ro-sidebar__group">Attention</p>
          <NavList items={attentionNav} counts={counts} activePath={activePath} />
        </nav>

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
          <a className="ro-btn ro-btn--primary" href="/inbox">
            <Icon name="capture" size={14} />
            Capture
          </a>
        </header>
        <main className="ro-content">{children}</main>
      </div>
    </div>
  );
}
