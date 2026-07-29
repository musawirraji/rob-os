import { ObjectList } from "@shared/components/objectPage";
import type { ProjectsState } from "@features/projects";

export function ProjectsScreen({ state }: { state: ProjectsState }) {
  return (
    <div className="ro-index">
      <h1 className="ro-index__title">Projects</h1>
      <p className="ro-index__sub">At-risk work first.</p>
      <ObjectList
        label="Projects"
        rows={state.rows}
        emptyTitle="No projects yet"
        emptyBody="Projects appear as sources describing them are ingested."
      />
    </div>
  );
}
