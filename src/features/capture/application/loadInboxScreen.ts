import "server-only";

import type { AdminClient } from "@shared/services/supabase/adminClient";
import type { SourceKind, StatusTone } from "@shared/interfaces/objects";
import { relativeAge } from "@shared/services/objectFeed";

/**
 * The Inbox: what has come in, and where each item got to in the pipeline.
 *
 * The status is shown rather than hidden because a source stuck at `chunking` with
 * "extraction unavailable" is the honest state of things — pretending everything
 * ingested cleanly is how a user ends up trusting an incomplete corpus.
 */

export type InboxRow = {
  id: string;
  kind: SourceKind;
  title: string;
  author: string | null;
  occurredAt: string | null;
  age: string;
  status: string;
  statusLabel: string;
  statusTone: StatusTone;
  error: string | null;
  chunks: number;
  embedded: number;
};

export type InboxState = {
  groups: { label: string; rows: InboxRow[] }[];
  total: number;
  pending: number;
};

const STATUS_COPY: Record<string, { label: string; tone: StatusTone }> = {
  captured: { label: "Captured", tone: "neutral" },
  extracting: { label: "Reading", tone: "neutral" },
  chunking: { label: "Awaiting extraction", tone: "warn" },
  analyzing: { label: "Analysing", tone: "neutral" },
  resolving: { label: "Resolving", tone: "neutral" },
  ingested: { label: "Ingested", tone: "good" },
  failed: { label: "Failed", tone: "crit" },
};

export async function loadInboxScreen(
  db: AdminClient,
  workspaceId: string,
  now: Date = new Date(),
): Promise<InboxState> {
  const { data, error } = await db
    .from("source")
    .select("id, kind, title, author, occurred_at, status, error")
    .eq("workspace_id", workspaceId)
    .order("occurred_at", { ascending: false, nullsFirst: false });

  if (error) console.warn("[rob-os] loadInboxScreen failed:", error.message);

  const sources = data ?? [];

  // One query for chunk counts rather than one per source.
  const { data: chunks } = await db
    .from("chunk")
    .select("source_id, embedding")
    .eq("workspace_id", workspaceId);

  const counts = new Map<string, { chunks: number; embedded: number }>();
  for (const chunk of chunks ?? []) {
    const entry = counts.get(chunk.source_id) ?? { chunks: 0, embedded: 0 };
    entry.chunks += 1;
    if (chunk.embedding !== null) entry.embedded += 1;
    counts.set(chunk.source_id, entry);
  }

  const rows: InboxRow[] = sources.map((source) => {
    const status = STATUS_COPY[source.status] ?? { label: source.status, tone: "neutral" as StatusTone };
    const count = counts.get(source.id) ?? { chunks: 0, embedded: 0 };
    return {
      id: source.id,
      kind: source.kind,
      title: source.title,
      author: source.author,
      occurredAt: source.occurred_at,
      age: relativeAge(source.occurred_at, now),
      status: source.status,
      statusLabel: status.label,
      statusTone: status.tone,
      error: source.error,
      chunks: count.chunks,
      embedded: count.embedded,
    };
  });

  // Needs-attention first, then the rest. A flat reverse-chronological list buries
  // the failures under everything that worked.
  const needsAttention = rows.filter((row) => row.status !== "ingested");
  const done = rows.filter((row) => row.status === "ingested");

  const groups: InboxState["groups"] = [];
  if (needsAttention.length > 0) {
    groups.push({ label: "Needs attention", rows: needsAttention });
  }
  if (done.length > 0) groups.push({ label: "Ingested", rows: done });

  return { groups, total: rows.length, pending: needsAttention.length };
}
