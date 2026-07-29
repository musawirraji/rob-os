import { PeopleScreen, loadPeopleScreen } from "@features/people";
import { Screen } from "@shared/components/Screen";
import { routes } from "@shared/navigation/routes";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Screen
      activePath={routes.people()}
      render={async ({ db, workspaceId }) => (
        <PeopleScreen state={await loadPeopleScreen(db, workspaceId)} />
      )}
    />
  );
}
