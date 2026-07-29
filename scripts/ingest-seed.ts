/**
 * Ingests the seed corpus.
 *
 *   npm run seed:ingest              # live — needs ANTHROPIC_API_KEY + VOYAGE_API_KEY
 *   npm run seed:ingest -- --fixtures  # use recorded extractions instead of Claude
 *   npm run seed:ingest -- --only omnilux
 *
 * `--fixtures` exists so the pipeline is verifiable without network access: every
 * stage runs for real against the database, with the two model calls replaced by
 * recorded output from `seed/fixtures/`. It is the harness, not a fallback — a
 * live run with keys present is the real thing.
 *
 * Must be run with `--conditions=react-server` (the npm script does this) so that
 * `import "server-only"` resolves to its no-op shim outside the Next compiler.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

const SEED_DIR = path.join(process.cwd(), "seed");
const FIXTURE_DIR = path.join(SEED_DIR, "fixtures", "extraction");

type Manifest = {
  workspace: {
    name: string;
    principalName: string;
    principalCompany: string | null;
    principalEmails: string[];
    timezone: string;
  };
  sources: {
    originalRef: string;
    kind: string;
    title: string;
    path: string;
    occurredAt: string | null;
    author: string | null;
    participants: string[];
  }[];
};

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const useFixtures = argv.includes("--fixtures");
  const onlyIndex = argv.indexOf("--only");
  const only = onlyIndex >= 0 ? argv[onlyIndex + 1]?.toLowerCase() : undefined;

  // Imported lazily so the env is loaded before any module reads it.
  const [
    { getAdminSupabase },
    { ingestSource, parseFile },
    { extractWithClaude, summariseWithClaude },
    { embed },
    { isClaudeConfigured, isVoyageConfigured },
  ] = await Promise.all([
    import("../src/shared/services/supabase/adminClient"),
    import("../src/features/ingestion"),
    import("../src/features/ingestion/services/claudeExtraction"),
    import("../src/shared/services/embeddings"),
    import("../src/shared/config/serverEnv"),
  ]);

  const db = getAdminSupabase();
  if (!db) {
    console.error(
      "No Supabase admin client. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    );
    process.exitCode = 1;
    return;
  }

  const manifest = JSON.parse(
    await readFile(path.join(SEED_DIR, "manifest.json"), "utf8"),
  ) as Manifest;

  // ── Workspace and owner ────────────────────────────────────────────────────
  // The owner is a real auth user so the foreign key and RLS story match
  // production rather than being special-cased for the seed.

  const ownerEmail = manifest.workspace.principalEmails[0] ?? "owner@example.com";
  let ownerId: string | null = null;

  const { data: existingUsers } = await db.auth.admin.listUsers();
  ownerId = existingUsers?.users.find((user) => user.email === ownerEmail)?.id ?? null;

  if (!ownerId) {
    const { data: created, error } = await db.auth.admin.createUser({
      email: ownerEmail,
      email_confirm: true,
    });
    if (error || !created.user) {
      console.error("Could not create the workspace owner:", error?.message);
      process.exitCode = 1;
      return;
    }
    ownerId = created.user.id;
  }

  const { data: existingWorkspace } = await db
    .from("workspace")
    .select()
    .eq("owner_user_id", ownerId)
    .maybeSingle();

  let workspaceId = existingWorkspace?.id ?? null;

  if (!workspaceId) {
    const { data: created, error } = await db
      .from("workspace")
      .insert({
        name: manifest.workspace.name,
        owner_user_id: ownerId,
        principal_name: manifest.workspace.principalName,
        principal_company: manifest.workspace.principalCompany,
        timezone: manifest.workspace.timezone,
      })
      .select()
      .single();

    if (error || !created) {
      console.error("Could not create the workspace:", error?.message);
      process.exitCode = 1;
      return;
    }
    workspaceId = created.id;
  }

  const principal = {
    name: manifest.workspace.principalName,
    company: manifest.workspace.principalCompany,
    emails: manifest.workspace.principalEmails,
    timezone: manifest.workspace.timezone,
  };

  // ── Ports ──────────────────────────────────────────────────────────────────

  const fixtures = new Map<string, unknown>();
  if (useFixtures) {
    let names: string[] = [];
    try {
      names = await readdir(FIXTURE_DIR);
    } catch {
      console.error(`No fixtures found at ${FIXTURE_DIR}`);
      process.exitCode = 1;
      return;
    }
    for (const name of names.filter((file) => file.endsWith(".json"))) {
      const raw = await readFile(path.join(FIXTURE_DIR, name), "utf8");
      fixtures.set(name.replace(/\.json$/, ""), JSON.parse(raw));
    }
    console.log(`Loaded ${fixtures.size} extraction fixture(s).`);
  }

  const fixtureKey = (originalRef: string) => originalRef.replace(/[^a-zA-Z0-9]+/g, "-");

  const extract = useFixtures
    ? async (source: { originalRef: string }) => {
        const found = fixtures.get(fixtureKey(source.originalRef));
        return (found ?? null) as never;
      }
    : extractWithClaude;

  const embedPort = useFixtures
    ? // Deterministic pseudo-embeddings: enough to prove the write path and the
      // vector index, not enough to mean anything semantically. Clearly labelled
      // so nobody mistakes a fixture run for a real retrieval test.
      async (texts: string[]) =>
        texts.map((text) => {
          const vector = new Array<number>(1024).fill(0);
          for (let i = 0; i < text.length; i += 1) {
            const slot = (text.charCodeAt(i) * (i + 1)) % 1024;
            vector[slot] = (vector[slot] ?? 0) + 1;
          }
          const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
          return vector.map((v) => v / norm);
        })
    : async (texts: string[]) => embed(texts, "document");

  const summarise = useFixtures
    ? async (subject: { kind: string; name: string }) =>
        `[fixture] Living summary for ${subject.kind} ${subject.name}.`
    : summariseWithClaude;

  if (!useFixtures) {
    if (!isClaudeConfigured) console.warn("ANTHROPIC_API_KEY not set — extraction will be skipped.");
    if (!isVoyageConfigured) console.warn("VOYAGE_API_KEY not set — embeddings will be skipped.");
  }

  // ── Run ────────────────────────────────────────────────────────────────────

  const selected = only
    ? manifest.sources.filter(
        (entry) =>
          entry.path.toLowerCase().includes(only) ||
          entry.title.toLowerCase().includes(only),
      )
    : manifest.sources;

  console.log(
    `\nIngesting ${selected.length} source(s) into workspace ${workspaceId}` +
      `${useFixtures ? " [fixtures]" : ""}\n`,
  );

  const totals = {
    chunks: 0,
    embedded: 0,
    created: 0,
    matched: 0,
    commitments: 0,
    tasks: 0,
    decisions: 0,
    review: 0,
    summaries: 0,
    failed: 0,
  };

  for (const entry of selected) {
    const absolute = path.join(SEED_DIR, entry.path);
    const content = await readFile(absolute, "utf8");
    const parsedFile = parseFile({
      filename: entry.path,
      content,
      kind: entry.kind as never,
    });

    // The manifest is authoritative over anything recovered from the file: it is
    // what the real connector would supply.
    const parsed = {
      kind: entry.kind as never,
      title: entry.title,
      text: parsedFile.text,
      author: entry.author ?? parsedFile.author,
      participants:
        entry.participants.length > 0 ? entry.participants : parsedFile.participants,
      occurredAt: entry.occurredAt ?? parsedFile.occurredAt,
      originalRef: entry.originalRef,
    };

    const report = await ingestSource(
      { db, extract: extract as never, embed: embedPort as never, summarise: summarise as never },
      workspaceId,
      parsed,
      principal,
    );

    totals.chunks += report.chunksWritten;
    totals.embedded += report.chunksEmbedded;
    totals.created +=
      report.peopleCreated + report.companiesCreated + report.projectsCreated;
    totals.matched +=
      report.peopleMatched + report.companiesMatched + report.projectsMatched;
    totals.commitments += report.commitmentsWritten;
    totals.tasks += report.tasksWritten;
    totals.decisions += report.decisionsWritten;
    totals.review += report.reviewItemsQueued;
    totals.summaries += report.summariesUpdated;
    if (report.error) totals.failed += 1;

    const flag = report.error ? "✗" : "·";
    console.log(
      `${flag} ${entry.title}\n` +
        `    chunks ${report.chunksWritten} (${report.chunksEmbedded} embedded)` +
        `  entities +${
          report.peopleCreated + report.companiesCreated + report.projectsCreated
        }/~${report.peopleMatched + report.companiesMatched + report.projectsMatched}` +
        `  commitments ${report.commitmentsWritten}` +
        `  tasks ${report.tasksWritten}` +
        `  decisions ${report.decisionsWritten}` +
        `  review ${report.reviewItemsQueued}` +
        `  summaries ${report.summariesUpdated}`,
    );

    if (report.error) console.log(`    error: ${report.error}`);
    for (const skipped of report.skipped) console.log(`    skipped: ${skipped}`);
  }

  console.log(
    `\nTotals: ${totals.chunks} chunks (${totals.embedded} embedded), ` +
      `${totals.created} entities created, ${totals.matched} matched, ` +
      `${totals.commitments} commitments, ${totals.tasks} tasks, ` +
      `${totals.decisions} decisions, ${totals.review} review items, ` +
      `${totals.summaries} summaries.` +
      (totals.failed > 0 ? ` ${totals.failed} source(s) failed.` : ""),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
