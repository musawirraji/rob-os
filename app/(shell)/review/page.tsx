import { ReviewScreen, loadReviewScreen } from "@features/review";
import { Screen } from "@shared/components/Screen";

import { approveItem, correctItem, rejectItem } from "./actions";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;

  return (
    <Screen
      render={async ({ db, workspaceId }) => (
        <ReviewScreen
          state={await loadReviewScreen(db, workspaceId)}
          actions={{ approve: approveItem, reject: rejectItem, correct: correctItem }}
          message={m ?? null}
        />
      )}
    />
  );
}
