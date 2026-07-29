import "server-only";

import type { AdminClient } from "@shared/services/supabase/adminClient";
import type { ObjectListRow } from "@shared/components/objectPage";
import { routes } from "@shared/navigation/routes";

export type CompaniesState = { rows: ObjectListRow[] };

const RISK_TONE = { none: null, low: null, medium: "warn", high: "crit" } as const;

export async function loadCompaniesScreen(
  db: AdminClient,
  workspaceId: string,
): Promise<CompaniesState> {
  const { data, error } = await db
    .from("company")
    .select("id, name, type, industry, risk_level")
    .eq("workspace_id", workspaceId)
    .order("name");

  if (error) console.warn("[rob-os] loadCompaniesScreen failed:", error.message);

  const { data: edges } = await db
    .from("person_company")
    .select("company_id")
    .eq("workspace_id", workspaceId);

  const contactCount = new Map<string, number>();
  for (const edge of edges ?? []) {
    contactCount.set(edge.company_id, (contactCount.get(edge.company_id) ?? 0) + 1);
  }

  return {
    rows: (data ?? []).map((company) => {
      const count = contactCount.get(company.id) ?? 0;
      const tone = RISK_TONE[company.risk_level];
      return {
        id: company.id,
        href: routes.company(company.id),
        tile: "company" as const,
        name: company.name,
        subtitle:
          [company.industry, company.type === "unknown" ? null : company.type.replace(/_/g, " ")]
            .filter(Boolean)
            .join(" · ") || null,
        meta: count > 0 ? `${count} contact${count === 1 ? "" : "s"}` : null,
        badgeLabel: tone ? `${company.risk_level} risk` : null,
        badgeTone: tone ?? null,
      };
    }),
  };
}
