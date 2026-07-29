import "server-only";

import type { AdminClient } from "@shared/services/supabase/adminClient";
import type { Inserts } from "@shared/interfaces/db";

import { normalizeName } from "../domain/resolution";
import type { ParsedSource, SourceExtraction } from "../domain/types";
import * as repo from "../services/ingestionRepository";

import { PRINCIPAL, type ResolutionResult } from "./resolveEntities";

/**
 * A meeting-kind source becomes a first-class meeting object.
 *
 * Without this the transcript is only searchable prose: "who was on the Omnilux
 * review call" has to be answered by reading text rather than by reading a row,
 * and the Meetings surface has nothing to render. The transcript stays the
 * citation; the meeting is the thing you can navigate to.
 */
export async function upsertMeetingObject(
  db: AdminClient,
  workspaceId: string,
  sourceId: string,
  parsed: ParsedSource,
  extraction: SourceExtraction,
  entities: ResolutionResult,
): Promise<{ meetingId: string | null; skipped: string | null }> {
  if (parsed.kind !== "meeting") return { meetingId: null, skipped: null };

  // `meeting.occurred_at` is not nullable, and rightly so — a meeting with no
  // date cannot be placed on Today or ordered in a feed. Better to leave the
  // transcript as a plain source and say so than to invent a timestamp.
  if (!parsed.occurredAt) {
    return {
      meetingId: null,
      skipped: "meeting object (transcript has no date)",
    };
  }

  const firstCompanyId = [...entities.companies.values()][0] ?? null;
  const firstProjectId = [...entities.projects.values()][0] ?? null;

  const row: Inserts<"meeting"> = {
    workspace_id: workspaceId,
    title: parsed.title,
    occurred_at: parsed.occurredAt,
    company_id: firstCompanyId,
    project_id: firstProjectId,
    transcript_source_id: sourceId,
    sentiment: extraction.sentiment,
    follow_up_status: "pending",
    summary: extraction.gist.length > 0 ? extraction.gist : null,
    summary_fact_type: "inference",
    summary_confidence: extraction.gist.length > 0 ? 0.7 : 0,
    summary_source_ids: [sourceId],
    summary_updated_at: new Date().toISOString(),
  };

  const meeting = await repo.upsertMeeting(db, row);
  if (!meeting) return { meetingId: null, skipped: "meeting object (write failed)" };

  // Everyone the transcript named was in the room. `spoke` stays true here
  // because the extraction only reports people it found in the text; a named
  // absentee would be a finer distinction than the corpus supports.
  const attendees: Inserts<"meeting_person">[] = [];
  for (const item of extraction.people) {
    const key = normalizeName(item.name);
    if (key === PRINCIPAL) continue;
    const personId = entities.people.get(key);
    if (!personId) continue;
    attendees.push({
      meeting_id: meeting.id,
      person_id: personId,
      workspace_id: workspaceId,
      spoke: true,
      fact_type: item.factType,
      confidence: item.confidence,
    });
  }

  await repo.linkMeetingPerson(db, attendees);

  await repo.writeAudit(db, [
    {
      workspace_id: workspaceId,
      entity_kind: "meeting",
      entity_id: meeting.id,
      action: "create",
      reason: `derived from transcript: ${parsed.title}`,
      confidence: 0.9,
      new_value: {
        title: parsed.title,
        occurredAt: parsed.occurredAt,
        attendees: attendees.length,
      } as never,
      source_ids: [sourceId],
    },
  ]);

  return { meetingId: meeting.id, skipped: null };
}
