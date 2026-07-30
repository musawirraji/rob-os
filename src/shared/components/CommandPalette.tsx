"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import type { SearchResponse } from "@features/search";

import { Icon } from "./Icon";
import { ObjectTile } from "./primitives";

/**
 * ⌘K. Results are real objects grouped by type; ↑/↓ moves, ↵ opens, esc closes.
 * Keyboard-first because this is how the product is meant to be navigated.
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }

    // The controller lives out here so the cleanup can actually reach it. Aborting
    // matters more than it looks: without it a slow earlier request can resolve
    // after a newer one and overwrite good results with stale ones.
    const controller = new AbortController();
    setSearching(true);

    // Debounced so typing does not fire a request per keystroke.
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: SearchResponse | null) => {
          setResults(data);
          setSelected(0);
          setSearching(false);
        })
        .catch(() => {
          // An abort is the expected path when the query moved on, not a failure —
          // leave the spinner up, because the newer request is still running.
          if (controller.signal.aborted) return;
          setResults(null);
          setSearching(false);
        });
    }, 140);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const flat = (results?.groups ?? []).flatMap((group) => group.hits);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((current) => Math.min(current + 1, Math.max(flat.length - 1, 0)));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((current) => Math.max(current - 1, 0));
    }
    if (event.key === "Enter") {
      const hit = flat[selected];
      // router.push, not window.location — a full document load here would tear
      // down the shell to go somewhere the client router can already reach.
      if (hit) {
        router.push(hit.href);
        onClose();
      }
    }
    if (event.key === "Escape") onClose();
  };

  let cursor = -1;

  return (
    <>
      {/* Transparent catcher rather than a dimmed overlay — the surface behind
          stays readable, which is the point of a palette. */}
      <button
        className="ro-palette__catcher"
        type="button"
        aria-label="Close search"
        onClick={onClose}
      />
      <div className="ro-palette" role="dialog" aria-modal="true" aria-label="Search">
        <div className="ro-palette__field">
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            className="ro-palette__input"
            value={query}
            placeholder="Search people, projects, decisions…"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
          {/* Always rendered, so switching it on cannot shift the field. */}
          <span
            aria-hidden
            className={`ro-spinner ro-palette__spinner${searching ? " is-busy" : ""}`}
          />
        </div>

        {results && results.total > 0 ? (
          <div className="ro-palette__results">
            {results.groups.map((group) => (
              <div key={group.kind} className="ro-palette__group">
                <p className="ro-eyebrow">
                  {group.label} · {group.hits.length}
                </p>
                {group.hits.map((hit) => {
                  cursor += 1;
                  // Captured per row: `cursor` keeps moving during render, so a
                  // closure over it would see the last index, not this one.
                  const index = cursor;
                  const isSelected = index === selected;
                  return (
                    <Link
                      key={hit.id}
                      href={hit.href}
                      className={`ro-palette__row${isSelected ? " is-selected" : ""}`}
                      onClick={onClose}
                      onMouseEnter={() => setSelected(index)}
                    >
                      <ObjectTile color={hit.tile} size={22} />
                      <span className="ro-palette__name">{hit.name}</span>
                      {hit.subtitle ? (
                        <span className="ro-palette__sub">{hit.subtitle}</span>
                      ) : null}
                      {isSelected ? <kbd className="ro-kbd">↵</kbd> : null}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}

        {results && results.total === 0 ? (
          <p className="ro-palette__none">
            Nothing matches “{results.query}”. Only your own records are searched.
          </p>
        ) : null}

        <footer className="ro-palette__foot">
          <span>
            <kbd className="ro-kbd">↑</kbd>
            <kbd className="ro-kbd">↓</kbd> Navigate
          </span>
          <span>
            <kbd className="ro-kbd">↵</kbd> Open
          </span>
          <span>
            <kbd className="ro-kbd">esc</kbd> Close
          </span>
        </footer>
      </div>
    </>
  );
}
