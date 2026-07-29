import { ObjectList } from "@shared/components/objectPage";
import type { CompaniesState } from "@features/companies";

export function CompaniesScreen({ state }: { state: CompaniesState }) {
  return (
    <div className="ro-index">
      <h1 className="ro-index__title">Companies</h1>
      <p className="ro-index__sub">Every organisation the corpus mentions.</p>
      <ObjectList
        label="Companies"
        rows={state.rows}
        emptyTitle="No companies yet"
        emptyBody="Companies appear as sources naming them are ingested."
      />
    </div>
  );
}
