import { PersonScreen, loadPersonScreen } from "@features/people";
import { NotFoundBody, Screen } from "@shared/components/Screen";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  // Async in Next 16 — both must be awaited before use.
  const { id } = await params;
  const { tab } = await searchParams;

  return (
    <Screen
      render={async ({ db, workspaceId }) => {
        const state = await loadPersonScreen(db, workspaceId, id);
        return state ? (
          <PersonScreen state={state} tab={tab ?? "overview"} />
        ) : (
          <NotFoundBody what="person" />
        );
      }}
    />
  );
}
