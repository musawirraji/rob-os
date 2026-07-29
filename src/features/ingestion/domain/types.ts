import type { FactType } from "@shared/interfaces/provenance";
import type {
  CommitmentType,
  Priority,
  ProjectStatus,
  Sentiment,
  SourceKind,
} from "@shared/interfaces/objects";

/**
 * What the extraction pass returns for one source. Every item carries a `quote`
 * — the span of the source it came from. Without it a claim cannot be cited, and
 * an uncitable claim is the thing this product exists to prevent, so the quote is
 * required rather than optional.
 */

export type ExtractedBase = {
  /** Verbatim from the source. Must appear in the text, or the item is dropped. */
  quote: string;
  factType: FactType;
  /** 0–1. The model's own estimate; below the threshold it goes to review. */
  confidence: number;
};

export type ExtractedPerson = ExtractedBase & {
  /** As written in the source, not normalised — resolution needs the raw form. */
  name: string;
  role: string | null;
  companyName: string | null;
  email: string | null;
};

export type ExtractedCompany = ExtractedBase & {
  name: string;
  industry: string | null;
};

export type ExtractedProject = ExtractedBase & {
  name: string;
  outcome: string | null;
  status: ProjectStatus | null;
  deadline: string | null;
  companyName: string | null;
  /**
   * People the source shows working on this. Named explicitly rather than
   * inferred from co-mention: two names in the same email is not evidence they
   * are on the same project.
   */
  peopleInvolved: string[];
};

export type ExtractedCommitment = ExtractedBase & {
  /** Name as written, or "principal" when the workspace owner owes it. */
  owedBy: string;
  owedTo: string;
  what: string;
  deadline: string | null;
  commitmentType: CommitmentType;
};

export type ExtractedTask = ExtractedBase & {
  description: string;
  owner: string | null;
  dueDate: string | null;
  priority: Priority;
  projectName: string | null;
};

export type ExtractedDecision = ExtractedBase & {
  statement: string;
  decisionMaker: string | null;
  rationale: string | null;
  alternatives: string[];
  reversible: boolean | null;
  /** Others in the room this decision binds, beyond whoever called it. */
  peopleInvolved: string[];
};

export type ExtractedRisk = ExtractedBase & {
  description: string;
  /** Which object the risk attaches to, by name as written. */
  subject: string | null;
};

export type SourceExtraction = {
  people: ExtractedPerson[];
  companies: ExtractedCompany[];
  projects: ExtractedProject[];
  commitments: ExtractedCommitment[];
  tasks: ExtractedTask[];
  decisions: ExtractedDecision[];
  risks: ExtractedRisk[];
  /** Open questions the source raises but does not answer. Feeds Ask's abstain. */
  openQuestions: string[];
  sentiment: Sentiment;
  /** One or two sentences. An inference, and labelled as one downstream. */
  gist: string;
};

/** The parsed form of a raw file, before anything is stored. */
export type ParsedSource = {
  kind: SourceKind;
  title: string;
  text: string;
  author: string | null;
  participants: string[];
  occurredAt: string | null;
  originalRef: string;
  /** Supabase Storage key of the original bytes, when there were any. */
  storagePath?: string | null;
  /** Page counts, conversion notes, OCR flags — whatever the parser learned. */
  metadata?: Record<string, unknown>;
};

/** A chunk before it has an id or an embedding. */
export type PendingChunk = {
  index: number;
  content: string;
  tokenStart: number;
  tokenEnd: number;
};

/** What one pass of the pipeline did, so the caller can report honestly. */
export type IngestionReport = {
  sourceId: string | null;
  title: string;
  originalRef: string;
  chunksWritten: number;
  chunksEmbedded: number;
  peopleCreated: number;
  peopleMatched: number;
  companiesCreated: number;
  companiesMatched: number;
  projectsCreated: number;
  projectsMatched: number;
  commitmentsWritten: number;
  tasksWritten: number;
  decisionsWritten: number;
  reviewItemsQueued: number;
  summariesUpdated: number;
  /** Stages that could not run, with the reason. Never silently empty. */
  skipped: string[];
  error: string | null;
};
