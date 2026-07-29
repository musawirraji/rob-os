"use client";

import { useCallback, useEffect, useState } from "react";

import { Icon } from "./Icon";
import { CommandPalette } from "./CommandPalette";

/**
 * The search field in the top bar, and the ⌘K binding that opens the palette.
 * Split out from the shell so the frame itself stays a server component.
 */
export function CommandPaletteTrigger() {
  const [open, setOpen] = useState(false);

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      setOpen((current) => !current);
    }
    if (event.key === "Escape") setOpen(false);
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  return (
    <>
      <button className="ro-search" type="button" onClick={() => setOpen(true)}>
        <Icon name="search" size={15} />
        <span className="ro-search__placeholder">Search everything</span>
        <kbd className="ro-kbd">⌘K</kbd>
      </button>
      {open ? <CommandPalette onClose={() => setOpen(false)} /> : null}
    </>
  );
}
