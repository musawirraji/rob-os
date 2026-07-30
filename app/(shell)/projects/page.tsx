import { ProjectsScreen, loadProjectsScreen } from "@features/projects";
import { Screen } from "@shared/components/Screen";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Screen
      render={async ({ db, workspaceId }) => (
        <ProjectsScreen state={await loadProjectsScreen(db, workspaceId)} />
      )}
    />
  );
}
