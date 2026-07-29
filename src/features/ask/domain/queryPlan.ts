import { RETRIEVAL_TOP_K } from "@shared/constants";
import type { ObjectKind, SourceKind } from "@shared/interfaces/objects";

import type { QueryPlan } from "./types";

/**
 * Query planning, pure and deterministic.
 *
 * A model could do this, but it should not: routing is the one part of the engine
 * that must be reproducible. If retrieval regresses, the plan has to be a fixed
 * function of the question so the fault is locatable.
 */

const OBJECT_SIGNALS: { kinds: ObjectKind[]; patterns: RegExp[] }[] = [
  {
    kinds: ["commitment", "task"],
    patterns: [
      /\bpromis(e|ed|es)\b/i,
      /\bcommit(ted|ment|ments)?\b/i,
      /\bowe[ds]?\b/i,
      /\bwaiting on\b/i,
      /\bdue\b/i,
      /\bdeadline\b/i,
      /\bchasing\b/i,
      /\bsaid I('| w)?ould\b/i,
    ],
  },
  {
    kinds: ["project"],
    patterns: [
      /\bslipping\b/i,
      /\bat risk\b/i,
      /\bon track\b/i,
      /\bproject(s)?\b/i,
      /\bblocked\b/i,
      /\blaunch\b/i,
    ],
  },
  {
    kinds: ["decision"],
    patterns: [/\bdecide[d]?\b/i, /\bdecision(s)?\b/i, /\bagreed\b/i, /\bchose\b/i],
  },
  {
    kinds: ["meeting"],
    patterns: [/\bmeeting(s)?\b/i, /\bcall(s)?\b/i, /\bdiscuss(ed|ion)?\b/i, /\bstandup\b/i],
  },
  {
    kinds: ["person"],
    patterns: [/\bwho\b/i, /\bcontact(s)?\b/i, /\breplied\b/i, /\bquiet\b/i],
  },
  {
    kinds: ["company"],
    patterns: [/\bdeal(s)?\b/i, /\baccount(s)?\b/i, /\bclient(s)?\b/i, /\bpipeline\b/i],
  },
];

const SOURCE_KIND_SIGNALS: { kind: SourceKind; patterns: RegExp[] }[] = [
  { kind: "meeting", patterns: [/\bin the (call|meeting)\b/i, /\btranscript\b/i, /\bon the call\b/i] },
  { kind: "email", patterns: [/\bemail(ed|s)?\b/i, /\bwrote\b/i, /\breplied\b/i, /\bthread\b/i] },
];

/** Phrases that mean the user wants a literal string found, not a paraphrase. */
const EXACT_SIGNALS = [
  /[£$€]\s?[\d,]+/,
  /\b\d{1,3}(,\d{3})+\b/,
  /\bexact(ly)?\b/i,
  /\bhow much\b/i,
  /\bwhat (rate|price|figure|number)\b/i,
  /\bquote[d]?\b/i,
  /"[^"]+"/,
];

/** Rough windows. Absolute, because "this week" must not drift between runs. */
function resolveWindow(question: string, now: Date): { since: string | null; label: string | null } {
  const day = 86_400_000;
  const windows: { patterns: RegExp[]; days: number; label: string }[] = [
    { patterns: [/\btoday\b/i], days: 1, label: "today" },
    { patterns: [/\byesterday\b/i], days: 2, label: "since yesterday" },
    { patterns: [/\bthis week\b/i, /\brecently\b/i, /\blately\b/i], days: 7, label: "last 7 days" },
    { patterns: [/\blast week\b/i], days: 14, label: "last 14 days" },
    { patterns: [/\bthis month\b/i, /\blast month\b/i], days: 31, label: "last 31 days" },
    { patterns: [/\bthis quarter\b/i], days: 92, label: "last 92 days" },
  ];

  for (const window of windows) {
    if (window.patterns.some((pattern) => pattern.test(question))) {
      return {
        since: new Date(now.getTime() - window.days * day).toISOString(),
        label: window.label,
      };
    }
  }
  return { since: null, label: null };
}

export function planQuery(question: string, now: Date = new Date()): QueryPlan {
  const rationale: string[] = [];
  const objectTypes = new Set<ObjectKind>();

  for (const signal of OBJECT_SIGNALS) {
    if (signal.patterns.some((pattern) => pattern.test(question))) {
      for (const kind of signal.kinds) objectTypes.add(kind);
      rationale.push(`looks up ${signal.kinds.join("/")}`);
    }
  }

  // A question that matched nothing still deserves the common tables — better a
  // slightly wide lookup than a confident miss.
  if (objectTypes.size === 0) {
    objectTypes.add("commitment");
    objectTypes.add("person");
    objectTypes.add("project");
    rationale.push("no specific signal — default object lookup");
  }

  const sourceKinds = SOURCE_KIND_SIGNALS.filter((signal) =>
    signal.patterns.some((pattern) => pattern.test(question)),
  ).map((signal) => signal.kind);

  if (sourceKinds.length > 0) {
    rationale.push(`restricted to ${sourceKinds.join("/")} sources`);
  }

  const { since, label } = resolveWindow(question, now);
  if (label) rationale.push(`time window: ${label}`);

  const wantsExact = EXACT_SIGNALS.some((pattern) => pattern.test(question));
  if (wantsExact) rationale.push("literal-match question — weighted toward full text");

  return {
    objectTypes: [...objectTypes],
    since,
    sourceKinds: sourceKinds.length > 0 ? sourceKinds : null,
    semanticWeight: wantsExact ? 0.7 : 1.0,
    fullTextWeight: wantsExact ? 1.6 : 1.0,
    // A narrow question does not need a wide net; a broad one does.
    matchCount: wantsExact ? Math.round(RETRIEVAL_TOP_K * 0.75) : RETRIEVAL_TOP_K,
    rationale,
  };
}
