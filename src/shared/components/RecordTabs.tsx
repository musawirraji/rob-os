"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";

import type { ObjectTab } from "./objectPage";

/**
 * The tab bar on a record, plus the panel it reveals.
 *
 * **Switching tab does not touch the server.** Every panel here is a different
 * view of the same already-loaded feed — Commitments is `feed.filter(...)`, not a
 * second query — so making each tab a real navigation meant re-running the whole
 * record loader, a full round trip to another region, to re-filter an array the
 * browser was already holding. That is the entire reason tabs felt slow.
 *
 * The URL still changes, because a tab on a record is worth linking to and worth
 * having in history. It is updated with `history.pushState` rather than a router
 * navigation, so the address bar, the back button and a copied link all behave
 * exactly as before while nothing is refetched. A `popstate` listener keeps the
 * panel in step when the user goes back.
 *
 * The tabs remain real links. Middle-click and "open in new tab" still work, and
 * with JavaScript unavailable they fall back to the server-rendered `?tab=` route
 * they always were.
 */
export function RecordTabs({
  basePath,
  initial,
  tabs,
  panels,
}: {
  basePath: string;
  initial: string;
  tabs: ObjectTab[];
  /** Every panel, keyed by tab id. Only the active one is rendered. */
  panels: Record<string, ReactNode>;
}) {
  const [active, setActive] = useState(initial);

  const hrefFor = (id: string) => (id === "overview" ? basePath : `${basePath}?tab=${id}`);

  // Someone pressing Back expects the panel to follow the URL.
  useEffect(() => {
    const onPop = () => {
      const tab = new URLSearchParams(window.location.search).get("tab") ?? "overview";
      setActive(tab);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <>
      <div className="ro-tabs" role="tablist">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <Link
              key={tab.id}
              className={`ro-tabs__tab${isActive ? " is-active" : ""}`}
              href={hrefFor(tab.id)}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? "page" : undefined}
              onClick={(event) => {
                // Leave modified clicks to the browser: they mean "somewhere else".
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                if (tab.id === active) return;
                setActive(tab.id);
                window.history.pushState(null, "", hrefFor(tab.id));
              }}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 ? (
                <span className="ro-tabs__count">{tab.count}</span>
              ) : null}
            </Link>
          );
        })}
      </div>

      <div className="ro-object__stack">{panels[active] ?? panels.overview}</div>
    </>
  );
}
