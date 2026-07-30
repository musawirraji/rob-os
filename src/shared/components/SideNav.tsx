"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

import { attentionNav, primaryNav, type NavItem } from "@shared/navigation/routes";

import { Icon } from "./Icon";

/**
 * The sidebar navigation.
 *
 * A client component for two reasons, both about feedback. It reads the pathname
 * itself, so the active row updates the instant the URL changes rather than waiting
 * for the server; and each row carries a `useLinkStatus` hint, so the row you
 * clicked marks itself while the destination loads.
 *
 * That hint is not redundant with the route skeleton. The skeleton says *something*
 * is loading; the hint says *which* thing — which matters when the answer is a
 * whole screen away and the sidebar is the only stable thing on the page.
 */

export type ShellCounts = Partial<Record<"inbox" | "projects" | "review", number>>;

/**
 * Fixed-size and always rendered, so switching it on cannot shift the row. The
 * fade is delayed in CSS: a navigation that resolves quickly never flashes it.
 */
function PendingHint() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`ro-nav__pending${pending ? " is-pending" : ""}`}
    />
  );
}

function isActive(pathname: string, href: string): boolean {
  // Exact for the root, prefix elsewhere, so /people/:id keeps People lit.
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavList({ items, counts }: { items: NavItem[]; counts: ShellCounts }) {
  const pathname = usePathname();

  return (
    <ul className="ro-nav">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const count = item.countKey ? counts[item.countKey] : undefined;

        return (
          <li key={item.href}>
            <Link
              className={`ro-nav__item${active ? " is-active" : ""}`}
              href={item.href}
              aria-current={active ? "page" : undefined}
              // Default prefetch, deliberately. `prefetch={true}` forces the full
              // payload — but every route here is `force-dynamic`, so that payload
              // is not cacheable, and the eight permanently-visible links re-fetched
              // it on each router re-render. The result was a request storm: the
              // same route pulled dozens of times a second while the page it was
              // meant to speed up never settled.
              //
              // The default fetches the loading boundary, which is what actually
              // makes a click feel instant — the skeleton appears immediately and
              // the data streams in behind it.
            >
              <Icon name={item.icon} size={15} />
              <span className="ro-nav__label">{item.label}</span>
              {count !== undefined && count > 0 ? (
                <span className="ro-nav__count">{count}</span>
              ) : null}
              <PendingHint />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function SideNav({ counts }: { counts: ShellCounts }) {
  return (
    <>
      <nav aria-label="Primary">
        <NavList items={primaryNav} counts={counts} />
      </nav>

      <nav aria-label="Attention">
        <p className="ro-eyebrow ro-sidebar__group">Attention</p>
        <NavList items={attentionNav} counts={counts} />
      </nav>
    </>
  );
}
