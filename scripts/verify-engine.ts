/**
 * Engine invariants — the things the brief promises that are easy to break
 * silently, and were in fact all broken at some point during the build.
 *
 *   npm run verify
 *
 * Run this after `npm run seed:ingest -- --fixtures`. It asserts against the live
 * database, not against mocks.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

let failures = 0;

function check(label: string, passed: boolean, detail?: string): void {
  console.log(`  ${passed ? "pass" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

async function main(): Promise<void> {
  const [
    { getAdminSupabase },
    { applyReviewDecision, loadReviewScreen },
    { ingestSource, parseFile },
    { revertAuditEntry, getAuditTrail },
  ] = await Promise.all([
    import("../src/shared/services/supabase/adminClient"),
    import("../src/features/review"),
    import("../src/features/ingestion"),
    import("../src/shared/services/auditRevert"),
  ]);

  const db = getAdminSupabase();
  if (!db) {
    console.error("No Supabase admin client — check .env.local.");
    process.exitCode = 1;
    return;
  }

  const { data: workspace } = await db
    .from("workspace")
    .select("id, principal_name, principal_company, timezone")
    .limit(1)
    .single();

  if (!workspace) {
    console.error("No workspace. Run `npm run seed:ingest -- --fixtures` first.");
    process.exitCode = 1;
    return;
  }

  const ws = workspace.id;

  // ── A1. Transcripts become meeting objects ─────────────────────────────────

  console.log("\nA1. Meeting objects\n");

  const { data: transcriptSources } = await db
    .from("source")
    .select("id, title, occurred_at, status")
    .eq("workspace_id", ws)
    .eq("kind", "meeting")
    .eq("status", "ingested");

  const { data: meetings } = await db
    .from("meeting")
    .select("id, title, transcript_source_id, occurred_at, sentiment, summary, summary_fact_type")
    .eq("workspace_id", ws);

  const meetingBySource = new Set(
    (meetings ?? []).map((meeting) => meeting.transcript_source_id),
  );

  check(
    "every fully-ingested transcript has a meeting object",
    (transcriptSources ?? []).every((source) => meetingBySource.has(source.id)),
    `${transcriptSources?.length ?? 0} transcript(s), ${meetings?.length ?? 0} meeting(s)`,
  );

  check(
    "meeting summaries are stored as inference, never fact",
    (meetings ?? []).every(
      (meeting) => meeting.summary === null || meeting.summary_fact_type === "inference",
    ),
  );

  const { data: attendees } = await db
    .from("meeting_person")
    .select("meeting_id")
    .eq("workspace_id", ws);

  check(
    "meetings have attendees linked",
    (attendees ?? []).length > 0,
    `${attendees?.length ?? 0} attendee link(s)`,
  );

  // ── A2. Relationship edges ─────────────────────────────────────────────────

  console.log("\nA2. Relationship edges\n");

  const edgeCounts: Record<string, number> = {};
  for (const table of [
    "person_company",
    "project_person",
    "project_company",
    "meeting_person",
    "decision_person",
  ] as const) {
    const { count } = await db
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", ws);
    edgeCounts[table] = count ?? 0;
  }

  check(
    "person↔company edges exist",
    (edgeCounts.person_company ?? 0) > 0,
    `${edgeCounts.person_company} edge(s)`,
  );
  check(
    "decision↔person edges exist",
    (edgeCounts.decision_person ?? 0) > 0,
    `${edgeCounts.decision_person} edge(s)`,
  );
  console.log(
    `  ·     project edges: project_person=${edgeCounts.project_person}, ` +
      `project_company=${edgeCounts.project_company} ` +
      "(0 is correct while no fixture extracts a project)",
  );

  const { data: personCompanyEdges } = await db
    .from("person_company")
    .select("person_id, source_ids")
    .eq("workspace_id", ws);

  const unsourced = (personCompanyEdges ?? []).filter(
    (edge) => edge.source_ids.length === 0,
  );

  check(
    "every person↔company edge carries a source",
    unsourced.length === 0,
    `${unsourced.length} edge(s) without one`,
  );

  // ── A3. A correction is remembered and changes the next run ────────────────

  console.log("\nA3. The correction loop\n");

  const before = await loadReviewScreen(db, ws);
  const ambiguous = before.items.find(
    (item) => item.entityKind === "person" && item.headline === "Sarah",
  );

  // The correction is destructive: once applied, the item is gone. So a second run
  // has to recognise the already-corrected state rather than reporting a failure —
  // a suite that only passes on a fresh database gets ignored.
  const { data: existingHint } = await db
    .from("resolution_hint")
    .select("mention, entity_id")
    .eq("workspace_id", ws)
    .eq("entity_kind", "person")
    .eq("mention", "sarah")
    .maybeSingle();

  if (!ambiguous && existingHint) {
    check(
      "the correction loop has already run (hint present, nothing re-queued)",
      existingHint.entity_id !== null,
      `sarah → ${existingHint.entity_id?.slice(0, 8)}; re-run after \`npm run seed:ingest -- --fixtures\` to exercise it again`,
    );
  } else if (!ambiguous) {
    check(
      'found the bare-"Sarah" review item to correct',
      false,
      "not in the queue and no hint — reseed with `npm run seed:ingest -- --fixtures`",
    );
  } else {
    const { data: sarah } = await db
      .from("person")
      .select("id")
      .eq("workspace_id", ws)
      .eq("name", "Sarah Lin")
      .single();

    const outcome = await applyReviewDecision(
      db,
      ws,
      ambiguous.id,
      { action: "correct", entityId: sarah?.id ?? null },
      null,
    );

    check("correction applied", outcome.ok, outcome.message);
    check("correction was stored as a resolution hint", outcome.remembered);

    const { data: hint } = await db
      .from("resolution_hint")
      .select("mention, entity_id")
      .eq("workspace_id", ws)
      .eq("entity_kind", "person")
      .eq("mention", "sarah")
      .maybeSingle();

    check(
      "hint points at Sarah Lin",
      hint?.entity_id === sarah?.id,
      `mention="${hint?.mention}" → ${hint?.entity_id?.slice(0, 8)}`,
    );

    // Re-ingest the source that produced the ambiguity. The hint should now
    // resolve it silently instead of queueing it again — this is the whole point
    // of the Review Queue, and it is the part that was missing.
    const manifest = JSON.parse(
      await readFile(path.join(process.cwd(), "seed", "manifest.json"), "utf8"),
    ) as {
      sources: { originalRef: string; kind: string; title: string; path: string; occurredAt: string | null; author: string | null; participants: string[] }[];
    };

    const entry = manifest.sources.find(
      (source) => source.originalRef === "omnilux-review-call-0723",
    );

    if (!entry) {
      check("found the transcript to re-ingest", false);
    } else {
      const raw = await readFile(path.join(process.cwd(), "seed", entry.path), "utf8");
      const parsedFile = parseFile({
        filename: entry.path,
        content: raw,
        kind: entry.kind as never,
      });
      const fixture = JSON.parse(
        await readFile(
          path.join(process.cwd(), "seed", "fixtures", "extraction", "omnilux-review-call-0723.json"),
          "utf8",
        ),
      );

      const report = await ingestSource(
        {
          db,
          extract: async () => fixture,
          embed: async (texts: string[]) => texts.map(() => new Array(1024).fill(0)),
          // Returns null so updateSummaries skips the write. A stub string here
          // clobbers the real summaries with "[verify] summary" — the harness must
          // not leave its fingerprints on the data it is checking.
          summarise: async () => null,
        },
        ws,
        {
          kind: entry.kind as never,
          title: entry.title,
          text: parsedFile.text,
          author: entry.author,
          participants: entry.participants,
          occurredAt: entry.occurredAt,
          originalRef: entry.originalRef,
        },
        {
          name: workspace.principal_name,
          company: workspace.principal_company,
          emails: [],
          timezone: workspace.timezone,
        },
      );

      const after = await loadReviewScreen(db, ws);
      const requeued = after.items.some(
        (item) => item.entityKind === "person" && item.headline === "Sarah",
      );

      check(
        "the corrected mention is not queued again",
        !requeued,
        `${report.reviewItemsQueued} item(s) queued this run`,
      );

      const { count: sarahRows } = await db
        .from("person")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", ws)
        .ilike("name", "Sarah%");

      check(
        "no duplicate Sarah was created",
        sarahRows === 1,
        `${sarahRows} row(s) matching "Sarah%"`,
      );
    }
  }

  // ── A4. Audit coverage and reversibility ───────────────────────────────────

  console.log("\nA4. Audit trail\n");

  const { data: audit } = await db
    .from("audit_log")
    .select("entity_kind, action, prev_value")
    .eq("workspace_id", ws);

  const kinds = new Set((audit ?? []).map((row) => row.entity_kind));

  for (const kind of ["person", "company", "commitment", "decision", "meeting"]) {
    check(`audit covers ${kind}`, kinds.has(kind), `kinds: ${[...kinds].join(", ")}`);
  }

  const withPrev = (audit ?? []).filter((row) => row.prev_value !== null);
  check(
    "at least one entry carries prev_value (the undo payload)",
    withPrev.length > 0,
    `${withPrev.length} of ${audit?.length ?? 0} entries`,
  );

  // ── A5. Reversibility ──────────────────────────────────────────────────────

  console.log("\nA5. Reverting an AI write\n");

  const { data: created } = await db
    .from("audit_log")
    .select("id, entity_kind, entity_id")
    .eq("workspace_id", ws)
    .eq("entity_kind", "company")
    .eq("action", "create")
    .limit(1)
    .maybeSingle();

  if (!created) {
    check("found a company create to revert", false);
  } else {
    // Ingestion enriches a company right after creating it, so the create entry is
    // already superseded. The staleness guard fires before the foreign-key path is
    // ever reached — labelled for what it actually proves, not what it looks like.
    const blocked = await revertAuditEntry(db, ws, created.id);
    check(
      "revert refuses a create that has since been updated",
      !blocked.ok && blocked.stale === true,
      blocked.message,
    );

    // The foreign-key refusal, exercised on its own: latest entry, but the row is
    // referenced. Without this the cascade behaviour is untested.
    const { data: referenced } = await db
      .from("company")
      .insert({ workspace_id: ws, name: "Referenced Co" })
      .select("id")
      .single();

    if (referenced) {
      await db
        .from("person")
        .insert({ workspace_id: ws, name: "Dependent Person", company_id: referenced.id });

      const { data: fkAudit } = await db
        .from("audit_log")
        .insert({
          workspace_id: ws,
          entity_kind: "company",
          entity_id: referenced.id,
          action: "create",
          reason: "verify harness — fk path",
          new_value: { name: "Referenced Co" } as never,
        })
        .select("id")
        .single();

      const fkBlocked = await revertAuditEntry(db, ws, fkAudit!.id);
      check(
        "revert refuses when another row still references it",
        !fkBlocked.ok && fkBlocked.stale !== true,
        fkBlocked.message,
      );
    }

    // A standalone row with no dependents should revert cleanly.
    const { data: orphan } = await db
      .from("company")
      .insert({ workspace_id: ws, name: "Revert Test Ltd" })
      .select("id")
      .single();

    if (!orphan) {
      check("created a standalone row to revert", false);
    } else {
      const { data: auditRow } = await db
        .from("audit_log")
        .insert({
          workspace_id: ws,
          entity_kind: "company",
          entity_id: orphan.id,
          action: "create",
          reason: "verify harness",
          new_value: { name: "Revert Test Ltd" } as never,
        })
        .select("id")
        .single();

      const undone = await revertAuditEntry(db, ws, auditRow!.id);
      check("revert removes a created row with no dependents", undone.ok, undone.message);

      const { count } = await db
        .from("company")
        .select("*", { count: "exact", head: true })
        .eq("id", orphan.id);
      check("the row is gone", (count ?? 0) === 0, `${count} row(s) remain`);

      const trail = await getAuditTrail(db, ws, "company", orphan.id);
      check(
        "the revert is itself audited",
        trail.some((entry) => entry.action === "delete"),
        `${trail.length} entr(ies) on the trail`,
      );
    }

    // Staleness: an entry that is no longer the latest must not be revertable.
    const { data: person } = await db
      .from("person")
      .select("id, name")
      .eq("workspace_id", ws)
      .limit(1)
      .single();

    if (person) {
      const { data: older } = await db
        .from("audit_log")
        .insert({
          workspace_id: ws,
          entity_kind: "person",
          entity_id: person.id,
          action: "update",
          field: "role",
          reason: "verify harness — older",
          prev_value: { role: "Old Role" } as never,
          new_value: { role: "Newer Role" } as never,
        })
        .select("id")
        .single();

      await db.from("audit_log").insert({
        workspace_id: ws,
        entity_kind: "person",
        entity_id: person.id,
        action: "update",
        field: "role",
        reason: "verify harness — newer",
        prev_value: { role: "Newer Role" } as never,
        new_value: { role: "Newest Role" } as never,
      });

      const stale = await revertAuditEntry(db, ws, older!.id);
      check(
        "a superseded entry cannot be reverted over a newer change",
        !stale.ok && stale.stale === true,
        stale.message,
      );
    }
  }

  // ── Provenance, re-checked ─────────────────────────────────────────────────

  console.log("\nProvenance\n");

  for (const table of ["commitment", "task", "decision"] as const) {
    const { data } = await db
      .from(table)
      .select("id, source_ids")
      .eq("workspace_id", ws);
    const bad = (data ?? []).filter((row) => row.source_ids.length === 0);
    check(`no ${table} without a source`, bad.length === 0, `${bad.length} unsourced`);
  }

  console.log(
    `\n${failures === 0 ? "All engine invariants hold." : `${failures} check(s) FAILED.`}\n`,
  );
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
