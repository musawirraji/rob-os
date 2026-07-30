import { TodayScreen, loadTodayScreen } from "@features/today";
import { EmptyState } from "@shared/components/primitives";
import { Screen } from "@shared/components/Screen";

/**
 * Every screen reads the live workspace, so none may be prerendered. Without this
 * the brief freezes at build time and silently serves yesterday's state.
 */
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Screen
      render={async ({ db, workspaceId }) => {
        const state = await loadTodayScreen(db, workspaceId);
        return state ? (
          <TodayScreen state={state} />
        ) : (
          <EmptyState title="Nothing to show" body="The workspace could not be loaded." />
        );
      }}
    />
  );
}
