import "server-only";

import type { AdminClient } from "@shared/services/supabase/adminClient";
import type { Enums, Inserts, Tables, Updates } from "@shared/interfaces/db";

import { normalizeName } from "../domain/resolution";
import type { ParsedSource, PendingChunk } from "../domain/types";

/**
 * All database I/O for ingestion, in one place. The pipeline takes a client as an
 * argument rather than reaching for one, so the same code runs from a server
 * action and from the seed script.
 *
 * Every function here degrades: a failed write is logged and reported as null,
 * never thrown out of the call. The pipeline decides what a failure means.
 */

function warn(scope: string, error: unknown): void {
  console.warn(`[rob-os] ingestion ${scope} failed:`, error);
}

// ── Sources ──────────────────────────────────────────────────────────────────

/**
 * Upsert on `original_ref`, which is unique per workspace. Re-ingesting the same
 * artefact updates it rather than creating a second copy, which is what makes the
 * pipeline safe to retry.
 */
export async function upsertSource(
  db: AdminClient,
  workspaceId: string,
  parsed: ParsedSource,
): Promise<Tables<"source"> | null> {
  const row: Inserts<"source"> = {
    workspace_id: workspaceId,
    kind: parsed.kind,
    title: parsed.title,
    original_ref: parsed.originalRef,
    body: parsed.text,
    author: parsed.author,
    participants: parsed.participants,
    occurred_at: parsed.occurredAt,
    storage_path: parsed.storagePath ?? null,
    metadata: (parsed.metadata ?? {}) as never,
    status: "captured",
    error: null,
  };

  const { data, error } = await db
    .from("source")
    .upsert(row, { onConflict: "workspace_id,original_ref" })
    .select()
    .single();

  if (error) {
    warn("upsertSource", error);
    return null;
  }
  return data;
}

export async function setSourceStatus(
  db: AdminClient,
  sourceId: string,
  status: Enums<"source_status">,
  error?: string | null,
): Promise<void> {
  const patch: Updates<"source"> = { status, error: error ?? null };
  if (status === "ingested") patch.ingested_at = new Date().toISOString();

  const { error: writeError } = await db.from("source").update(patch).eq("id", sourceId);
  if (writeError) warn("setSourceStatus", writeError);
}

// ── Chunks ───────────────────────────────────────────────────────────────────

/**
 * Replace a source's chunks wholesale. Deleting first means a re-ingest after a
 * chunker change cannot leave orphaned chunks behind that retrieval would still
 * happily cite.
 */
export async function replaceChunks(
  db: AdminClient,
  workspaceId: string,
  sourceId: string,
  chunks: PendingChunk[],
): Promise<Tables<"chunk">[] | null> {
  const { error: deleteError } = await db.from("chunk").delete().eq("source_id", sourceId);
  if (deleteError) {
    warn("replaceChunks.delete", deleteError);
    return null;
  }

  if (chunks.length === 0) return [];

  const rows: Inserts<"chunk">[] = chunks.map((chunk) => ({
    workspace_id: workspaceId,
    source_id: sourceId,
    chunk_index: chunk.index,
    content: chunk.content,
    token_start: chunk.tokenStart,
    token_end: chunk.tokenEnd,
  }));

  const { data, error } = await db.from("chunk").insert(rows).select();
  if (error) {
    warn("replaceChunks.insert", error);
    return null;
  }
  return data;
}

export async function setChunkEmbedding(
  db: AdminClient,
  chunkId: string,
  embedding: number[],
): Promise<boolean> {
  // pgvector accepts the bracketed literal form over the wire.
  const { error } = await db
    .from("chunk")
    .update({
      embedding: JSON.stringify(embedding),
      embedded_at: new Date().toISOString(),
    })
    .eq("id", chunkId);

  if (error) {
    warn("setChunkEmbedding", error);
    return false;
  }
  return true;
}

// ── Entity lookup ────────────────────────────────────────────────────────────

/**
 * Candidate fetch for resolution. Deliberately generous: it pulls anything whose
 * name shares a token or whose alias list mentions the surface form, and lets the
 * scorer in `domain/resolution.ts` do the judging. Narrowing here would hide
 * candidates from the ambiguity check, which is the one thing that must not
 * happen.
 */
