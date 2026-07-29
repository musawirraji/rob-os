import "server-only";

import type { AdminClient } from "@shared/services/supabase/adminClient";
import type { SourceKind } from "@shared/interfaces/objects";
import { provenanceLabel, type ProvenanceLabel } from "@shared/interfaces/provenance";
import { loadObjectFeed, relativeAge, type FeedEntry } from "@shared/services/objectFeed";
import type { DetailFact, ObjectListRow } from "@shared/components/objectPage";
import { routes } from "@shared/navigation/routes";

export type ProjectState = {
  id: string;
  name: string;
  initials: string;
  subtitle: string | null;
  facts: DetailFact[];
  blockers: string[];
  summary: {
    text: string | null;
    label: ProvenanceLabel;
    confidence: number;
    updatedAt: string | null;
    sources: { sourceId: string; kind: SourceKind; title: string }[];
  };
  feed: FeedEntry[];
  people: ObjectListRow[];
  counts: { activity: number; people: number };
};

const STATUS_TONE = {
  not_started: "neutral",
  on_track: "good",
  at_risk: "crit",
  slipping: "crit",
  blocked: "crit",
  done: "good",
  abandoned: "neutral",
} as const;

export async function loadProjectScreen(
  db: AdminClient,
  workspaceId: string,
  projectId: string,
  now: Date = new Date(),
): Promise<ProjectState | null> {
  const today = now.toISOString().slice(0, 10);

  const { data: project, error } = await db
    .from("project")
    .select(
      "id, name, outcome, status, deadline, next_action, blockers, summary, summary_fact_type, summary_confidence, summary_source_ids, summary_updated_at, company:company(id, name)",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", projectId)
    .maybeSingle();

  if (error) console.warn("[rob-os] loadProjectScreen failed:", error.message);
  if (!project) return null;

  const company = project.company as { id: string; name: string } | null;
  const feed = await loadObjectFeed(db, workspaceId, "project_id", projectId, today);

  const { data: edges } = await db
    .from("project_person")
    .select("role, person:person(id, name, last_interaction)")
    .eq("workspace_id", workspaceId)
    .eq("project_id", projectId);

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
        meta: person.last_interaction ? relativeAge(person.last_interaction, now) : "never",
        badgeLabel: null,
        badgeTone: null,
      },
    ];
  });

  const overdue = project.deadline !== null && project.deadline < today;

  const facts: DetailFact[] = [
    {
      label: "Status",
      value: project.status.replace(/_/g, " "),
      tone: STATUS_TONE[project.status],
    },
  ];
  if (company) facts.push({ label: "Company", value: company.name });
  facts.push({
    label: "Deadline",
    value: project.deadline ?? "none set",
    tone: overdue ? "crit" : undefined,
  });
  if (project.next_action) {
    facts.push({ label: "Next action", value: project.next_action });
  }
  facts.push({ label: "People", value: `${people.length}` });

  const sources: ProjectState["summary"]["sources"] = [];
  if (project.summary_source_ids.length > 0) {
    const { data } = await db
      .from("source")
      .select("id, kind, title")
      .in("id", project.summary_source_ids);
    for (const row of data ?? []) {
      sources.push({ sourceId: row.id, kind: row.kind, title: row.title });
    }
  }

  return {
    id: project.id,
    name: project.name,
    initials: project.name.slice(0, 2).toUpperCase(),
    // The outcome is what "done" means, so it belongs directly under the name
    // rather than buried in the fact list.
    subtitle: project.outcome,
    facts,
    blockers: project.blockers,
    summary: {
      text: project.summary,
      label: provenanceLabel(project.summary_fact_type),
      confidence: project.summary_confidence,
      updatedAt: project.summary_updated_at,
      sources,
    },
    feed,
    people,
    counts: { activity: feed.length, people: people.length },
  };
}
