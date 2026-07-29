import "server-only";

import type { AdminClient } from "@shared/services/supabase/adminClient";

import type {
  BriefCommitment,
  BriefDraft,
  BriefMeeting,
  BriefPerson,
  BriefProject,
} from "../domain/brief";

/** Reads the rows the brief is built from, and stores the result. */

export async function loadBriefInputs(
  db: AdminClient,
  workspaceId: string,
): Promise<{
  commitments: BriefCommitment[];
  projects: BriefProject[];
  people: BriefPerson[];
  meetings: BriefMeeting[];
}> {
  const [commitments, projects, people, meetings] = await Promise.all([
    db
      .from("commitment")
      .select(
        "id, what, deadline, status, confidence, source_ids, owed_by_principal, owed_to_principal, owed_by:person!commitment_owed_by_person_id_fkey(id, name), owed_to:person!commitment_owed_to_person_id_fkey(id, name)",
      )
      .eq("workspace_id", workspaceId)
      .in("status", ["open", "due", "overdue"]),
    db
      .from("project")
      .select("id, name, status, deadline, next_action, blockers, summary_source_ids")
      .eq("workspace_id", workspaceId),
    db
      .from("person")
      .select(
        "id, name, last_interaction, current_context, current_context_source_ids, company:company!person_company_id_fkey(name)",
      )
      .eq("workspace_id", workspaceId),
    db
      .from("meeting")
      .select("id, title, occurred_at, summary_source_ids, company:company(name)")
      .eq("workspace_id", workspaceId),
  ]);

  // A failed query here used to fall through as an empty array, which renders as
  // a calm "0" on the Today screen — indistinguishable from genuinely having
  // nothing to report. Surface it instead.
  for (const [name, result] of [
    ["commitment", commitments],
    ["project", projects],
    ["person", people],
    ["meeting", meetings],
  ] as const) {
    if (result.error) {
      console.warn(`[rob-os] brief input query for ${name} failed:`, result.error.message);
    }
  }

  return {
    commitments: (commitments.data ?? []).map((row) => {
      // The counterparty is whichever side is not the principal.
      const other = row.owed_by_principal
        ? (row.owed_to as { id: string; name: string } | null)
        : (row.owed_by as { id: string; name: string } | null);
      return {
        id: row.id,
        what: row.what,
        deadline: row.deadline,
        status: row.status,
        owedByPrincipal: row.owed_by_principal,
        owedToPrincipal: row.owed_to_principal,
        counterpartyName: other?.name ?? null,
        counterpartyId: other?.id ?? null,
        sourceIds: row.source_ids,
        confidence: row.confidence,
      };
    }),
    projects: (projects.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      deadline: row.deadline,
      nextAction: row.next_action,
      blockers: row.blockers,
      sourceIds: row.summary_source_ids,
    })),
    people: (people.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      companyName: (row.company as { name: string } | null)?.name ?? null,
      lastInteraction: row.last_interaction,
      currentContext: row.current_context,
      sourceIds: row.current_context_source_ids,
    })),
    meetings: (meetings.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      occurredAt: row.occurred_at,
      companyName: (row.company as { name: string } | null)?.name ?? null,
      sourceIds: row.summary_source_ids,
    })),
  };
}

export async function storeBrief(
  db: AdminClient,
  workspaceId: string,
  briefDate: string,
  draft: BriefDraft,
): Promise<string | null> {
  // One brief per day: upsert so a re-run replaces rather than accumulates.
  const { data: brief, error } = await db
    .from("daily_brief")
    .upsert(
      {
        workspace_id: workspaceId,
        brief_date: briefDate,
        greeting: draft.greeting,
        headline: draft.headline,
        stats: draft.stats as never,
        generated_at: new Date().toISOString(),
        model: "rule-based",
      },
      { onConflict: "workspace_id,brief_date" },
    )
    .select("id")
    .single();

  if (error || !brief) {
    console.warn("[rob-os] could not store the daily brief:", error);
    return null;
  }

  const { error: clearError } = await db
    .from("daily_brief_item")
    .delete()
    .eq("brief_id", brief.id);
  if (clearError) console.warn("[rob-os] could not clear brief items:", clearError);

  if (draft.lines.length > 0) {
    const { error: insertError } = await db.from("daily_brief_item").insert(
      draft.lines.map((line) => ({
        workspace_id: workspaceId,
        brief_id: brief.id,
        position: line.position,
        category: line.category,
        body: line.body,
        badge_label: line.badgeLabel,
        badge_tone: line.badgeTone,
        person_id: line.personId,
        project_id: line.projectId,
        meeting_id: line.meetingId,
        commitment_id: line.commitmentId,
        source_ids: line.sourceIds,
        fact_type: line.factType,
        confidence: line.confidence,
      })),
    );
    if (insertError) console.warn("[rob-os] could not store brief items:", insertError);
  }

  return brief.id;
}
