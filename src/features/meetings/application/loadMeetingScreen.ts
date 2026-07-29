import "server-only";

import type { AdminClient } from "@shared/services/supabase/adminClient";
import type { SourceKind } from "@shared/interfaces/objects";
import { provenanceLabel, type ProvenanceLabel } from "@shared/interfaces/provenance";
import type { DetailFact, ObjectListRow } from "@shared/components/objectPage";
import { routes } from "@shared/navigation/routes";
import { formatInZone, relativeAge, type FeedEntry } from "@shared/services/objectFeed";

export type MeetingState = {
  id: string;
  title: string;
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
  attendees: ObjectListRow[];
  decisions: FeedEntry[];
  commitments: FeedEntry[];
  /** The raw transcript, for the Transcript tab. */
  transcript: string | null;
  followUpDraft: string | null;
  counts: { attendees: number; decisions: number; commitments: number };
};

const SENTIMENT_TONE = {
  positive: "good",
  neutral: undefined,
  tense: "warn",
  negative: "crit",
  unknown: undefined,
} as const;

export async function loadMeetingScreen(
  db: AdminClient,
  workspaceId: string,
  meetingId: string,
  now: Date = new Date(),
): Promise<MeetingState | null> {
  const today = now.toISOString().slice(0, 10);

  const { data: workspace } = await db
    .from("workspace")
    .select("timezone")
    .eq("id", workspaceId)
    .single();

  const timeZone = workspace?.timezone ?? "UTC";

  const { data: meeting, error } = await db
    .from("meeting")
    .select(
      "id, title, occurred_at, sentiment, follow_up_status, follow_up_draft, summary, summary_fact_type, summary_confidence, summary_source_ids, summary_updated_at, transcript_source_id, company:company(id, name), project:project(id, name)",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", meetingId)
    .maybeSingle();

  if (error) console.warn("[rob-os] loadMeetingScreen failed:", error.message);
  if (!meeting) return null;

  const company = meeting.company as { id: string; name: string } | null;
  const project = meeting.project as { id: string; name: string } | null;

  const { data: attendeeRows } = await db
    .from("meeting_person")
    .select("spoke, person:person(id, name, role)")
    .eq("workspace_id", workspaceId)
    .eq("meeting_id", meetingId);

  const attendees: ObjectListRow[] = (attendeeRows ?? []).flatMap((row) => {
    const person = row.person as { id: string; name: string; role: string | null } | null;
    if (!person) return [];
    return [
      {
        id: person.id,
        href: routes.person(person.id),
        tile: "person" as const,
        name: person.name,
        subtitle: person.role,
        meta: null,
        badgeLabel: row.spoke ? null : "Named only",
        badgeTone: row.spoke ? null : ("neutral" as const),
      },
    ];
  });

  // Sources referenced by the summary, decisions and commitments, resolved once.
  const sourceById = new Map<string, { sourceId: string; kind: SourceKind; title: string }>();
  const collect = async (ids: string[]): Promise<void> => {
    const missing = [...new Set(ids)].filter((id) => !sourceById.has(id));
    if (missing.length === 0) return;
    const { data } = await db.from("source").select("id, kind, title").in("id", missing);
    for (const row of data ?? []) {
      sourceById.set(row.id, { sourceId: row.id, kind: row.kind, title: row.title });
    }
  };

  const [decisionRows, commitmentRows] = await Promise.all([
    db
      .from("decision")
      .select("id, statement, decided_on, reversible, fact_type, source_ids")
      .eq("workspace_id", workspaceId)
      .eq("meeting_id", meetingId),
    db
      .from("commitment")
      .select("id, what, deadline, status, fact_type, source_ids, owed_by_principal, owed_to:person!commitment_owed_to_person_id_fkey(name), owed_by:person!commitment_owed_by_person_id_fkey(name)")
      .eq("workspace_id", workspaceId)
      .eq("meeting_id", meetingId),
  ]);

  await collect([
    ...meeting.summary_source_ids,
    ...(decisionRows.data ?? []).flatMap((row) => row.source_ids),
    ...(commitmentRows.data ?? []).flatMap((row) => row.source_ids),
  ]);

  const chips = (ids: string[]) =>
    ids.map((id) => sourceById.get(id)).filter((chip): chip is NonNullable<typeof chip> => chip !== undefined);

  const decisions: FeedEntry[] = (decisionRows.data ?? []).map((row) => ({
    id: `decision-${row.id}`,
    kind: "decision",
    title: "Decision",
    detail: row.statement,
    occurredAt: row.decided_on,
    factType: row.fact_type,
    badgeLabel: row.reversible === false ? "Hard to reverse" : null,
    badgeTone: row.reversible === false ? "warn" : null,
    sources: chips(row.source_ids),
  }));

  const commitments: FeedEntry[] = (commitmentRows.data ?? []).map((row) => {
    const overdue = row.deadline !== null && row.deadline < today;
    const owedTo = (row.owed_to as { name: string } | null)?.name ?? "you";
    const owedBy = (row.owed_by as { name: string } | null)?.name ?? "you";
    return {
      id: `commitment-${row.id}`,
      kind: "commitment" as const,
      title: row.owed_by_principal ? `You → ${owedTo}` : `${owedBy} → you`,
      detail: row.what,
      occurredAt: row.deadline,
      factType: row.fact_type,
      badgeLabel: overdue ? "Overdue" : row.deadline ? `Due ${row.deadline}` : "No deadline",
      badgeTone: overdue ? ("crit" as const) : ("neutral" as const),
      sources: chips(row.source_ids),
    };
  });

  let transcript: string | null = null;
  if (meeting.transcript_source_id) {
    const { data } = await db
      .from("source")
      .select("body")
      .eq("id", meeting.transcript_source_id)
      .maybeSingle();
    transcript = data?.body ?? null;
  }

  const facts: DetailFact[] = [
    {
      label: "When",
      value: `${formatInZone(meeting.occurred_at, timeZone)} · ${relativeAge(meeting.occurred_at, now)} ago`,
    },
    { label: "Sentiment", value: meeting.sentiment, tone: SENTIMENT_TONE[meeting.sentiment] },
    { label: "Follow-up", value: meeting.follow_up_status.replace(/_/g, " ") },
  ];
  if (company) facts.push({ label: "Company", value: company.name });
  if (project) facts.push({ label: "Project", value: project.name });
  facts.push({ label: "Attendees", value: `${attendees.length}` });

  return {
    id: meeting.id,
    title: meeting.title,
    initials: meeting.title.slice(0, 2).toUpperCase(),
    subtitle: company?.name ?? null,
    facts,
    summary: {
      text: meeting.summary,
      label: provenanceLabel(meeting.summary_fact_type),
      confidence: meeting.summary_confidence,
      updatedAt: meeting.summary_updated_at,
      sources: chips(meeting.summary_source_ids),
    },
    attendees,
    decisions,
    commitments,
    transcript,
    followUpDraft: meeting.follow_up_draft,
    counts: {
      attendees: attendees.length,
      decisions: decisions.length,
      commitments: commitments.length,
    },
  };
}
