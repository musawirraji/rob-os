"use client";

import { useState } from "react";

import { Icon } from "@shared/components/Icon";
import { SubmitButton } from "@shared/components/SubmitButton";
import { SectionLabel, SourceChip, StatusBadge } from "@shared/components/primitives";
// Imported from this slice's own domain, not through the barrel. The barrel also
// re-exports the server-side query modules, and pulling those into a client
// component drags `server-only` — and the whole ingestion graph — into the browser
// bundle. The barrel rule is for *cross*-feature imports; inside a slice, reach for
// the module you actually need.
import { REASON_COPY, type ReviewItem } from "../../domain/types";

/**
 * One queued item and its decision.
 *
 * **A form per action, not one form with several buttons.** The tidier-looking
 * version does not work here: a candidate button needs to send both its own
 * `entityId` *and* a `formAction`, and React uses a submit button's `name` to carry
 * the action id — so setting `name="entityId"` on it quietly breaks the submit for
 * anyone without JavaScript. Separate forms with hidden inputs keep that path
 * correct, which matters because filing a correction is how the user teaches entity
 * resolution, and losing it silently would be worse than any layout win.
 *
 * The cost of separate forms is that `useFormStatus` can only see one of them, so it
 * cannot disable the card as a whole. Hence the small piece of state here: any
 * submit marks the card busy, and the surrounding `<fieldset disabled>` shuts every
 * control in it — including the buttons in the *other* forms. Without that, a slow
 * approve invites an impatient second click on "Not a record" and files two
 * decisions against one item.
 *
 * With JavaScript off, `busy` simply never becomes true and the forms behave as
 * plain forms. The guard is an enhancement; the correctness is in the markup.
 */
export function ReviewCard({
  item,
  actions,
}: {
  item: ReviewItem;
  actions: {
    approve: (formData: FormData) => Promise<void>;
    reject: (formData: FormData) => Promise<void>;
    correct: (formData: FormData) => Promise<void>;
  };
}) {
  const [busy, setBusy] = useState(false);
  const markBusy = () => setBusy(true);

  return (
    <article className={`ro-review${busy ? " is-busy" : ""}`}>
      <fieldset className="ro-fields" disabled={busy}>
        <header className="ro-review__head">
          <div>
            <p className="ro-review__kind">
              {item.entityKind}
              <StatusBadge tone={confidenceTone(item.confidence)}>
                {Math.round(item.confidence * 100)}% confident
              </StatusBadge>
            </p>
            <h2 className="ro-review__headline">{item.headline}</h2>
            {item.detail ? <p className="ro-review__detail">{item.detail}</p> : null}
          </div>
          <p className="ro-review__reason">{REASON_COPY[item.reason]}</p>
        </header>

        {item.excerpt ? (
          <blockquote className="ro-review__excerpt">{item.excerpt}</blockquote>
        ) : null}

        {item.source ? (
          <div className="ro-review__source">
            <SourceChip kind={item.source.kind} title={item.source.title} />
          </div>
        ) : null}

        {item.candidates.length > 0 ? (
          <div className="ro-review__candidates">
            <SectionLabel>Could be</SectionLabel>
            <ul className="ro-review__candidateList">
              {item.candidates.map((candidate) => (
                <li key={candidate.id}>
                  <form action={actions.correct} onSubmit={markBusy}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="entityId" value={candidate.id} />
                    <button className="ro-review__candidate" type="submit">
                      <span className="ro-review__candidateName">{candidate.name}</span>
                      <span className="ro-review__candidateScore">
                        {Math.round(candidate.score * 100)}%
                        {candidate.reasons.length > 0
                          ? ` · ${candidate.reasons[0]}`
                          : ""}
                      </span>
                      <Icon name="fact" size={13} />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <footer className="ro-review__actions">
          <form action={actions.approve} onSubmit={markBusy}>
            <input type="hidden" name="id" value={item.id} />
            <SubmitButton icon="fact" busyLabel="Filing…">
              {item.candidates.length > 0 ? "File as new" : "Approve"}
            </SubmitButton>
          </form>
          <form action={actions.reject} onSubmit={markBusy}>
            <input type="hidden" name="id" value={item.id} />
            <SubmitButton variant="secondary" busyLabel="Discarding…">
              Not a record
            </SubmitButton>
          </form>
          <p className="ro-review__note">
            Whatever you pick is remembered — the same mention won&rsquo;t come back.
          </p>
        </footer>
      </fieldset>
    </article>
  );
}

function confidenceTone(confidence: number): "crit" | "warn" | "neutral" {
  if (confidence < 0.6) return "crit";
  if (confidence < 0.8) return "warn";
  return "neutral";
}
