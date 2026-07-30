import { PeopleScreen, loadPeopleScreen } from "@features/people";
import { Screen } from "@shared/components/Screen";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Screen
      render={async ({ db, workspaceId }) => (
        <PeopleScreen state={await loadPeopleScreen(db, workspaceId)} />
      )}
    />
  );
}
