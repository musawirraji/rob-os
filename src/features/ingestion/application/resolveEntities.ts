import "server-only";

import { REVIEW_THRESHOLD } from "@shared/constants";
import type { Inserts, Tables } from "@shared/interfaces/db";
import type { AdminClient } from "@shared/services/supabase/adminClient";

import {
  emailDomain,
  normalizeName,
  resolve,
  type ResolutionCandidate,
} from "../domain/resolution";
import type { SourceExtraction } from "../domain/types";
import * as repo from "../services/ingestionRepository";

/**
 * Step 5 of the pipeline: turn the names a source mentioned into rows in the
 * graph. Match, create, or — when it is genuinely a coin toss — hand it to a
 * human instead of guessing.
 *
 * Companies resolve first because a company gives person resolution the context
 * it needs: "Sarah" is ambiguous on its own and unambiguous once you know the
 * email came from omnilux.io.
 */

/** The literal the extraction prompt uses for the workspace owner. */
export const PRINCIPAL = "principal";

export type EntityMap = Map<string, string>;

export type ResolutionResult = {
  people: EntityMap;
  companies: EntityMap;
  projects: EntityMap;
  peopleCreated: number;
  peopleMatched: number;
  companiesCreated: number;
  companiesMatched: number;
  projectsCreated: number;
  projectsMatched: number;
  reviewItemsQueued: number;
};

export function isPrincipal(mention: string | null): boolean {
  if (!mention) return false;
  return normalizeName(mention) === PRINCIPAL;
}

function toCandidate(
  row: Tables<"person"> | Tables<"company"> | Tables<"project">,
): ResolutionCandidate {
  const base: ResolutionCandidate = {
    id: row.id,
    name: row.name,
    aliases: row.aliases,
  };
  if ("emails" in row) base.emails = row.emails;
  if ("company_id" in row) base.companyId = row.company_id;
  if ("domains" in row) base.domains = row.domains;
  return base;
}

type ReviewArgs = {
  entityKind: string;
  reason: Inserts<"review_item">["reason"];
  proposed: Record<string, unknown>;
  candidates: unknown[];
  confidence: number;
  excerpt: string;
};

