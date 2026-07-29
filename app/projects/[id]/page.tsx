import { ProjectScreen, loadProjectScreen } from "@features/projects";
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
      activePath={routes.projects()}
      render={async ({ db, workspaceId }) => {
        const state = await loadProjectScreen(db, workspaceId, id);
        return state ? (
          <ProjectScreen state={state} tab={tab ?? "overview"} />
        ) : (
          <NotFoundBody what="project" />
        );
      }}
    />
  );
}
