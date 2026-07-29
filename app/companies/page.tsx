import { CompaniesScreen, loadCompaniesScreen } from "@features/companies";
import { Screen } from "@shared/components/Screen";
import { routes } from "@shared/navigation/routes";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Screen
      activePath={routes.companies()}
      render={async ({ db, workspaceId }) => (
        <CompaniesScreen state={await loadCompaniesScreen(db, workspaceId)} />
      )}
    />
  );
}