export async function resolveEntities(
  db: AdminClient,
  workspaceId: string,
  sourceId: string,
  extraction: SourceExtraction,
  /**
   * When the source happened. Becomes each mentioned person's
   * `last_interaction`, which is what "going cold" is measured from — without it
   * every relationship looks equally silent.
   */
  occurredAt: string | null,
): Promise<ResolutionResult> {
  const result: ResolutionResult = {
    people: new Map(),
    companies: new Map(),
    projects: new Map(),
    peopleCreated: 0,
    peopleMatched: 0,
    companiesCreated: 0,
    companiesMatched: 0,
    projectsCreated: 0,
    projectsMatched: 0,
    reviewItemsQueued: 0,
  };

  const audit: Inserts<"audit_log">[] = [];

  const queueReview = async (args: ReviewArgs): Promise<void> => {
    const queued = await repo.enqueueReview(db, {
      workspace_id: workspaceId,
      reason: args.reason,
      entity_kind: args.entityKind,
      proposed: args.proposed as never,
      candidates: args.candidates as never,
      confidence: args.confidence,
      source_id: sourceId,
      source_ids: [sourceId],
      excerpt: args.excerpt,
      fact_type: "extracted",
    });
    if (queued) result.reviewItemsQueued += 1;
  };

  // ── Companies ──────────────────────────────────────────────────────────────

  const companyHints = await repo.getResolutionHints(
    db,
    workspaceId,
    "company",
    extraction.companies.map((item) => item.name),
  );

  for (const item of extraction.companies) {
    const key = normalizeName(item.name);
    if (result.companies.has(key)) continue;

    const hint = companyHints.get(key);
    const candidates = (
      await repo.findCompanyCandidates(db, workspaceId, item.name)
    ).map(toCandidate);

    const decision = resolve(item.name, candidates, {
      isCompany: true,
      hintEntityId: hint?.entityId ?? null,
      hintIsRejection: hint !== undefined && hint.entityId === null,
    });

    if (decision.action === "skip") continue;

    if (decision.action === "match") {
      result.companies.set(key, decision.candidateId);
      result.companiesMatched += 1;

      const { data: existing } = await db
        .from("company")
        .select()
        .eq("id", decision.candidateId)
        .single();

      if (existing) {
        await repo.enrichCompany(db, existing, {
          alias: item.name,
          industry: item.industry,
        });
      }
      continue;
    }

    if (decision.action === "review") {
      await queueReview({
        entityKind: "company",
        reason: decision.reason,
        proposed: { name: item.name, industry: item.industry },
        candidates: decision.candidates.map((entry) => ({
          id: entry.candidate.id,
          name: entry.candidate.name,
          score: entry.score,
          reasons: entry.reasons,
        })),
        confidence: decision.confidence,
        excerpt: item.quote,
      });
      continue;
    }

    const created = await repo.createCompany(db, {
      workspace_id: workspaceId,
      name: item.name,
      industry: item.industry,
    });

    if (created) {
      result.companies.set(key, created.id);
      result.companiesCreated += 1;
      audit.push({
        workspace_id: workspaceId,
        entity_kind: "company",
        entity_id: created.id,
        action: "create",
        reason: `first seen in source: ${item.quote.slice(0, 200)}`,
        confidence: item.confidence,
        new_value: { name: item.name } as never,
        source_ids: [sourceId],
      });
    }
  }

  // ── People ─────────────────────────────────────────────────────────────────

  const personHints = await repo.getResolutionHints(
    db,
    workspaceId,
    "person",
    extraction.people.map((item) => item.name),
  );

  for (const item of extraction.people) {
    const key = normalizeName(item.name);
    if (key === PRINCIPAL || result.people.has(key)) continue;

    const hint = personHints.get(key);
    const companyId = item.companyName
      ? result.companies.get(normalizeName(item.companyName)) ?? null
      : null;

    const candidates = (
      await repo.findPersonCandidates(db, workspaceId, item.name, item.email)
    ).map(toCandidate);

    const decision = resolve(item.name, candidates, {
      email: item.email,
      companyId,
      hintEntityId: hint?.entityId ?? null,
      hintIsRejection: hint !== undefined && hint.entityId === null,
    });

    if (decision.action === "skip") continue;

    if (decision.action === "match") {
      result.people.set(key, decision.candidateId);
      result.peopleMatched += 1;

      const { data } = await db
        .from("person")
        .select()
        .eq("id", decision.candidateId)
        .single();

      if (data) {
        await repo.enrichPerson(db, data, {
          alias: item.name,
          email: item.email,
          role: item.role,
          companyId,
          lastInteraction: occurredAt,
        });
      }
      continue;
    }

    if (decision.action === "review") {
      await queueReview({
        entityKind: "person",
        reason: decision.reason,
        proposed: {
          name: item.name,
          role: item.role,
          email: item.email,
          companyName: item.companyName,
        },
        candidates: decision.candidates.map((entry) => ({
          id: entry.candidate.id,
          name: entry.candidate.name,
          score: entry.score,
          reasons: entry.reasons,
        })),
        confidence: decision.confidence,
        excerpt: item.quote,
      });
      continue;
    }

    const domain = item.email ? emailDomain(item.email) : null;
    const created = await repo.createPerson(db, {
      workspace_id: workspaceId,
      name: item.name,
      role: item.role,
      emails: item.email ? [item.email.toLowerCase()] : [],
      company_id: companyId,
      // A person we met through their work email is at minimum a contact; the
      // relationship type itself is not something a single source establishes.
      relationship_type: "unknown",
      relationship_strength: "unknown",
      last_interaction: occurredAt,
    });

    if (created) {
      result.people.set(key, created.id);
      result.peopleCreated += 1;
      audit.push({
        workspace_id: workspaceId,
        entity_kind: "person",
        entity_id: created.id,
        action: "create",
        reason: `first seen in source: ${item.quote.slice(0, 200)}`,
        confidence: item.confidence,
        new_value: { name: item.name, role: item.role, domain } as never,
        source_ids: [sourceId],
      });
    }
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  for (const item of extraction.projects) {
    const key = normalizeName(item.name);
    if (result.projects.has(key)) continue;

    const candidates = (
      await repo.findProjectCandidates(db, workspaceId, item.name)
    ).map(toCandidate);

    const decision = resolve(item.name, candidates, {});

    if (decision.action === "skip") continue;

    if (decision.action === "match") {
      result.projects.set(key, decision.candidateId);
      result.projectsMatched += 1;
      continue;
    }

    if (decision.action === "review") {
      await queueReview({
        entityKind: "project",
        reason: decision.reason,
        proposed: {
          name: item.name,
          outcome: item.outcome,
          status: item.status,
          deadline: item.deadline,
        },
        candidates: decision.candidates.map((entry) => ({
          id: entry.candidate.id,
          name: entry.candidate.name,
          score: entry.score,
          reasons: entry.reasons,
        })),
        confidence: decision.confidence,
        excerpt: item.quote,
      });
      continue;
    }

    // A project is a bigger claim than a person: creating one from a passing
    // mention clutters the model. Below the review threshold it goes to a human.
    if (item.confidence < REVIEW_THRESHOLD) {
      await queueReview({
        entityKind: "project",
        reason: "low_confidence",
        proposed: {
          name: item.name,
          outcome: item.outcome,
          status: item.status,
          deadline: item.deadline,
        },
        candidates: [],
        confidence: item.confidence,
        excerpt: item.quote,
      });
      continue;
    }

    const created = await repo.createProject(db, {
      workspace_id: workspaceId,
      name: item.name,
      outcome: item.outcome,
      status: item.status ?? "not_started",
      deadline: item.deadline,
      company_id: item.companyName
        ? result.companies.get(normalizeName(item.companyName)) ?? null
        : null,
    });

    if (created) {
      result.projects.set(key, created.id);
      result.projectsCreated += 1;
      audit.push({
        workspace_id: workspaceId,
        entity_kind: "project",
        entity_id: created.id,
        action: "create",
        reason: `first seen in source: ${item.quote.slice(0, 200)}`,
        confidence: item.confidence,
        new_value: { name: item.name, outcome: item.outcome } as never,
        source_ids: [sourceId],
      });
    }
  }

  await repo.writeAudit(db, audit);
  return result;
}
