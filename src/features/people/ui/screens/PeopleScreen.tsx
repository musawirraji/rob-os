import { ObjectList } from "@shared/components/objectPage";
import type { PeopleState } from "@features/people";

export function PeopleScreen({ state }: { state: PeopleState }) {
  return (
    <div className="ro-index">
      <h1 className="ro-index__title">People</h1>
      <p className="ro-index__sub">
        Ordered by last contact. Everyone here came out of an ingested source.
      </p>
      <ObjectList
        label="People"
        rows={state.rows}
        emptyTitle="No people yet"
        emptyBody="People appear as sources naming them are ingested."
      />
    </div>
  );
}
