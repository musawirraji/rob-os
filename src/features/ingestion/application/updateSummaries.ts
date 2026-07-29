import "server-only";

import type { AdminClient } from "@shared/services/supabase/adminClient";

import type { SummaryPort } from "../domain/ports";
import type { PrincipalContext } from "../domain/prompts";
import * as repo from "../services/ingestionRepository";

import type { ResolutionResult } from "./resolveEntities";

/**
 * Step 7: refresh the living summary for every object this source touched.
 *
 * The summary is written from the stored excerpts, not from the raw source, so it
 * can only assert things that already have a citation attached. It is always
 * stored as an `inference` with the ids of the sources it drew on — the reference
 * UI shows it under an INFERENCE tag above a row of source chips, and that tag is
 * load-bearing, not decoration.
 */

export type SummaryUpdateResult = {
  summariesUpdated: number;
  skipped: string[];
};

type SummaryKind = "person" | "company" | "project";

/** Confidence is bounded by how much the summary was written from. */
function summaryConfidence(excerptCount: number): number {
  return Math.min(0.9, 0.5 + 0.05 * excerptCount);
}

export async function updateSummaries(
  db: AdminClient,
  workspaceId: string,
  entities: ResolutionResult,
  principal: PrincipalContext,
  summarise: SummaryPort,
): Promise<SummaryUpdateResult> {
  const result: SummaryUpdateResult = { summariesUpdated: 0, skipped: [] };

  const groups: { kind: SummaryKind; ids: string[] }[] = [
    { kind: "person", ids: [...new Set(entities.people.values())] },
    { kind: "company", ids: [...new Set(entities.companies.values())] },
    { kind: "project", ids: [...new Set(entities.projects.values())] },
  ];

  for (const group of groups) {
    // A person's summary column is `current_context`; companies and projects use
    // `summary`. The names differ in the schema because the ideas differ, so the
    // write is spelled out per kind rather than built from computed keys.
    const column =
      group.kind === "person" ? ("person_id" as const)
      : group.kind === "company" ? ("company_id" as const)
      : ("project_id" as const);

    for (const entityId of group.ids) {
      const { data: row, error } = await db
        .from(group.kind)
        .select("id, name")
        .eq("id", entityId)
        .single();

      if (error || !row) continue;

      const excerpts = await repo.getExcerptsForEntity(
        db,
        workspaceId,
        column,
        entityId,
      );

      if (excerpts.length === 0) continue;

      const summary = await summarise(
        { kind: group.kind, name: row.name, facts: [] },
        excerpts.map(({ title, occurredAt, content }) => ({
          title,
          occurredAt,
          content,
        })),
        principal,
      );

      if (summary === null) {
        result.skipped.push(`summary for ${group.kind} ${row.name}`);
        continue;
      }

      const sourceIds = [...new Set(excerpts.map((excerpt) => excerpt.sourceId))];
      const confidence = summaryConfidence(excerpts.length);
      const now = new Date().toISOString();

      const writeError =
        group.kind === "person"
          ? (
              await db
                .from("person")
                .update({
                  current_context: summary,
                  current_context_fact_type: "inference",
                  current_context_confidence: confidence,
                  current_context_source_ids: sourceIds,
                  current_context_updated_at: now,
                })
                .eq("id", entityId)
            ).error
          : group.kind === "company"
            ? (
                await db
                  .from("company")
                  .update({
                    summary,
                    summary_fact_type: "inference",
                    summary_confidence: confidence,
                    summary_source_ids: sourceIds,
                    summary_updated_at: now,
                  })
                  .eq("id", entityId)
              ).error
            : (
                await db
                  .from("project")
                  .update({
                    summary,
                    summary_fact_type: "inference",
                    summary_confidence: confidence,
                    summary_source_ids: sourceIds,
                    summary_updated_at: now,
                  })
                  .eq("id", entityId)
              ).error;

      if (writeError) {
        result.skipped.push(`summary write for ${group.kind} ${row.name}`);
        continue;
      }

      await repo.writeAudit(db, [
        {
          workspace_id: workspaceId,
          entity_kind: group.kind,
          entity_id: entityId,
          action: "update",
          field: group.kind === "person" ? "current_context" : "summary",
          reason: `living summary regenerated from ${excerpts.length} excerpt(s)`,
          new_value: { summary } as never,
          source_ids: sourceIds,
        },
      ]);

      result.summariesUpdated += 1;
    }
  }

  return result;
}
