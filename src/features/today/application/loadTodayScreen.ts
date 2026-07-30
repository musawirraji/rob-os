import "server-only";

import { after } from "next/server";

import type { AdminClient } from "@shared/services/supabase/adminClient";
import type { SourceKind } from "@shared/interfaces/objects";

import { buildBrief, type BriefDraft } from "../domain/brief";
import { loadBriefInputs, storeBrief } from "../services/briefRepository";

/**
 * The single data call behind the Today screen. Screens stay render-only: this
 * returns finished view state, including the source chips each line needs, so the
 * component does no lookups and no formatting decisions of its own.
 *
 * **Persisting the brief does not block the render.** The screen is built from the
 * in-memory draft, never from the stored copy, so awaiting three writes before
 * returning made the page wait on work whose result it does not read. Against a
 * hosted database — where a single round trip is a few hundred milliseconds — that
 * was most of the two and a half seconds this screen took to appear.
 *
 * The cron job is the exception and passes `persist: "await"`. Its entire purpose
 * is the write, so it must not report success before the write has happened.
 */

export type PersistMode = "defer" | "await";

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
  persist: PersistMode = "defer",
): Promise<TodayState | null> {
  const today = now.toISOString().slice(0, 10);

  // Independent queries, so they go together. Run in sequence these cost two full
  // round trips to answer one screen.
  const [{ data: workspace }, inputs] = await Promise.all([
    db.from("workspace").select("principal_name").eq("id", workspaceId).single(),
    loadBriefInputs(db, workspaceId),
  ]);

  if (!workspace) return null;

  const draft = buildBrief({
    today,
    principalName: workspace.principal_name,
    ...inputs,
  });

  // Persisted so a stored brief exists for `pg_cron` to refresh overnight and for
  // anything else that wants yesterday's. Nothing below reads it back, so the
  // response does not wait for it.
  if (persist === "await") {
    await storeBrief(db, workspaceId, today, draft);
  } else {
    after(async () => {
      try {
        await storeBrief(db, workspaceId, today, draft);
      } catch (error) {
        // The screen has already rendered correctly from the draft, so a failed
        // write is a logging matter, not a user-facing one.
        console.warn("[rob-os] deferred brief write failed:", error);
      }
    });
  }

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
