import { MeetingsScreen, loadMeetingsScreen } from "@features/meetings";
import { Screen } from "@shared/components/Screen";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Screen
      render={async ({ db, workspaceId }) => (
        <MeetingsScreen state={await loadMeetingsScreen(db, workspaceId)} />
      )}
    />
  );
}
