import { Icon } from "@shared/components/Icon";
import {
  Card,
  CardHeader,
  EmptyState,
  SectionLabel,
  SourceChip,
  StatusBadge,
} from "@shared/components/primitives";
import { REASON_COPY, type ReviewItem, type ReviewState } from "@features/review";

/**
 * The Review Queue. Render-only — the actions are server actions passed in.
 *
 * One item, one decision, no modal. The excerpt is shown in full because the whole
 * job here is judging a claim against the passage it came from, and hiding the
 * passage behind a click would make the queue a guessing game.
 *
 * `correct` is offered as a specific candidate rather than a free-text field:
 * picking "this is Sarah Lin" is the correction that teaches resolution something,
 * and it is also the fastest thing to click.
 */

type Actions = {
  approve: (formData: FormData) => Promise<void>;
  reject: (formData: FormData) => Promise<void>;
  correct: (formData: FormData) => Promise<void>;
};

function confidenceTone(confidence: number): "crit" | "warn" | "neutral" {
  if (confidence < 0.6) return "crit";
  if (confidence < 0.8) return "warn";
  return "neutral";
}

function ReviewCard({ item, actions }: { item: ReviewItem; actions: Actions }) {
  return (
    <article className="ro-review">
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
                <form action={actions.correct}>
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
        <form action={actions.approve}>
          <input type="hidden" name="id" value={item.id} />
          <button className="ro-btn ro-btn--primary" type="submit">
            <Icon name="fact" size={14} />
            {item.candidates.length > 0 ? "File as new" : "Approve"}
          </button>
        </form>
        <form action={actions.reject}>
          <input type="hidden" name="id" value={item.id} />
          <button className="ro-btn ro-btn--secondary" type="submit">
            Not a record
          </button>
        </form>
        <p className="ro-review__note">
          Whatever you pick is remembered — the same mention won&rsquo;t come back.
        </p>
      </footer>
    </article>
  );
}

export function ReviewScreen({
  state,
  actions,
  message,
}: {
  state: ReviewState;
  actions: Actions;
  message: string | null;
}) {
  return (
    <div className="ro-index">
      <h1 className="ro-index__title">Review Queue</h1>
      <p className="ro-index__sub">
        Everything the pipeline wasn&rsquo;t confident enough to file on its own.
        Lowest confidence first.
      </p>

      {message ? (
        <p className="ro-review__flash">
          <Icon name="fact" size={13} />
          {message}
        </p>
      ) : null}

      {state.items.length === 0 ? (
        <Card padded={false}>
          <CardHeader label="Queue" aside="0" />
          <EmptyState
            title="Nothing to review"
            body="Everything the pipeline extracted was confident enough to file itself."
          />
        </Card>
      ) : (
        <div className="ro-review__stack">
          {state.items.map((item) => (
            <ReviewCard key={item.id} item={item} actions={actions} />
          ))}
        </div>
      )}
    </div>
  );
}
