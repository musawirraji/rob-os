import { ProjectsScreen, loadProjectsScreen } from "@features/projects";
import { Screen } from "@shared/components/Screen";
import { routes } from "@shared/navigation/routes";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Screen
      activePath={routes.projects()}
      render={async ({ db, workspaceId }) => (
        <ProjectsScreen state={await loadProjectsScreen(db, workspaceId)} />
      )}
    />
  );
}
