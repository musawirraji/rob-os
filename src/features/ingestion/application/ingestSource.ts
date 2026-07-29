import "server-only";

import type { AdminClient } from "@shared/services/supabase/adminClient";

import { chunkText } from "../domain/chunking";
import type { EmbeddingPort, ExtractionPort, SummaryPort } from "../domain/ports";
import type { PrincipalContext } from "../domain/prompts";
import type { IngestionReport, ParsedSource } from "../domain/types";
import { validateExtraction } from "../domain/validation";
import * as repo from "../services/ingestionRepository";

import { resolveEntities } from "./resolveEntities";
import { updateSummaries } from "./updateSummaries";
import { upsertMeetingObject } from "./upsertMeetingObject";
import { writeClaims } from "./writeClaims";

/**
 * The ingestion pipeline (brief §7).
 *
 *   store original → extract text → chunk → embed → extract entities →
 *   resolve → write with provenance → refresh living summaries
 *
 * Three properties matter more than throughput:
 *
 * **Idempotent.** Sources upsert on `original_ref`; chunks and this source's
 * previously extracted claims are deleted before rewriting. Running it twice
 * produces the same database, so a retry is always safe.
 *
 * **Retry-safe.** `source.status` records the stage reached and `source.error`
 * the reason it stopped, so a failed run can be resumed rather than guessed at.
 *
 * **Honest.** A stage that could not run is named in `report.skipped`. It never
 * reports a clean run over work it silently did not do — which for this product
 * would be the same class of failure as a confident wrong answer.
 */

export type IngestDeps = {
  db: AdminClient;
  extract: ExtractionPort;
  embed: EmbeddingPort;
  summarise: SummaryPort;
};

export async function ingestSource(
  deps: IngestDeps,
  workspaceId: string,
  parsed: ParsedSource,
  principal: PrincipalContext,
): Promise<IngestionReport> {
  const { db, extract, embed, summarise } = deps;

  const report: IngestionReport = {
    sourceId: null,
    title: parsed.title,
    originalRef: parsed.originalRef,
    chunksWritten: 0,
    chunksEmbedded: 0,
    peopleCreated: 0,
    peopleMatched: 0,
    companiesCreated: 0,
    companiesMatched: 0,
    projectsCreated: 0,
    projectsMatched: 0,
    commitmentsWritten: 0,
    tasksWritten: 0,
    decisionsWritten: 0,
    reviewItemsQueued: 0,
    summariesUpdated: 0,
    skipped: [],
    error: null,
  };

  // ── 1. Store the original ──────────────────────────────────────────────────
  // First, and before anything can fail. Capture must never be lost to a
  // downstream error.

  const source = await repo.upsertSource(db, workspaceId, parsed);
  if (!source) {
    report.error = "could not store source";
    return report;
  }
  report.sourceId = source.id;

  try {
    // ── 2. Chunk ─────────────────────────────────────────────────────────────

    await repo.setSourceStatus(db, source.id, "chunking");
    const pending = chunkText(parsed.text);
    const chunks = await repo.replaceChunks(db, workspaceId, source.id, pending);

    if (chunks === null) {
      report.error = "could not write chunks";
      await repo.setSourceStatus(db, source.id, "failed", report.error);
      return report;
    }
    report.chunksWritten = chunks.length;

    // ── 3. Embed ─────────────────────────────────────────────────────────────
    // Without embeddings a source is still searchable by full text, so a Voyage
    // outage degrades retrieval rather than blocking ingestion.

    if (chunks.length > 0) {
      const vectors = await embed(chunks.map((chunk) => chunk.content));

      if (vectors === null) {
        report.skipped.push("embeddings (Voyage unavailable) — full-text search only");
      } else {
        for (const [index, chunk] of chunks.entries()) {
          const vector = vectors[index];
          if (!vector) continue;
          if (await repo.setChunkEmbedding(db, chunk.id, vector)) {
            report.chunksEmbedded += 1;
          }
        }
      }
    }

    // ── 4. Extract ───────────────────────────────────────────────────────────

    await repo.setSourceStatus(db, source.id, "analyzing");
    const raw = await extract(parsed, principal);

    if (raw === null) {
      report.skipped.push("entity extraction (Claude unavailable)");
      await repo.setSourceStatus(
        db,
        source.id,
        "chunking",
        "extraction unavailable — chunks stored, entities pending",
      );
      return report;
    }

    // Drop anything whose quote is not in the source. A claim we cannot point at
    // is a fabrication, however plausible it reads.
    const { extraction, dropped } = validateExtraction(raw, parsed.text);
    for (const item of dropped) {
      report.skipped.push(`${item.kind} "${item.label}" — ${item.reason}`);
    }

    // ── 5. Resolve ───────────────────────────────────────────────────────────

    await repo.setSourceStatus(db, source.id, "resolving");
    // Clear this source's prior claims so a re-ingest replaces rather than
    // duplicates them.
    await repo.clearSourceClaims(db, source.id);

    // Only correspondence counts as an interaction. A CRM export or a note that
    // happens to name someone is not contact with them, and treating it as such
    // would make every relationship in the pipeline look freshly warm the moment a
    // dump was ingested.
    const interactionAt =
      parsed.kind === "email" || parsed.kind === "meeting" ? parsed.occurredAt : null;

    const entities = await resolveEntities(
      db,
      workspaceId,
      source.id,
      extraction,
      interactionAt,
    );
    report.peopleCreated = entities.peopleCreated;
    report.peopleMatched = entities.peopleMatched;
    report.companiesCreated = entities.companiesCreated;
    report.companiesMatched = entities.companiesMatched;
    report.projectsCreated = entities.projectsCreated;
    report.projectsMatched = entities.projectsMatched;
    report.reviewItemsQueued = entities.reviewItemsQueued;

    // ── 5b. Promote a transcript to a meeting object ──────────────────────────
    // Ordered here on purpose: it needs the resolved company and project, and the
    // claims written next need the meeting id.

    const { meetingId, skipped: meetingSkipped } = await upsertMeetingObject(
      db,
      workspaceId,
      source.id,
      parsed,
      extraction,
      entities,
    );
    if (meetingSkipped) report.skipped.push(meetingSkipped);

    // ── 6. Write claims with provenance ──────────────────────────────────────

    const claims = await writeClaims(
      db,
      workspaceId,
      source.id,
      extraction,
      entities,
      meetingId,
    );
    report.commitmentsWritten = claims.commitmentsWritten;
    report.tasksWritten = claims.tasksWritten;
    report.decisionsWritten = claims.decisionsWritten;
    report.reviewItemsQueued += claims.reviewItemsQueued;

    // ── 7. Refresh living summaries ──────────────────────────────────────────

    const summaries = await updateSummaries(
      db,
      workspaceId,
      entities,
      principal,
      summarise,
    );
    report.summariesUpdated = summaries.summariesUpdated;
    report.skipped.push(...summaries.skipped);

    await repo.setSourceStatus(db, source.id, "ingested");
    return report;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    await repo.setSourceStatus(db, source.id, "failed", report.error);
    return report;
  }
}
