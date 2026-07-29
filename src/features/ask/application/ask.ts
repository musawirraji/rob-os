import "server-only";

import type { AdminClient } from "@shared/services/supabase/adminClient";

import { planQuery } from "../domain/queryPlan";
import type { AskAnswer } from "../domain/types";
import {
  pruneUncitedSources,
  unavailableAnswer,
  validateSynthesis,
} from "../domain/validateAnswer";
import { retrieve } from "../services/retrieval";
import type { SynthesisPort } from "../services/claudeSynthesis";

/**
 * `ask(question)` — brief §8.
 *
 *   plan → retrieve → synthesise → validate → log
 *
 * The order of the last two matters. Validation runs *after* the model and before
 * the caller, so nothing uncited can reach the UI even if synthesis ignores the
 * contract. And the whole exchange is written to `ask_query`, which is what makes
 * the grounding claim auditable after the fact rather than a promise.
 */

export type AskDeps = {
  db: AdminClient;
  synthesise: SynthesisPort;
};

export type AskOptions = {
  askedBy?: string | null;
  now?: Date;
};

export async function ask(
  deps: AskDeps,
  workspaceId: string,
  question: string,
  options: AskOptions = {},
): Promise<AskAnswer> {
  const { db, synthesise } = deps;
  const now = options.now ?? new Date();
  const startedAt = Date.now();

  const trimmed = question.trim();
  if (trimmed.length === 0) {
    return unavailableAnswer(question, "empty question");
  }

  const { data: workspace } = await db
    .from("workspace")
    .select("principal_name, principal_company, timezone")
    .eq("id", workspaceId)
    .single();

  if (!workspace) {
    return unavailableAnswer(trimmed, "workspace not found");
  }

  // ── 1–2. Plan and retrieve ─────────────────────────────────────────────────

  const plan = planQuery(trimmed, now);
  const retrieval = await retrieve(db, workspaceId, trimmed, plan);

  // Nothing retrieved is a real answer, and the honest one. The alternative —
  // letting the model answer from its own knowledge — is the exact failure mode
  // this product exists to prevent.
  if (retrieval.citations.length === 0) {
    const answer: AskAnswer = {
      question: trimmed,
      claims: [],
      abstained: [trimmed],
      grounded: false,
      sources: [],
      objects: [],
      suggestedNext: [],
      unavailableReason: null,
    };
    await logQuery(db, workspaceId, answer, plan.rationale, [], startedAt, options.askedBy);
    return answer;
  }

  // ── 3. Synthesise ──────────────────────────────────────────────────────────

  const raw = await synthesise(trimmed, retrieval.citations, retrieval.facts, {
    principalName: workspace.principal_name,
    principalCompany: workspace.principal_company,
    today: now.toISOString().slice(0, 10),
    timezone: workspace.timezone,
  });

  if (raw === null) {
    const answer = unavailableAnswer(
      trimmed,
      "synthesis unavailable — the answer engine could not be reached",
    );
    await logQuery(
      db,
      workspaceId,
      answer,
      plan.rationale,
      retrieval.citations.map((citation) => citation.chunkId),
      startedAt,
      options.askedBy,
    );
    return answer;
  }

  // ── 4. Validate ────────────────────────────────────────────────────────────

  const validated = validateSynthesis(raw, retrieval.citations);
  const { claims, sources } = pruneUncitedSources(validated.claims, retrieval.citations);

  for (const note of validated.notes) {
    console.warn(`[rob-os] ask: ${note.reason} — "${note.claim.slice(0, 120)}"`);
  }

  const answer: AskAnswer = {
    question: trimmed,
    claims,
    abstained: validated.abstained,
    // A degraded retrieval cannot produce a fully grounded answer: half the index
    // was unavailable, so "nothing supports this" is not yet a safe conclusion.
    grounded: validated.grounded && retrieval.degraded.length === 0,
    sources,
    objects: retrieval.objects,
    suggestedNext: (raw.suggestedNext ?? []).slice(0, 3),
    unavailableReason: null,
  };

  await logQuery(
    db,
    workspaceId,
    answer,
    [...plan.rationale, ...retrieval.degraded],
    retrieval.citations.map((citation) => citation.chunkId),
    startedAt,
    options.askedBy,
  );

  return answer;
}

async function logQuery(
  db: AdminClient,
  workspaceId: string,
  answer: AskAnswer,
  _rationale: string[],
  chunkIds: (string | null)[],
  startedAt: number,
  askedBy?: string | null,
): Promise<void> {
  const { error } = await db.from("ask_query").insert({
    workspace_id: workspaceId,
    asked_by: askedBy ?? null,
    question: answer.question,
    answer: answer.claims.map((claim) => claim.text).join("\n\n") || null,
    grounded: answer.grounded,
    abstained: answer.abstained,
    retrieved_chunk_ids: chunkIds.filter((id): id is string => id !== null),
    cited_source_ids: [...new Set(answer.sources.map((source) => source.sourceId))],
    latency_ms: Date.now() - startedAt,
  });

  if (error) console.warn("[rob-os] could not log ask query:", error);
}
