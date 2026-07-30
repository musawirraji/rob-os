"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Icon, type IconName } from "./Icon";

/**
 * A submit button that knows when its own form is in flight.
 *
 * `useFormStatus` reads the state of the nearest enclosing form, which is why this
 * has to be a separate client component rather than a prop on the server-rendered
 * one — the hook only works from inside the form it reports on.
 *
 * **`sharesForm` is for forms with more than one submit button.** The hook reports
 * the *form*, so on a two-button form a plain `pending` check lights both up: press
 * "Email me a link" and "Sign in" starts spinning too, which tells the user
 * something false. Setting `sharesForm` makes the button also require that it was
 * the one pressed.
 *
 * That is tracked by click rather than by submitting a `name`/`value` pair, which
 * was the obvious first attempt and is wrong: React uses a submit button's `name`
 * to carry the `$ACTION_ID` of its `formAction`, so setting our own name silently
 * breaks the no-JavaScript submit path for that button. Implicit submission (Enter
 * in a text field) dispatches a click on the default button, so this covers the
 * keyboard too.
 *
 * It is `aria-disabled` while pending, not `disabled`. A genuinely disabled button
 * leaves the tab order the moment it is pressed, which throws focus to the top of
 * the document mid-action; some screen readers also drop the accessible name as it
 * changes. Blocking clicks and Enter gives the same protection against a double
 * submit without those side effects — and `BusyFields` still applies a real
 * `disabled` to the surrounding group, which is the guard that works with no
 * JavaScript at all.
 *
 * `busyLabel` is for work long enough to need explaining — ingestion runs a whole
 * pipeline, and "Capture" sitting there silently reads as a failed click. Short
 * actions keep their label so the button does not resize under the cursor.
 */
export function SubmitButton({
  children,
  busyLabel,
  variant = "primary",
  icon,
  className,
  sharesForm = false,
  formAction,
}: {
  children: ReactNode;
  busyLabel?: string;
  variant?: "primary" | "secondary" | "ghost";
  icon?: IconName;
  className?: string;
  /** Set when another submit button shares this form. */
  sharesForm?: boolean;
  /** Lets several buttons share one form and still trigger different actions. */
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    if (!pending) setPressed(false);
  }, [pending]);

  const busy = pending && (!sharesForm || pressed);

  return (
    <button
      type="submit"
      formAction={formAction}
      className={`ro-btn ro-btn--${variant}${busy ? " is-busy" : ""}${
        className ? ` ${className}` : ""
      }`}
      aria-disabled={pending || undefined}
      onClick={(event) => {
        if (pending) {
          event.preventDefault();
          return;
        }
        setPressed(true);
      }}
      onKeyDown={(event) => {
        if (pending && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
        }
      }}
    >
      {/* The spinner replaces the icon rather than joining it, so the button keeps
          its width and nothing nudges sideways at the moment of the click. */}
      {busy ? (
        <span className="ro-spinner is-busy" aria-hidden />
      ) : icon ? (
        <Icon name={icon} size={14} />
      ) : null}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
