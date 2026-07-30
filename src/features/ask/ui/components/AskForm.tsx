"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@shared/components/Icon";
import { routes } from "@shared/navigation/routes";

/**
 * The Ask input.
 *
 * The question stays in the URL, so an answer is linkable and survives a refresh.
 * That part is unchanged — this is still a GET form pointed at `/ask`, and with
 * JavaScript unavailable it submits natively and the route skeleton takes over.
 *
 * With JavaScript, the submit is wrapped in a transition instead. The reason is
 * specific: a plain navigation swaps the whole content area for the route skeleton,
 * which takes the question the user just typed off the screen while they wait
 * several seconds for it to be answered. A transition keeps the current view — the
 * question, and any previous answer — and reports progress inline. You can still
 * read what you asked while it is being worked on.
 *
 * Enter submits, because the form is a real form. Nothing here re-implements that.
 */
export function AskForm({ defaultValue }: { defaultValue: string }) {
  const [question, setQuestion] = useState(defaultValue);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const trimmed = question.trim();
  const empty = trimmed.length === 0;

  return (
    <>
      <form
        className={`ro-ask__form${pending ? " is-busy" : ""}`}
        action={routes.ask()}
        method="get"
        onSubmit={(event) => {
          // Let the browser handle it if there is nothing to enhance.
          if (empty) {
            event.preventDefault();
            return;
          }
          event.preventDefault();
          startTransition(() => {
            router.push(`${routes.ask()}?q=${encodeURIComponent(trimmed)}`);
          });
        }}
      >
        <Icon name="search" size={16} />
        <input
          className="ro-ask__input"
          type="text"
          name="q"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="What did I promise Sarah this week?"
          autoComplete="off"
          aria-busy={pending || undefined}
        />
        <button
          className={`ro-btn ro-btn--primary${pending ? " is-busy" : ""}`}
          type="submit"
          aria-disabled={pending || empty || undefined}
        >
          {pending ? (
            <span className="ro-spinner is-busy" aria-hidden />
          ) : (
            <Icon name="send" size={14} />
          )}
          Ask
        </button>
      </form>

      {/* `role="status"` rather than an alert: this is progress, not a problem. */}
      {pending ? (
        <p className="ro-ask__working" role="status">
          Retrieving from your sources, then checking every claim has one. Nothing is
          shown until it does.
        </p>
      ) : null}
    </>
  );
}
