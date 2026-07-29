import { MeetingScreen, loadMeetingScreen } from "@features/meetings";
import { NotFoundBody, Screen } from "@shared/components/Screen";
import { routes } from "@shared/navigation/routes";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;

  return (
    <Screen
      activePath={routes.meetings()}
      render={async ({ db, workspaceId }) => {
        const state = await loadMeetingScreen(db, workspaceId, id);
        return state ? (
          <MeetingScreen state={state} tab={tab ?? "overview"} />
        ) : (
          <NotFoundBody what="meeting" />
        );
      }}
    />
  );
}
