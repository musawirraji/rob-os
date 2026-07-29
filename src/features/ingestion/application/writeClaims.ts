import "server-only";

import { REVIEW_THRESHOLD } from "@shared/constants";
import type { Inserts } from "@shared/interfaces/db";
import type { AdminClient } from "@shared/services/supabase/adminClient";

import { normalizeName } from "../domain/resolution";
import type { SourceExtraction } from "../domain/types";
import * as repo from "../services/ingestionRepository";

import { isPrincipal, type ResolutionResult } from "./resolveEntities";

/**
 * Step 6: write the claims, each carrying the source that justifies it.
 *
 * Two rules decide whether a claim lands in the model or in the review queue:
 *
 * 1. Low confidence goes to review. The threshold is one number, in one place.
 * 2. A claim whose required party could not be resolved goes to review even at
 *    high confidence. We know a promise was made — but a commitment with a null
 *    counterparty is unusable, and inventing one to satisfy the constraint would
 *    be exactly the confident-wrong-answer failure the product exists to avoid.
 */

export type ClaimWriteResult = {
  commitmentsWritten: number;
  tasksWritten: number;
  decisionsWritten: number;
  reviewItemsQueued: number;
};

type PartyRef =
  | { kind: "principal" }
  | { kind: "person"; id: string }
  | { kind: "unresolved"; mention: string };

function resolveParty(mention: string | null, entities: ResolutionResult): PartyRef {
  if (!mention) return { kind: "unresolved", mention: "" };
  if (isPrincipal(mention)) return { kind: "principal" };

  const id = entities.people.get(normalizeName(mention));
  return id ? { kind: "person", id } : { kind: "unresolved", mention };
}

