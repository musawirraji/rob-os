import "server-only";

import type { AdminClient } from "@shared/services/supabase/adminClient";
import type { SourceKind } from "@shared/interfaces/objects";
import { embed } from "@shared/services/embeddings";
import {
  extractWithClaude,
  ingestSource,
  parseFile,
  summariseWithClaude,
  type IngestionReport,
  type ParsedSource,
} from "@features/ingestion";
import { extractorFor } from "@features/ingestion/services/parsers/binary";
import { storeOriginal } from "@features/ingestion/services/sourceStorage";

/**
 * The two ways a source gets in by hand: a pasted body, or an uploaded file.
 *
 * Both converge on the same `ingestSource` pipeline the seed script uses — there
 * is one ingestion path, not a "real" one and a "manual" one. The only difference
 * is how the text and the original are obtained.
 *
 * Order matters and is deliberate: the original is stored *before* parsing, so a
 * parser failure loses nothing and the file is still there to retry against.
 */

export type CaptureResult = {
  ok: boolean;
  message: string;
  report: IngestionReport | null;
};

function principalFrom(workspace: {
  principal_name: string;
  principal_company: string | null;
  timezone: string;
}) {
  return {
    name: workspace.principal_name,
    company: workspace.principal_company,
    emails: [],
    timezone: workspace.timezone,
  };
}

async function loadWorkspace(db: AdminClient, workspaceId: string) {
  const { data } = await db
    .from("workspace")
    .select("principal_name, principal_company, timezone")
    .eq("id", workspaceId)
    .single();
  return data;
}

async function run(
  db: AdminClient,
  workspaceId: string,
  parsed: ParsedSource,
): Promise<CaptureResult> {
  const workspace = await loadWorkspace(db, workspaceId);
  if (!workspace) return { ok: false, message: "Workspace not found.", report: null };

  const report = await ingestSource(
    {
      db,
      extract: extractWithClaude,
      embed: (texts) => embed(texts, "document"),
      summarise: summariseWithClaude,
    },
    workspaceId,
    parsed,
    principalFrom(workspace),
  );

  if (report.error) {
    return { ok: false, message: `Captured, but ingestion failed: ${report.error}`, report };
  }

  // Report what actually happened, including what was skipped. "Captured" alone
  // would imply the corpus is now searchable when the model may not have run.
  const parts = [`${report.chunksWritten} chunk${report.chunksWritten === 1 ? "" : "s"}`];
  if (report.chunksEmbedded > 0) parts.push(`${report.chunksEmbedded} embedded`);
  const created =
    report.peopleCreated + report.companiesCreated + report.projectsCreated;
  if (created > 0) parts.push(`${created} new record${created === 1 ? "" : "s"}`);
  if (report.commitmentsWritten > 0) {
    parts.push(`${report.commitmentsWritten} commitment${report.commitmentsWritten === 1 ? "" : "s"}`);
  }
  if (report.reviewItemsQueued > 0) parts.push(`${report.reviewItemsQueued} to review`);

  const skipped =
    report.skipped.length > 0 ? ` Skipped: ${report.skipped.join("; ")}.` : "";

  return {
    ok: true,
    message: `Captured "${parsed.title}" — ${parts.join(", ")}.${skipped}`,
    report,
  };
}

// ── Paste ────────────────────────────────────────────────────────────────────

export async function captureText(
  db: AdminClient,
  workspaceId: string,
  input: { title: string; kind: SourceKind; text: string; occurredAt: string | null },
): Promise<CaptureResult> {
  const text = input.text.trim();
  if (text.length < 20) {
    return {
      ok: false,
      message: "Too short to be worth ingesting — paste at least a sentence or two.",
      report: null,
    };
  }

  const title = input.title.trim() || text.slice(0, 60).replace(/\s+/g, " ");

  return run(db, workspaceId, {
    kind: input.kind,
    title,
    text,
    author: null,
    participants: [],
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    // Content-addressed by title and length, so pasting the same thing twice
    // updates one source rather than making two.
    originalRef: `paste:${title.toLowerCase().replace(/\s+/g, "-").slice(0, 60)}:${text.length}`,
    metadata: { capturedBy: "paste" },
  });
}

// ── Upload ───────────────────────────────────────────────────────────────────

export async function captureFile(
  db: AdminClient,
  workspaceId: string,
  file: { name: string; type: string | null; bytes: Uint8Array },
  kind: SourceKind,
): Promise<CaptureResult> {
  if (file.bytes.byteLength === 0) {
    return { ok: false, message: "That file is empty.", report: null };
  }

  const extractor = extractorFor(file.name, file.type);
  if (extractor === null) {
    return {
      ok: false,
      message: `Cannot read ${file.name}. Supported: PDF, docx, eml, csv, txt, md, and images (stored pending OCR).`,
      report: null,
    };
  }

  // Original first — before any parsing can fail.
  const stored = await storeOriginal(db, workspaceId, file.name, file.bytes, file.type);

  let text: string | null = null;
  let reason: string | null = null;
  let meta: Record<string, unknown> = {};
  let title = file.name;
  let author: string | null = null;
  let participants: string[] = [];
  let occurredAt: string | null = null;

  if (extractor === "text") {
    const content = new TextDecoder().decode(file.bytes);
    const parsedFile = parseFile({ filename: file.name, content, kind });
    text = parsedFile.text;
    title = parsedFile.title ?? file.name;
    author = parsedFile.author;
    participants = parsedFile.participants;
    occurredAt = parsedFile.occurredAt;
  } else {
    const result = await extractor(file.bytes);
    text = result.text;
    reason = result.reason;
    meta = result.meta;
  }

  if (stored.reason) meta = { ...meta, storageWarning: stored.reason };

  // Unreadable but stored is a real, useful state — the file is safe and the
  // Inbox says what is missing. Fabricating an empty body would hide that.
  if (text === null || text.trim().length === 0) {
    const { error } = await db.from("source").upsert(
      {
        workspace_id: workspaceId,
        kind,
        title,
        original_ref: `upload:${file.name}:${file.bytes.byteLength}`,
        storage_path: stored.path,
        body: null,
        occurred_at: occurredAt ?? new Date().toISOString(),
        status: "failed",
        error: reason ?? "no text could be extracted",
        metadata: { ...meta, capturedBy: "upload", filename: file.name } as never,
      },
      { onConflict: "workspace_id,original_ref" },
    );

    return {
      ok: false,
      message: error
        ? `Could not record ${file.name}: ${error.message}`
        : `Stored ${file.name}, but ${reason ?? "no text could be extracted"}. It's in the Inbox.`,
      report: null,
    };
  }

  return run(db, workspaceId, {
    kind,
    title,
    text,
    author,
    participants,
    occurredAt: occurredAt ?? new Date().toISOString(),
    originalRef: `upload:${file.name}:${file.bytes.byteLength}`,
    storagePath: stored.path,
    metadata: { ...meta, capturedBy: "upload", filename: file.name },
  });
}
