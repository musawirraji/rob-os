import { NextResponse } from "next/server";

import { loadTodayScreen } from "@features/today";
import { getAdminSupabase } from "@shared/services/supabase/adminClient";
import { serverEnv } from "@shared/config/serverEnv";

export const dynamic = "force-dynamic";

/**
 * Regenerates the daily brief for every workspace. Called by `pg_cron` each
 * morning via `pg_net`.
 *
 * The brief rules live in `features/today/domain/brief.ts` and nowhere else — the
 * scheduler reaches back into the app rather than reimplementing them in SQL. Two
 * implementations of "what matters today" would drift, and the one the user reads
 * on screen has to be the one the cron job wrote.
 *
 * Fails closed: a missing or wrong secret is a 401, not a free regeneration.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const expected = serverEnv.cronSecret;

  if (expected.length === 0) {
    console.warn("[rob-os] CRON_SECRET is not set — refusing to run the brief job.");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getAdminSupabase();
  if (!db) {
    return NextResponse.json({ error: "database unavailable" }, { status: 503 });
  }

  const { data: workspaces, error } = await db.from("workspace").select("id, name");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: { workspace: string; lines: number }[] = [];

  for (const workspace of workspaces ?? []) {
    // "await": this job exists to write the brief, so it must not report success
    // before the write has actually happened.
    const state = await loadTodayScreen(db, workspace.id, new Date(), "await");
    results.push({ workspace: workspace.name, lines: state?.lines.length ?? 0 });
  }

  return NextResponse.json({ generated: results.length, results });
}