export async function writeClaims(
  db: AdminClient,
  workspaceId: string,
  sourceId: string,
  extraction: SourceExtraction,
  entities: ResolutionResult,
  /** Set when this source is a transcript, so claims link to the meeting. */
  meetingId: string | null,
): Promise<ClaimWriteResult> {
  const result: ClaimWriteResult = {
    commitmentsWritten: 0,
    tasksWritten: 0,
    decisionsWritten: 0,
    reviewItemsQueued: 0,
  };

  const queue = async (
    entityKind: string,
    reason: Inserts<"review_item">["reason"],
    proposed: Record<string, unknown>,
    confidence: number,
    excerpt: string,
  ): Promise<void> => {
    const queued = await repo.enqueueReview(db, {
      workspace_id: workspaceId,
      reason,
      entity_kind: entityKind,
      proposed: proposed as never,
      confidence,
      source_id: sourceId,
      source_ids: [sourceId],
      excerpt,
      fact_type: "extracted",
    });
    if (queued) result.reviewItemsQueued += 1;
  };

  // ── Commitments ────────────────────────────────────────────────────────────

  const commitmentRows: Inserts<"commitment">[] = [];

  for (const item of extraction.commitments) {
    const debtor = resolveParty(item.owedBy, entities);
    const creditor = resolveParty(item.owedTo, entities);

    if (debtor.kind === "unresolved" || creditor.kind === "unresolved") {
      const unresolved =
        debtor.kind === "unresolved" ? item.owedBy : item.owedTo;
      await queue(
        "commitment",
        "ambiguous_entity",
        { ...item, unresolvedParty: unresolved },
        item.confidence,
        item.quote,
      );
      continue;
    }

    if (item.confidence < REVIEW_THRESHOLD) {
      await queue("commitment", "low_confidence", { ...item }, item.confidence, item.quote);
      continue;
    }

    commitmentRows.push({
      workspace_id: workspaceId,
      what: item.what,
      deadline: item.deadline,
      commitment_type: item.commitmentType,
      owed_by_person_id: debtor.kind === "person" ? debtor.id : null,
      owed_by_principal: debtor.kind === "principal",
      owed_to_person_id: creditor.kind === "person" ? creditor.id : null,
      owed_to_principal: creditor.kind === "principal",
      meeting_id: meetingId,
      status: "open",
      fact_type: item.factType,
      confidence: item.confidence,
      source_ids: [sourceId],
    });
  }

  result.commitmentsWritten = await repo.insertCommitments(db, commitmentRows);

  // ── Tasks ──────────────────────────────────────────────────────────────────

  const taskRows: Inserts<"task">[] = [];

  for (const item of extraction.tasks) {
    if (item.confidence < REVIEW_THRESHOLD) {
      await queue("task", "low_confidence", { ...item }, item.confidence, item.quote);
      continue;
    }

    const owner = resolveParty(item.owner, entities);
    // A task with an unknown owner is still worth recording — unlike a
    // commitment, it has no counterparty constraint to satisfy.
    taskRows.push({
      workspace_id: workspaceId,
      description: item.description,
      owner_person_id: owner.kind === "person" ? owner.id : null,
      owned_by_principal: owner.kind === "principal",
      due_date: item.dueDate,
      priority: item.priority,
      status: "open",
      commitment_type: "explicit",
      project_id: item.projectName
        ? entities.projects.get(normalizeName(item.projectName)) ?? null
        : null,
      fact_type: item.factType,
      confidence: item.confidence,
      source_ids: [sourceId],
    });
  }

  result.tasksWritten = await repo.insertTasks(db, taskRows);

  // ── Decisions ──────────────────────────────────────────────────────────────

  const decisionRows: Inserts<"decision">[] = [];
  const keptDecisions: SourceExtraction["decisions"] = [];

  for (const item of extraction.decisions) {
    if (item.confidence < REVIEW_THRESHOLD) {
      await queue("decision", "low_confidence", { ...item }, item.confidence, item.quote);
      continue;
    }

    const maker = resolveParty(item.decisionMaker, entities);
    decisionRows.push({
      workspace_id: workspaceId,
      statement: item.statement,
      rationale: item.rationale,
      alternatives: item.alternatives,
      reversible: item.reversible,
      decision_maker_person_id: maker.kind === "person" ? maker.id : null,
      meeting_id: meetingId,
      fact_type: item.factType,
      confidence: item.confidence,
      source_ids: [sourceId],
    });
    keptDecisions.push(item);
  }

  const insertedDecisions = await repo.insertDecisionsReturning(db, decisionRows);
  result.decisionsWritten = insertedDecisions.length;

  // The people a decision binds, beyond whoever called it. Matched positionally:
  // `insertDecisions` preserves input order, and `keptDecisions` was built in the
  // same pass as `decisionRows`.
  const decisionPeople: Inserts<"decision_person">[] = [];
  insertedDecisions.forEach((inserted, index) => {
    const item = keptDecisions[index];
    if (!item) return;
    for (const name of item.peopleInvolved) {
      const personId = entities.people.get(normalizeName(name));
      if (!personId) continue;
      decisionPeople.push({
        decision_id: inserted.id,
        person_id: personId,
        workspace_id: workspaceId,
        fact_type: item.factType,
        confidence: item.confidence,
      });
    }
  });
  await repo.linkDecisionPerson(db, decisionPeople);

  // ── Mentions ───────────────────────────────────────────────────────────────
  // What this source touched, with the excerpt that proves it. This is what the
  // activity feed and the living summaries read from.

  const mentions: Inserts<"source_mention">[] = [];

  for (const item of extraction.people) {
    const id = entities.people.get(normalizeName(item.name));
    if (!id) continue;
    mentions.push({
      workspace_id: workspaceId,
      source_id: sourceId,
      person_id: id,
      excerpt: item.quote,
      fact_type: item.factType,
      confidence: item.confidence,
    });
  }

  for (const item of extraction.companies) {
    const id = entities.companies.get(normalizeName(item.name));
    if (!id) continue;
    mentions.push({
      workspace_id: workspaceId,
      source_id: sourceId,
      company_id: id,
      excerpt: item.quote,
      fact_type: item.factType,
      confidence: item.confidence,
    });
  }

  for (const item of extraction.projects) {
    const id = entities.projects.get(normalizeName(item.name));
    if (!id) continue;
    mentions.push({
      workspace_id: workspaceId,
      source_id: sourceId,
      project_id: id,
      excerpt: item.quote,
      fact_type: item.factType,
      confidence: item.confidence,
    });
  }

  await repo.insertMentions(db, mentions);

  // ── Relationship edges ─────────────────────────────────────────────────────
  // The join tables are what make "everyone on the Omnilux project" answerable
  // from a row instead of from prose. Each edge carries the source that justifies
  // it, so an edge is as checkable as a claim.

  const personCompany: Inserts<"person_company">[] = [];
  for (const item of extraction.people) {
    if (!item.companyName) continue;
    const personId = entities.people.get(normalizeName(item.name));
    const companyId = entities.companies.get(normalizeName(item.companyName));
    if (!personId || !companyId) continue;
    personCompany.push({
      person_id: personId,
      company_id: companyId,
      workspace_id: workspaceId,
      role: item.role,
      is_current: true,
      fact_type: item.factType,
      confidence: item.confidence,
      source_ids: [sourceId],
    });
  }
  await repo.linkPersonCompany(db, personCompany);

  const projectPerson: Inserts<"project_person">[] = [];
  const projectCompany: Inserts<"project_company">[] = [];

  for (const item of extraction.projects) {
    const projectId = entities.projects.get(normalizeName(item.name));
    if (!projectId) continue;

    for (const name of item.peopleInvolved) {
      const personId = entities.people.get(normalizeName(name));
      if (!personId) continue;
      projectPerson.push({
        project_id: projectId,
        person_id: personId,
        workspace_id: workspaceId,
        fact_type: item.factType,
        confidence: item.confidence,
        source_ids: [sourceId],
      });
    }

    if (item.companyName) {
      const companyId = entities.companies.get(normalizeName(item.companyName));
      if (companyId) {
        projectCompany.push({
          project_id: projectId,
          company_id: companyId,
          workspace_id: workspaceId,
          fact_type: item.factType,
          confidence: item.confidence,
          source_ids: [sourceId],
        });
      }
    }
  }

  await repo.linkProjectPerson(db, projectPerson);
  await repo.linkProjectCompany(db, projectCompany);

  // ── Audit ──────────────────────────────────────────────────────────────────
  // Claims were previously written without an audit entry, which left the
  // "every AI write is reversible" guarantee covering only entities. Each claim
  // now logs what was written and why, with the quote as the reason.

  const audit: Inserts<"audit_log">[] = [];
  for (const [kind, rows, items] of [
    ["commitment", commitmentRows, extraction.commitments],
    ["task", taskRows, extraction.tasks],
    ["decision", decisionRows, keptDecisions],
  ] as const) {
    rows.forEach((row, index) => {
      const item = items[index];
      audit.push({
        workspace_id: workspaceId,
        entity_kind: kind,
        // The row id is not known for bulk inserts; the source plus the audit
        // payload is enough to trace and undo it.
        entity_id: sourceId,
        action: "create",
        reason: item ? item.quote.slice(0, 200) : `${kind} extracted from source`,
        confidence: item?.confidence ?? null,
        prev_value: null,
        new_value: row as never,
        source_ids: [sourceId],
      });
    });
  }
  await repo.writeAudit(db, audit);

  return result;
}
