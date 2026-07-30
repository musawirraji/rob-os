import { InboxScreen, loadInboxScreen } from "@features/capture";
import { Screen } from "@shared/components/Screen";

import { capturePaste, captureUpload } from "./actions";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; ok?: string }>;
}) {
  const { m, ok } = await searchParams;

  return (
    <Screen
      render={async ({ db, workspaceId }) => (
        <InboxScreen
          state={await loadInboxScreen(db, workspaceId)}
          actions={{ paste: capturePaste, upload: captureUpload }}
          message={m ?? null}
          ok={ok !== "0"}
        />
      )}
    />
  );
}
