import "server-only";

import type { AdminClient } from "@shared/services/supabase/adminClient";
import type { ObjectListRow } from "@shared/components/objectPage";
import { routes } from "@shared/navigation/routes";

export type ProjectsState = { rows: ObjectListRow[] };

const STATUS_TONE = {
  not_started: "neutral",
  on_track: "good",
  at_risk: "crit",
  slipping: "crit",
  blocked: "crit",
  done: "good",
  abandoned: "neutral",
} as const;

export async function loadProjectsScreen(
  db: AdminClient,
  workspaceId: string,
): Promise<ProjectsState> {
  const { data, error } = await db
    .from("project")
    .select("id, name, outcome, status, deadline")
    .eq("workspace_id", workspaceId)
    // Anything at risk first: the list should lead with what needs attention.
    .order("status")
    .order("deadline", { ascending: true, nullsFirst: false });

  if (error) console.warn("[rob-os] loadProjectsScreen failed:", error.message);

  return {
    rows: (data ?? []).map((project) => ({
      id: project.id,
      href: routes.project(project.id),
      tile: "project" as const,
      name: project.name,
      subtitle: project.outcome,
      meta: project.deadline,
      badgeLabel: project.status.replace(/_/g, " "),
      badgeTone: STATUS_TONE[project.status],
    })),
  };
}
