import { CompanyScreen, loadCompanyScreen } from "@features/companies";
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
      activePath={routes.companies()}
      render={async ({ db, workspaceId }) => {
        const state = await loadCompanyScreen(db, workspaceId, id);
        return state ? (
          <CompanyScreen state={state} tab={tab ?? "overview"} />
        ) : (
          <NotFoundBody what="company" />
        );
      }}
    />
  );
}
