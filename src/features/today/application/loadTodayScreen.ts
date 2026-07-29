import "server-only";

import type { AdminClient } from "@shared/services/supabase/adminClient";
import type { SourceKind } from "@shared/interfaces/objects";

import { buildBrief, type BriefDraft } from "../domain/brief";
import { loadBriefInputs, storeBrief } from "../services/briefRepository";

/**
 * The single data call behind the Today screen. Screens stay render-only: this
 * returns finished view state, including the source chips each line needs, so the
 * component does no lookups and no formatting decisions of its own.
 */

export type TodaySourceChip = {
  sourceId: string;
  kind: SourceKind;
  title: string;
};

export type TodayLine = {
  id: string;
  category: BriefDraft["lines"][number]["category"];
  body: string;
  badgeLabel: string | null;
  badgeTone: string | null;
  factType: string;
  href: string | null;
  sources: TodaySourceChip[];
};

export type TodayState = {
  greeting: string;
  headline: string;
  date: string;
  stats: BriefDraft["stats"];
  lines: TodayLine[];
  /** True when there is no data at all — the screen says so rather than pretending. */
  empty: boolean;
};

export async function loadTodayScreen(
  db: AdminClient,
  workspaceId: string,
  now: Date = new Date(),
): Promise<TodayState | null> {
  const { data: workspace } = await db
    .from("workspace")
    .select("principal_name")
    .eq("id", workspaceId)
    .single();

  if (!workspace) return null;

  const today = now.toISOString().slice(0, 10);
  const inputs = await loadBriefInputs(db, workspaceId);

  const draft = buildBrief({
    today,
    principalName: workspace.principal_name,
    ...inputs,
  });

  // Persist it. The screen reads a stored brief so a refresh is stable and
  // `pg_cron` can regenerate it overnight without the page doing the work.
  await storeBrief(db, workspaceId, today, draft);

  // Resolve every referenced source once, so each line can render its chips.
  const sourceIds = [...new Set(draft.lines.flatMap((line) => line.sourceIds))];
  const sourceById = new Map<string, TodaySourceChip>();

  if (sourceIds.length > 0) {
    const { data } = await db
      .from("source")
      .select("id, kind, title")
      .in("id", sourceIds);

    for (const row of data ?? []) {
      sourceById.set(row.id, { sourceId: row.id, kind: row.kind, title: row.title });
    }
  }

  const lines: TodayLine[] = draft.lines.map((line, index) => ({
    id: `${today}-${index}`,
    category: line.category,
    body: line.body,
    badgeLabel: line.badgeLabel,
    badgeTone: line.badgeTone,
    factType: line.factType,
    href:
      line.personId !== null
        ? `/people/${line.personId}`
        : line.projectId !== null
          ? `/projects/${line.projectId}`
          : line.meetingId !== null
            ? `/meetings/${line.meetingId}`
            : null,
    sources: line.sourceIds
      .map((sourceId) => sourceById.get(sourceId))
      .filter((chip): chip is TodaySourceChip => chip !== undefined),
  }));

  return {
    greeting: draft.greeting,
    headline: draft.headline,
    date: today,
    stats: draft.stats,
    lines,
    empty:
      lines.length === 0 &&
      draft.stats.waitingOnYou === 0 &&
      draft.stats.waitingOnOthers === 0,
  };
}
