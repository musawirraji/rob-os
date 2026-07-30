import { CompaniesScreen, loadCompaniesScreen } from "@features/companies";
import { Screen } from "@shared/components/Screen";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Screen
      render={async ({ db, workspaceId }) => (
        <CompaniesScreen state={await loadCompaniesScreen(db, workspaceId)} />
      )}
    />
  );
}
