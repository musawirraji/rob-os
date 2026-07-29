import "server-only";

import type { AdminClient } from "@shared/services/supabase/adminClient";
import type { ObjectListRow } from "@shared/components/objectPage";
import { routes } from "@shared/navigation/routes";

export type MeetingsState = { rows: ObjectListRow[] };

const SENTIMENT_TONE = {
  positive: "good",
  neutral: null,
  tense: "warn",
  negative: "crit",
  unknown: null,
} as const;

export async function loadMeetingsScreen(
  db: AdminClient,
  workspaceId: string,
): Promise<MeetingsState> {
  const { data, error } = await db
    .from("meeting")
    .select("id, title, occurred_at, sentiment, company:company(name)")
    .eq("workspace_id", workspaceId)
    .order("occurred_at", { ascending: false });

  if (error) console.warn("[rob-os] loadMeetingsScreen failed:", error.message);

  return {
    rows: (data ?? []).map((meeting) => {
      const tone = SENTIMENT_TONE[meeting.sentiment];
      return {
        id: meeting.id,
        href: routes.meeting(meeting.id),
        tile: "meeting" as const,
        name: meeting.title,
        subtitle: (meeting.company as { name: string } | null)?.name ?? null,
        meta: meeting.occurred_at.slice(0, 10),
        badgeLabel: tone ? meeting.sentiment : null,
        badgeTone: tone ?? null,
      };
    }),
  };
}
