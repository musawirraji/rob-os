import { Constants } from "./database.types";
import type { Enums } from "./db";

/**
 * Domain vocabulary. The unions come from the generated schema types rather than
 * being retyped here, so a new enum value in a migration is a type error in the
 * app until it is handled.
 */

/** The canonical object kinds. Everything the system knows is one of these. */
export const OBJECT_KINDS = [
  "person",
  "company",
  "project",
  "meeting",
  "task",
  "decision",
  "commitment",
  "source",
] as const;

export type ObjectKind = (typeof OBJECT_KINDS)[number];

export type SourceKind = Enums<"source_kind">;

/**
 * Runtime lists, taken from the generated `Constants` rather than retyped — a new
 * enum value in a migration flows into the UI without a second edit.
 */
export const SOURCE_KINDS = Constants.public.Enums.source_kind;
export const PROJECT_STATUSES = Constants.public.Enums.project_status;
export const COMMITMENT_TYPES = Constants.public.Enums.commitment_type;
export type SourceStatus = Enums<"source_status">;
export type RelationshipType = Enums<"relationship_type">;
export type RelationshipStrength = Enums<"relationship_strength">;
export type CompanyType = Enums<"company_type">;
export type RiskLevel = Enums<"risk_level">;
export type OpportunityLevel = Enums<"opportunity_level">;
export type ProjectStatus = Enums<"project_status">;
export type TaskStatus = Enums<"task_status">;
export type Priority = Enums<"priority">;
export type CommitmentType = Enums<"commitment_type">;
export type CommitmentStatus = Enums<"commitment_status">;
export type Sentiment = Enums<"sentiment">;
export type FollowUpStatus = Enums<"follow_up_status">;
export type ReviewStatus = Enums<"review_status">;
export type ReviewReason = Enums<"review_reason">;

/** Object-tile colour, keyed to the token of the same name. */
export type TileColor =
  | "person"
  | "company"
  | "project"
  | "deal"
  | "meeting"
  | "note";

/** Pastel status badge tone. */
export type StatusTone = "good" | "warn" | "crit" | "neutral";