export async function findPersonCandidates(
  db: AdminClient,
  workspaceId: string,
  mention: string,
  email: string | null,
): Promise<Tables<"person">[]> {
  const tokens = mention
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 2);

  const filters = [
    `name.ilike.%${mention}%`,
    ...tokens.map((token) => `name.ilike.%${token}%`),
    `aliases.cs.{"${mention}"}`,
  ];
  if (email) filters.push(`emails.cs.{"${email.toLowerCase()}"}`);

  const { data, error } = await db
    .from("person")
    .select()
    .eq("workspace_id", workspaceId)
    .or(filters.join(","))
    .limit(25);

  if (error) {
    warn("findPersonCandidates", error);
    return [];
  }
  return data ?? [];
}

export async function findCompanyCandidates(
  db: AdminClient,
  workspaceId: string,
  mention: string,
): Promise<Tables<"company">[]> {
  const { data, error } = await db
    .from("company")
    .select()
    .eq("workspace_id", workspaceId)
    .or(`name.ilike.%${mention}%,aliases.cs.{"${mention}"}`)
    .limit(25);

  if (error) {
    warn("findCompanyCandidates", error);
    return [];
  }
  return data ?? [];
}

export async function findProjectCandidates(
  db: AdminClient,
  workspaceId: string,
  mention: string,
): Promise<Tables<"project">[]> {
  const { data, error } = await db
    .from("project")
    .select()
    .eq("workspace_id", workspaceId)
    .or(`name.ilike.%${mention}%,aliases.cs.{"${mention}"}`)
    .limit(25);

  if (error) {
    warn("findProjectCandidates", error);
    return [];
  }
  return data ?? [];
}

// ── Entity writes ────────────────────────────────────────────────────────────

export async function createPerson(
  db: AdminClient,
  row: Inserts<"person">,
): Promise<Tables<"person"> | null> {
  const { data, error } = await db.from("person").insert(row).select().single();
  if (error) {
    warn("createPerson", error);
    return null;
  }
  return data;
}

export async function createCompany(
  db: AdminClient,
  row: Inserts<"company">,
): Promise<Tables<"company"> | null> {
  const { data, error } = await db.from("company").insert(row).select().single();
  if (error) {
    warn("createCompany", error);
    return null;
  }
  return data;
}

export async function createProject(
  db: AdminClient,
  row: Inserts<"project">,
): Promise<Tables<"project"> | null> {
  const { data, error } = await db.from("project").insert(row).select().single();
  if (error) {
    warn("createProject", error);
    return null;
  }
  return data;
}

/**
 * Fold newly-seen surface forms and emails into an existing row. Union rather
 * than replace: a name we saw once is still a name that might turn up again, and
 * losing it would make the same mention ambiguous next time.
 */
export async function enrichPerson(
  db: AdminClient,
  person: Tables<"person">,
  patch: {
    alias?: string | null;
    email?: string | null;
    role?: string | null;
    companyId?: string | null;
    lastInteraction?: string | null;
  },
): Promise<void> {
  const aliases = new Set(person.aliases);
  if (patch.alias && patch.alias.toLowerCase() !== person.name.toLowerCase()) {
    aliases.add(patch.alias);
  }

  const emails = new Set(person.emails.map((email) => email.toLowerCase()));
  if (patch.email) emails.add(patch.email.toLowerCase());

  const update: Updates<"person"> = {
    aliases: [...aliases],
    emails: [...emails],
  };

  if (!person.role && patch.role) update.role = patch.role;
  if (!person.company_id && patch.companyId) update.company_id = patch.companyId;

  // Only ever move `last_interaction` forwards — a backfill of old email must not
  // make a cold contact look warm.
  if (
    patch.lastInteraction &&
    (!person.last_interaction || patch.lastInteraction > person.last_interaction)
  ) {
    update.last_interaction = patch.lastInteraction;
  }

  const { error } = await db.from("person").update(update).eq("id", person.id);
  if (error) warn("enrichPerson", error);
}

export async function enrichCompany(
  db: AdminClient,
  company: Tables<"company">,
  patch: { alias?: string | null; industry?: string | null; domain?: string | null },
): Promise<void> {
  const aliases = new Set(company.aliases);
  if (patch.alias && patch.alias.toLowerCase() !== company.name.toLowerCase()) {
    aliases.add(patch.alias);
  }

  const domains = new Set(company.domains.map((domain) => domain.toLowerCase()));
  if (patch.domain) domains.add(patch.domain.toLowerCase());

  const update: Updates<"company"> = {
    aliases: [...aliases],
    domains: [...domains],
  };
  if (!company.industry && patch.industry) update.industry = patch.industry;

  const { error } = await db.from("company").update(update).eq("id", company.id);
  if (error) warn("enrichCompany", error);
}

