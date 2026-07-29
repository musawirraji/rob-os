import { ObjectList } from "@shared/components/objectPage";
import type { MeetingsState } from "@features/meetings";

export function MeetingsScreen({ state }: { state: MeetingsState }) {
  return (
    <div className="ro-index">
      <h1 className="ro-index__title">Meetings</h1>
      <p className="ro-index__sub">
        Derived from ingested transcripts. Most recent first.
      </p>
      <ObjectList
        label="Meetings"
        rows={state.rows}
        emptyTitle="No meetings yet"
        emptyBody="A meeting appears when a transcript with a date is ingested."
      />
    </div>
  );
}
