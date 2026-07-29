import "server-only";

import type { AdminClient } from "@shared/services/supabase/adminClient";
import type { MatchedChunk } from "@shared/interfaces/db";
import { embedQuery } from "@shared/services/embeddings";

import type { StructuredFact } from "../domain/prompts";
import type { AnsweredObject, Citation, QueryPlan } from "../domain/types";

/**
 * Step 2: hybrid retrieval.
 *
 * Two halves, deliberately. `match_chunks` finds the *prose* — the sentence where
 * the promise was made. The structured lookups read the *object tables* — the row
 * that says a commitment is overdue. A question like "what's slipping" needs both:
 * the row knows the deadline passed, only the prose can say what was promised.
 */

export type RetrievalResult = {
  citations: Citation[];
  facts: StructuredFact[];
  objects: AnsweredObject[];
  /** Named degradations, e.g. vector arm unavailable. Surfaced, never hidden. */
  degraded: string[];
};

function truncate(text: string, limit = 900): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}…`;
}

export async function retrieve(
  db: AdminClient,
  workspaceId: string,
  question: string,
  plan: QueryPlan,
): Promise<RetrievalResult> {
  const degraded: string[] = [];

  // ── Vector arm ─────────────────────────────────────────────────────────────
  // A missing embedding is not fatal: `match_chunks` falls back to full text, and
  // the caller is told the search was narrower than usual.

  const queryEmbedding = await embedQuery(question);
  if (queryEmbedding === null) {
    degraded.push("semantic search unavailable — full-text retrieval only");
  }

  const { data: matches, error } = await db.rpc("match_chunks", {
    p_workspace_id: workspaceId,
    p_query_embedding: queryEmbedding ? JSON.stringify(queryEmbedding) : undefined,
    p_query_text: question,
    p_match_count: plan.matchCount,
    p_semantic_weight: plan.semanticWeight,
    p_full_text_weight: plan.fullTextWeight,
    p_since: plan.since ?? undefined,
    p_source_kinds: plan.sourceKinds ?? undefined,
  });

  if (error) {
    console.warn("[rob-os] match_chunks failed:", error);
    degraded.push("chunk retrieval failed");
  }

  const rows = (matches ?? []) as MatchedChunk[];

  const citations: Citation[] = rows.map((row, position) => ({
    index: position + 1,
    sourceId: row.source_id,
    chunkId: row.chunk_id,
    kind: row.source_kind,
    title: row.source_title,
    occurredAt: row.occurred_at,
    excerpt: truncate(row.content),
  }));

  // Which source each citation number belongs to, so a structured fact drawn from
  // the same source can point at an excerpt the user can actually open.
  const citationBySource = new Map<string, number>();
  for (const citation of citations) {
    if (!citationBySource.has(citation.sourceId)) {
      citationBySource.set(citation.sourceId, citation.index);
    }
  }

  const facts: StructuredFact[] = [];
  const objects: AnsweredObject[] = [];

  const wants = (kind: string) => plan.objectTypes.includes(kind as never);

  // ── Commitments ────────────────────────────────────────────────────────────

  if (wants("commitment")) {
    const { data } = await db
      .from("commitment")
      .select(
        "id, what, deadline, status, commitment_type, owed_by_principal, owed_to_principal, confidence, source_ids, owed_by:person!commitment_owed_by_person_id_fkey(id, name), owed_to:person!commitment_owed_to_person_id_fkey(id, name)",
      )
      .eq("workspace_id", workspaceId)
      .in("status", ["open", "due", "overdue"])
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(20);

    for (const row of data ?? []) {
      const owedBy = row.owed_by_principal
        ? "the user"
        : (row.owed_by as { name: string } | null)?.name ?? "someone";
      const owedTo = row.owed_to_principal
        ? "the user"
        : (row.owed_to as { name: string } | null)?.name ?? "someone";

      const citation =
        row.source_ids
          .map((sourceId) => citationBySource.get(sourceId))
          .find((index): index is number => index !== undefined) ?? null;

      facts.push({
        label: "Open commitment",
        detail:
          `${owedBy} owes ${owedTo}: ${row.what}` +
          (row.deadline ? ` (due ${row.deadline})` : " (no deadline stated)") +
          ` [${row.commitment_type}, confidence ${row.confidence}]`,
        citation,
      });
    }
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  if (wants("project")) {
    const { data } = await db
      .from("project")
      .select("id, name, status, deadline, next_action, outcome, blockers, summary_source_ids")
      .eq("workspace_id", workspaceId)
      .limit(20);

    for (const row of data ?? []) {
      const citation =
        row.summary_source_ids
          .map((sourceId) => citationBySource.get(sourceId))
          .find((index): index is number => index !== undefined) ?? null;

      facts.push({
        label: "Project",
        detail:
          `${row.name} — status ${row.status}` +
          (row.deadline ? `, deadline ${row.deadline}` : "") +
          (row.blockers.length > 0 ? `, blockers: ${row.blockers.join("; ")}` : ""),
        citation,
      });
      objects.push({
        kind: "project",
        id: row.id,
        name: row.name,
        subtitle: row.status.replace(/_/g, " "),
      });
    }
  }

  // ── People ─────────────────────────────────────────────────────────────────

  if (wants("person")) {
    const { data } = await db
      .from("person")
      .select(
        "id, name, role, last_interaction, current_context, current_context_source_ids, company:company!person_company_id_fkey(name)",
      )
      .eq("workspace_id", workspaceId)
      .order("last_interaction", { ascending: false, nullsFirst: false })
      .limit(20);

    for (const row of data ?? []) {
      const company = (row.company as { name: string } | null)?.name ?? null;
      const citation =
        row.current_context_source_ids
          .map((sourceId) => citationBySource.get(sourceId))
          .find((index): index is number => index !== undefined) ?? null;

      facts.push({
        label: "Person",
        detail:
          `${row.name}${row.role ? `, ${row.role}` : ""}${company ? ` at ${company}` : ""}` +
          (row.last_interaction
            ? `, last interaction ${row.last_interaction.slice(0, 10)}`
            : ", no recorded interaction"),
        citation,
      });
      objects.push({
        kind: "person",
        id: row.id,
        name: row.name,
        subtitle: company ?? row.role,
      });
    }
  }

  // ── Decisions ──────────────────────────────────────────────────────────────

  if (wants("decision")) {
    const { data } = await db
      .from("decision")
      .select("id, statement, decided_on, reversible, source_ids")
      .eq("workspace_id", workspaceId)
      .order("decided_on", { ascending: false, nullsFirst: false })
      .limit(15);

    for (const row of data ?? []) {
      const citation =
        row.source_ids
          .map((sourceId) => citationBySource.get(sourceId))
          .find((index): index is number => index !== undefined) ?? null;

      facts.push({
        label: "Decision",
        detail: row.statement + (row.decided_on ? ` (${row.decided_on})` : ""),
        citation,
      });
    }
  }

  // Only surface objects the answer is actually about — the source titles that
  // came back from retrieval are the best available signal for that.
  const relevantTitles = citations.map((citation) => citation.title.toLowerCase()).join(" ");
  const questionLower = question.toLowerCase();
  const relevantObjects = objects.filter((object) => {
    const name = object.name.toLowerCase();
    return questionLower.includes(name) || relevantTitles.includes(name);
  });

  return {
    citations,
    facts,
    objects: relevantObjects.length > 0 ? relevantObjects : [],
    degraded,
  };
}