// ── Claims ───────────────────────────────────────────────────────────────────

export async function insertCommitments(
  db: AdminClient,
  rows: Inserts<"commitment">[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const { data, error } = await db.from("commitment").insert(rows).select("id");
  if (error) {
    warn("insertCommitments", error);
    return 0;
  }
  return data?.length ?? 0;
}

export async function insertTasks(
  db: AdminClient,
  rows: Inserts<"task">[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const { data, error } = await db.from("task").insert(rows).select("id");
  if (error) {
    warn("insertTasks", error);
    return 0;
  }
  return data?.length ?? 0;
}

/**
 * Returns the inserted ids in input order, so callers can attach the people each
 * decision binds without a second lookup.
 */
export async function insertDecisionsReturning(
  db: AdminClient,
  rows: Inserts<"decision">[],
): Promise<{ id: string }[]> {
  if (rows.length === 0) return [];
  const { data, error } = await db.from("decision").insert(rows).select("id");
  if (error) {
    warn("insertDecisionsReturning", error);
    return [];
  }
  return data ?? [];
}

/** Wipes this source's previously extracted claims so a re-ingest is idempotent. */
export async function clearSourceClaims(
  db: AdminClient,
  sourceId: string,
): Promise<void> {
  const filter = `{${sourceId}}`;
  for (const table of ["commitment", "task", "decision"] as const) {
    const { error } = await db.from(table).delete().contains("source_ids", filter);
    if (error) warn(`clearSourceClaims.${table}`, error);
  }

  const { error: mentionError } = await db
    .from("source_mention")
    .delete()
    .eq("source_id", sourceId);
  if (mentionError) warn("clearSourceClaims.source_mention", mentionError);

  // Pending review items are re-derivable from the source, so they are cleared
  // and re-queued. Resolved ones are *user decisions* — they carry the correction
  // that feeds `resolution_hint`, and deleting them would make the system forget
  // an answer it was already given.
  const { error: reviewError } = await db
    .from("review_item")
    .delete()
    .eq("source_id", sourceId)
    .eq("status", "pending");
  if (reviewError) warn("clearSourceClaims.review_item", reviewError);
}

export async function insertMentions(
  db: AdminClient,
  rows: Inserts<"source_mention">[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db.from("source_mention").insert(rows);
  if (error) warn("insertMentions", error);
}

// ── Review queue and memory ──────────────────────────────────────────────────

export async function enqueueReview(
  db: AdminClient,
  row: Inserts<"review_item">,
): Promise<boolean> {
  const { error } = await db.from("review_item").insert(row);
  if (error) {
    warn("enqueueReview", error);
    return false;
  }
  return true;
}

/** Corrections the user already made, consulted before resolution guesses again. */
export async function getResolutionHints(
  db: AdminClient,
  workspaceId: string,
  entityKind: string,
  mentions: string[],
): Promise<Map<string, { entityId: string | null }>> {
  const out = new Map<string, { entityId: string | null }>();
  if (mentions.length === 0) return out;

  const { data, error } = await db
    .from("resolution_hint")
    .select("mention, entity_id")
    .eq("workspace_id", workspaceId)
    .eq("entity_kind", entityKind)
    .in(
      "mention",
      // Must match how `applyReviewDecision` stores it, or a correction is
      // written and never found again.
      mentions.map((mention) => normalizeName(mention)),
    );

  if (error) {
    warn("getResolutionHints", error);
    return out;
  }

  for (const row of data ?? []) {
    out.set(row.mention, { entityId: row.entity_id });
  }
  return out;
}

export async function writeAudit(
  db: AdminClient,
  rows: Inserts<"audit_log">[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db.from("audit_log").insert(rows);
  if (error) warn("writeAudit", error);
}

// ── Summaries ────────────────────────────────────────────────────────────────

export async function getWorkspace(
  db: AdminClient,
  workspaceId: string,
): Promise<Tables<"workspace"> | null> {
  const { data, error } = await db
    .from("workspace")
    .select()
    .eq("id", workspaceId)
    .single();

  if (error) {
    warn("getWorkspace", error);
    return null;
  }
  return data;
}

/** The most recent excerpts touching an object, for the living-summary pass. */
export async function getExcerptsForEntity(
  db: AdminClient,
  workspaceId: string,
  column: "person_id" | "company_id" | "project_id",
  entityId: string,
  limit = 8,
): Promise<{ title: string; occurredAt: string | null; content: string; sourceId: string }[]> {
  const { data, error } = await db
    .from("source_mention")
    .select("excerpt, source_id, source!inner(title, occurred_at)")
    .eq("workspace_id", workspaceId)
    .eq(column, entityId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    warn("getExcerptsForEntity", error);
    return [];
  }

  return (data ?? []).flatMap((row) => {
    const source = row.source as unknown as
      | { title: string; occurred_at: string | null }
      | null;
    if (!source || !row.excerpt) return [];
    return [
      {
        title: source.title,
        occurredAt: source.occurred_at,
        content: row.excerpt,
        sourceId: row.source_id,
      },
    ];
  });
}

// ── Meetings ─────────────────────────────────────────────────────────────────

/**
 * A meeting-kind source becomes a meeting *object*, not just a stored transcript.
 * Upserts on `transcript_source_id` so re-ingesting the same transcript refreshes
 * the meeting rather than creating a second one.
 */
export async function upsertMeeting(
  db: AdminClient,
  row: Inserts<"meeting">,
): Promise<Tables<"meeting"> | null> {
  const { data, error } = await db
    .from("meeting")
    .upsert(row, { onConflict: "transcript_source_id" })
    .select()
    .single();

  if (error) {
    warn("upsertMeeting", error);
    return null;
  }
  return data;
}

// ── Relationship edges ───────────────────────────────────────────────────────
// All upserts on their composite primary keys, so a re-ingest is idempotent
// without needing to delete first.

/**
 * Drops duplicate keys within a single batch.
 *
 * Postgres rejects an `on conflict do update` whose own statement touches the same
 * row twice ("cannot affect row a second time"). That happens as soon as two
 * mentions resolve to the same entity — "Sarah" and "Sarah Lin" both landing on
 * Sarah Lin — which is exactly what a working resolution step is supposed to do.
 * So the dedupe lives here rather than in each caller.
 */
function dedupeBy<T>(rows: T[], key: (row: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const row of rows) {
    // Last wins: later rows in a batch carry the same or better provenance.
    seen.set(key(row), row);
  }
  return [...seen.values()];
}

export async function linkPersonCompany(
  db: AdminClient,
  rows: Inserts<"person_company">[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db
    .from("person_company")
    .upsert(dedupeBy(rows, (row) => `${row.person_id}:${row.company_id}`), {
      onConflict: "person_id,company_id",
    });
  if (error) warn("linkPersonCompany", error);
}

export async function linkProjectPerson(
  db: AdminClient,
  rows: Inserts<"project_person">[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db
    .from("project_person")
    .upsert(dedupeBy(rows, (row) => `${row.project_id}:${row.person_id}`), {
      onConflict: "project_id,person_id",
    });
  if (error) warn("linkProjectPerson", error);
}

export async function linkProjectCompany(
  db: AdminClient,
  rows: Inserts<"project_company">[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db
    .from("project_company")
    .upsert(dedupeBy(rows, (row) => `${row.project_id}:${row.company_id}`), {
      onConflict: "project_id,company_id",
    });
  if (error) warn("linkProjectCompany", error);
}

export async function linkMeetingPerson(
  db: AdminClient,
  rows: Inserts<"meeting_person">[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db
    .from("meeting_person")
    .upsert(dedupeBy(rows, (row) => `${row.meeting_id}:${row.person_id}`), {
      onConflict: "meeting_id,person_id",
    });
  if (error) warn("linkMeetingPerson", error);
}

export async function linkDecisionPerson(
  db: AdminClient,
  rows: Inserts<"decision_person">[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db
    .from("decision_person")
    .upsert(dedupeBy(rows, (row) => `${row.decision_id}:${row.person_id}`), {
      onConflict: "decision_id,person_id",
    });
  if (error) warn("linkDecisionPerson", error);
}

// ── Resolution memory ────────────────────────────────────────────────────────

/**
 * Persists a correction the user made in the Review Queue. `entityId: null` means
 * "this mention is never an entity" — a rejection is memory too, and without it
 * the same false positive re-queues on every re-ingest.
 */
export async function upsertResolutionHint(
  db: AdminClient,
  row: Inserts<"resolution_hint">,
): Promise<boolean> {
  const { error } = await db
    .from("resolution_hint")
    .upsert(row, { onConflict: "workspace_id,entity_kind,mention" });

  if (error) {
    warn("upsertResolutionHint", error);
    return false;
  }
  return true;
}
