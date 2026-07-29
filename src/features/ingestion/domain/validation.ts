import { normalizeName } from "./resolution";
import type { SourceExtraction } from "./types";

/**
 * Post-extraction validation. Structured outputs guarantee the *shape*; this
 * guarantees the *content*.
 *
 * The important rule is the quote check: an item whose quote does not appear in
 * the source is a fabrication, however plausible it reads, and it is dropped
 * rather than stored at low confidence. Everything downstream — citations, the
 * review queue, the Ask contract — assumes a quote can be found in the source,
 * so a quote that cannot be found has to die here.
 */

export type ValidationOutcome = {
  extraction: SourceExtraction;
  /** Items removed, with why. Reported so a bad extraction is visible, not silent. */
  dropped: { kind: string; label: string; reason: string }[];
};

function looseIncludes(haystack: string, needle: string): boolean {
  if (needle.trim().length === 0) return false;

  const normalise = (value: string) =>
    value
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim();

  const flatHaystack = normalise(haystack);
  const flatNeedle = normalise(needle);

  if (flatHaystack.includes(flatNeedle)) return true;

  // Ellipsis-joined quotes are common and legitimate: check each fragment.
  const fragments = flatNeedle
    .split(/\.{3}|…/)
    .map((part) => part.trim())
    .filter((part) => part.length > 12);

  return (
    fragments.length > 1 && fragments.every((part) => flatHaystack.includes(part))
  );
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!ISO_DATE.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : trimmed;
}

export function validateExtraction(
  extraction: SourceExtraction,
  sourceText: string,
): ValidationOutcome {
  const dropped: ValidationOutcome["dropped"] = [];

  const keep = <T extends { quote: string; confidence: number }>(
    kind: string,
    label: (item: T) => string,
  ) => {
    return (item: T): boolean => {
      if (!looseIncludes(sourceText, item.quote)) {
        dropped.push({
          kind,
          label: label(item),
          reason: "quote not found in source",
        });
        return false;
      }
      return true;
    };
  };

  const withClampedConfidence = <T extends { confidence: number }>(item: T): T => ({
    ...item,
    confidence: clampConfidence(item.confidence),
  });

  const people = extraction.people
    .filter(keep("person", (item) => item.name))
    .filter((item) => normalizeName(item.name).length > 1)
    .map(withClampedConfidence);

  const companies = extraction.companies
    .filter(keep("company", (item) => item.name))
    .filter((item) => normalizeName(item.name).length > 1)
    .map(withClampedConfidence);

  const projects = extraction.projects
    .filter(keep("project", (item) => item.name))
    .map(withClampedConfidence)
    .map((item) => ({ ...item, deadline: validDate(item.deadline) }));

  const commitments = extraction.commitments
    .filter(keep("commitment", (item) => item.what))
    .map(withClampedConfidence)
    .map((item) => ({ ...item, deadline: validDate(item.deadline) }));

  const tasks = extraction.tasks
    .filter(keep("task", (item) => item.description))
    .map(withClampedConfidence)
    .map((item) => ({ ...item, dueDate: validDate(item.dueDate) }));

  const decisions = extraction.decisions
    .filter(keep("decision", (item) => item.statement))
    .map(withClampedConfidence);

  const risks = extraction.risks
    .filter(keep("risk", (item) => item.description))
    .map(withClampedConfidence);

  return {
    extraction: {
      ...extraction,
      people,
      companies,
      projects,
      commitments,
      tasks,
      decisions,
      risks,
    },
    dropped,
  };
}
