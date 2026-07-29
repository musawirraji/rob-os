import { MeetingsScreen, loadMeetingsScreen } from "@features/meetings";
import { Screen } from "@shared/components/Screen";
import { routes } from "@shared/navigation/routes";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Screen
      activePath={routes.meetings()}
      render={async ({ db, workspaceId }) => (
        <MeetingsScreen state={await loadMeetingsScreen(db, workspaceId)} />
      )}
    />
  );
}
