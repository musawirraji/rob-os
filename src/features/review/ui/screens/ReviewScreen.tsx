import { Icon } from "@shared/components/Icon";
import { Card, CardHeader, EmptyState } from "@shared/components/primitives";
import type { ReviewState } from "@features/review";

import { ReviewCard } from "../components/ReviewCard";

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
