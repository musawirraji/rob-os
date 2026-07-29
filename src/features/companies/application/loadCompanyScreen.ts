import "server-only";

import type { AdminClient } from "@shared/services/supabase/adminClient";
import type { SourceKind } from "@shared/interfaces/objects";
import { provenanceLabel, type ProvenanceLabel } from "@shared/interfaces/provenance";
import { loadObjectFeed, relativeAge, type FeedEntry } from "@shared/services/objectFeed";
import type { DetailFact, ObjectListRow } from "@shared/components/objectPage";
import { routes } from "@shared/navigation/routes";

export type CompanyState = {
  id: string;
  name: string;
  initials: string;
  subtitle: string | null;
  facts: DetailFact[];
  summary: {
    text: string | null;
    label: ProvenanceLabel;
    confidence: number;
    updatedAt: string | null;
    sources: { sourceId: string; kind: SourceKind; title: string }[];
  };
  feed: FeedEntry[];
  /** The company's people — this is what `person_company` exists to answer. */
  people: ObjectListRow[];
  counts: { activity: number; people: number };
};

const RISK_TONE = {
  none: undefined,
  low: undefined,
  medium: "warn",
  high: "crit",
} as const;

export async function loadCompanyScreen(
  db: AdminClient,
  workspaceId: string,
  companyId: string,
  now: Date = new Date(),
): Promise<CompanyState | null> {
  const today = now.toISOString().slice(0, 10);

  const { data: company, error } = await db
    .from("company")
    .select(
      "id, name, type, industry, risk_level, opportunity_level, domains, summary, summary_fact_type, summary_confidence, summary_source_ids, summary_updated_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", companyId)
    .maybeSingle();

  if (error) console.warn("[rob-os] loadCompanyScreen failed:", error.message);
  if (!company) return null;

  const feed = await loadObjectFeed(db, workspaceId, "company_id", companyId, today);

  // Read the relationship table, not `person.company_id`: the edge carries the
  // role and the source that established it.
  const { data: edges } = await db
    .from("person_company")
    .select("role, is_current, person:person(id, name, last_interaction)")
    .eq("workspace_id", workspaceId)
    .eq("company_id", companyId);

  const people: ObjectListRow[] = (edges ?? []).flatMap((edge) => {
    const person = edge.person as
      | { id: string; name: string; last_interaction: string | null }
      | null;
    if (!person) return [];
    return [
      {
        id: person.id,
        href: routes.person(person.id),
        tile: "person" as const,
        name: person.name,
        subtitle: edge.role,
        meta: person.last_interaction
          ? relativeAge(person.last_interaction, now)
          : "never",
        badgeLabel: edge.is_current ? null : "Former",
        badgeTone: edge.is_current ? null : ("neutral" as const),
      },
    ];
  });

  const facts: DetailFact[] = [
    {
      label: "Type",
      value: company.type === "unknown" ? "not established" : company.type.replace(/_/g, " "),
    },
  ];
  if (company.industry) facts.push({ label: "Industry", value: company.industry });
  facts.push({
    label: "Risk",
    value: company.risk_level,
    tone: RISK_TONE[company.risk_level],
  });
  facts.push({ label: "Opportunity", value: company.opportunity_level });
  facts.push({ label: "Contacts", value: `${people.length}` });
  if (company.domains.length > 0) {
    facts.push({ label: "Domains", value: company.domains.join(", ") });
  }

  const sources: CompanyState["summary"]["sources"] = [];
  if (company.summary_source_ids.length > 0) {
    const { data } = await db
      .from("source")
      .select("id, kind, title")
      .in("id", company.summary_source_ids);
    for (const row of data ?? []) {
      sources.push({ sourceId: row.id, kind: row.kind, title: row.title });
    }
  }

  return {
    id: company.id,
    name: company.name,
    initials: company.name.slice(0, 2).toUpperCase(),
    subtitle:
      [company.industry, company.type === "unknown" ? null : company.type.replace(/_/g, " ")]
        .filter(Boolean)
        .join(" · ") || null,
    facts,
    summary: {
      text: company.summary,
      label: provenanceLabel(company.summary_fact_type),
      confidence: company.summary_confidence,
      updatedAt: company.summary_updated_at,
      sources,
    },
    feed,
    people,
    counts: { activity: feed.length, people: people.length },
  };
}
