import "server-only";

import type { AdminClient } from "@shared/services/supabase/adminClient";
import { routes } from "@shared/navigation/routes";

import type { SearchGroup, SearchResponse } from "../domain/types";

/**
 * Object search for the ⌘K palette. Matches name and alias, so "Sarah" finds
 * Sarah Lin and "Omnilux Ltd" finds Omnilux — the same alias lists entity
 * resolution builds during ingestion get reused here.
 */

const PER_GROUP = 5;

function escape(term: string): string {
  // `%` and `_` are wildcards in ilike, and a comma would split the `or` filter.
  return term.replace(/[%_,]/g, " ").trim();
}

export async function search(
  db: AdminClient,
  workspaceId: string,
  query: string,
): Promise<SearchResponse> {
  const term = escape(query);

  if (term.length < 2) {
    return { query, groups: [], total: 0 };
  }

  const like = `%${term}%`;
  const aliasFilter = `name.ilike.${like},aliases.cs.{"${term}"}`;

  const [people, companies, projects, meetings] = await Promise.all([
    db
      .from("person")
      .select("id, name, role, company:company!person_company_id_fkey(name)")
      .eq("workspace_id", workspaceId)
      .or(aliasFilter)
      .limit(PER_GROUP),
    db
      .from("company")
      .select("id, name, type, industry")
      .eq("workspace_id", workspaceId)
      .or(aliasFilter)
      .limit(PER_GROUP),
    db
      .from("project")
      .select("id, name, status, deadline")
      .eq("workspace_id", workspaceId)
      .or(aliasFilter)
      .limit(PER_GROUP),
    db
      .from("meeting")
      .select("id, title, occurred_at")
      .eq("workspace_id", workspaceId)
      .ilike("title", like)
      .limit(PER_GROUP),
  ]);

  const groups: SearchGroup[] = [];

  if (people.data && people.data.length > 0) {
    groups.push({
      kind: "person",
      label: "People",
      hits: people.data.map((row) => ({
        kind: "person" as const,
        tile: "person" as const,
        id: row.id,
        name: row.name,
        subtitle:
          (row.company as { name: string } | null)?.name ?? row.role ?? null,
        href: routes.person(row.id),
      })),
    });
  }

  if (companies.data && companies.data.length > 0) {
    groups.push({
      kind: "company",
      label: "Companies",
      hits: companies.data.map((row) => ({
        kind: "company" as const,
        tile: "company" as const,
        id: row.id,
        name: row.name,
        subtitle: row.industry ?? row.type.replace(/_/g, " "),
        href: routes.company(row.id),
      })),
    });
  }

  if (projects.data && projects.data.length > 0) {
    groups.push({
      kind: "project",
      label: "Projects",
      hits: projects.data.map((row) => ({
        kind: "project" as const,
        tile: "project" as const,
        id: row.id,
        name: row.name,
        subtitle:
          row.status.replace(/_/g, " ") + (row.deadline ? ` · ${row.deadline}` : ""),
        href: routes.project(row.id),
      })),
    });
  }

  if (meetings.data && meetings.data.length > 0) {
    groups.push({
      kind: "meeting",
      label: "Meetings",
      hits: meetings.data.map((row) => ({
        kind: "meeting" as const,
        tile: "meeting" as const,
        id: row.id,
        name: row.title,
        subtitle: row.occurred_at.slice(0, 10),
        href: routes.meeting(row.id),
      })),
    });
  }

  return {
    query,
    groups,
    total: groups.reduce((sum, group) => sum + group.hits.length, 0),
  };
}
