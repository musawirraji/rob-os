/**
 * Entity resolution, pure.
 *
 * This is the spine of the system: if "Sarah", "Sarah Lin" and
 * "sarah.lin@omnilux.io" do not converge on one row, every living summary drifts
 * and every citation points at a fragment of a person. Getting it wrong quietly
 * is the worst outcome, which is why an ambiguous match is routed to a human
 * rather than resolved by picking the highest score.
 */

const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "sir"]);
const COMPANY_SUFFIXES = new Set([
  "ltd",
  "limited",
  "llc",
  "inc",
  "incorporated",
  "plc",
  "gmbh",
  "co",
  "corp",
  "corporation",
  "holdings",
  "group",
  "systems",
]);

export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameTokens(raw: string, dropSuffixes = false): string[] {
  return normalizeName(raw)
    .split(" ")
    .filter((token) => token.length > 0 && !HONORIFICS.has(token))
    .filter((token) => !(dropSuffixes && COMPANY_SUFFIXES.has(token)));
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Domain part of an email, for company matching. */
export function emailDomain(raw: string): string | null {
  const at = raw.lastIndexOf("@");
  if (at < 0) return null;
  const domain = raw.slice(at + 1).trim().toLowerCase();
  return domain.length > 0 ? domain : null;
}

function bigrams(value: string): Set<string> {
  const out = new Set<string>();
  const padded = ` ${value} `;
  for (let i = 0; i < padded.length - 1; i += 1) {
    out.add(padded.slice(i, i + 2));
  }
  return out;
}

/** Sørensen–Dice over character bigrams. Cheap, and forgiving of typos. */
export function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const left = bigrams(a);
  const right = bigrams(b);
  let shared = 0;
  for (const gram of left) {
    if (right.has(gram)) shared += 1;
  }
  return (2 * shared) / (left.size + right.size);
}

export type NameMatchKind =
  | "exact"
  | "alias"
  | "token_subset"
  | "fuzzy"
  | "initial"
  | "none";

export type NameMatch = { score: number; kind: NameMatchKind };

/**
 * How alike two names are, and *why* — the reason matters downstream. A bare
 * first name matching a full name ("Sarah" → "Sarah Lin") is a token subset, not
 * an exact match, and must never auto-resolve on its own.
 */
export function matchName(
  mention: string,
  candidateName: string,
  candidateAliases: string[] = [],
  isCompany = false,
): NameMatch {
  const mentionNorm = normalizeName(mention);
  const candidateNorm = normalizeName(candidateName);

  if (mentionNorm.length === 0 || candidateNorm.length === 0) {
    return { score: 0, kind: "none" };
  }

  if (mentionNorm === candidateNorm) return { score: 1, kind: "exact" };

  for (const alias of candidateAliases) {
    if (normalizeName(alias) === mentionNorm) return { score: 0.97, kind: "alias" };
  }

  const mentionTokens = nameTokens(mention, isCompany);
  const candidateTokens = nameTokens(candidateName, isCompany);

  if (mentionTokens.length === 0 || candidateTokens.length === 0) {
    return { score: 0, kind: "none" };
  }

  // "Omnilux" vs "Omnilux Ltd" once suffixes are dropped.
  if (
    mentionTokens.join(" ") === candidateTokens.join(" ") &&
    isCompany
  ) {
    return { score: 0.95, kind: "alias" };
  }

  const candidateSet = new Set(candidateTokens);
  const allPresent = mentionTokens.every((token) => candidateSet.has(token));

  if (allPresent) {
    // A single shared token is weak on its own: lots of people are called Sarah.
    // Score it deliberately below the auto-match threshold.
    const coverage = mentionTokens.length / candidateTokens.length;
    return {
      score: mentionTokens.length === 1 ? 0.62 : 0.78 + 0.14 * coverage,
      kind: "token_subset",
    };
  }

  // "S. Lin" or "Sarah L." against "Sarah Lin".
  const initialMatch =
    mentionTokens.length === candidateTokens.length &&
    mentionTokens.every((token, i) => {
      const other = candidateTokens[i];
      if (other === undefined) return false;
      return token === other || token[0] === other[0];
    });

  if (initialMatch) return { score: 0.7, kind: "initial" };

  const fuzzy = diceCoefficient(mentionNorm, candidateNorm);
  return fuzzy >= 0.6 ? { score: fuzzy * 0.85, kind: "fuzzy" } : { score: 0, kind: "none" };
}

/** A stored row we might be talking about. */
export type ResolutionCandidate = {
  id: string;
  name: string;
  aliases: string[];
  emails?: string[];
  /** Company id for a person, used as a context signal. */
  companyId?: string | null;
  domains?: string[];
};

export type ResolutionContext = {
  /** Email seen alongside the mention in this source. */
  email?: string | null;
  /** Company named alongside the mention, already resolved to an id if possible. */
  companyId?: string | null;
  /** A previously stored user correction for this exact mention. */
  hintEntityId?: string | null;
  /** True when the hint says this mention is never an entity. */
  hintIsRejection?: boolean;
  isCompany?: boolean;
};

export type ScoredCandidate = {
  candidate: ResolutionCandidate;
  score: number;
  reasons: string[];
};

export const AUTO_MATCH_THRESHOLD = 0.88;
export const REVIEW_FLOOR = 0.5;
/** Two candidates this close together are a coin toss, so a human decides. */
export const AMBIGUITY_MARGIN = 0.1;

export function scoreCandidate(
  mention: string,
  candidate: ResolutionCandidate,
  context: ResolutionContext = {},
): ScoredCandidate {
  const reasons: string[] = [];

  // A stored correction outranks every heuristic. The user already answered this.
  if (context.hintEntityId && context.hintEntityId === candidate.id) {
    return { candidate, score: 1, reasons: ["user correction"] };
  }

  // Email is an identifier, not a similarity signal — treat it as decisive.
  const email = context.email ? normalizeEmail(context.email) : null;
  if (email && candidate.emails?.some((known) => normalizeEmail(known) === email)) {
    return { candidate, score: 1, reasons: ["email match"] };
  }

  const nameMatch = matchName(
    mention,
    candidate.name,
    candidate.aliases,
    context.isCompany ?? false,
  );

  if (nameMatch.kind === "none") {
    return { candidate, score: 0, reasons: ["no name overlap"] };
  }

  reasons.push(`name ${nameMatch.kind} (${nameMatch.score.toFixed(2)})`);
  let score = nameMatch.score;

  // Same company turns a weak first-name match into a usable one; a different
  // company makes it actively suspicious.
  if (context.companyId && candidate.companyId) {
    if (context.companyId === candidate.companyId) {
      score = Math.min(1, score + 0.22);
      reasons.push("same company");
    } else {
      score = Math.max(0, score - 0.25);
      reasons.push("different company");
    }
  }

  if (email && candidate.domains && candidate.domains.length > 0) {
    const domain = emailDomain(email);
    if (domain && candidate.domains.some((known) => known.toLowerCase() === domain)) {
      score = Math.min(1, score + 0.2);
      reasons.push("email domain match");
    }
  }

  return { candidate, score, reasons };
}

export type ResolutionDecision =
  | { action: "match"; candidateId: string; confidence: number; reasons: string[] }
  | { action: "create"; confidence: number; reasons: string[] }
  | {
      action: "review";
      reason: "ambiguous_entity" | "low_confidence";
      candidates: ScoredCandidate[];
      confidence: number;
      reasons: string[];
    }
  | { action: "skip"; reasons: string[] };

export function resolve(
  mention: string,
  candidates: ResolutionCandidate[],
  context: ResolutionContext = {},
): ResolutionDecision {
  if (context.hintIsRejection) {
    return { action: "skip", reasons: ["user previously rejected this mention"] };
  }

  const scored = candidates
    .map((candidate) => scoreCandidate(mention, candidate, context))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];

  if (!best || best.score < REVIEW_FLOOR) {
    return {
      action: "create",
      confidence: 0.7,
      reasons: best ? ["best candidate below review floor"] : ["no candidates"],
    };
  }

  const runnerUp = scored[1];
  const tooClose =
    runnerUp !== undefined && best.score - runnerUp.score < AMBIGUITY_MARGIN;

  // Two plausible rows is exactly the case where guessing corrupts the graph.
  if (tooClose) {
    return {
      action: "review",
      reason: "ambiguous_entity",
      candidates: scored.slice(0, 5),
      confidence: best.score,
      reasons: [
        `top two within ${AMBIGUITY_MARGIN}`,
        ...best.reasons,
      ],
    };
  }

  if (best.score >= AUTO_MATCH_THRESHOLD) {
    return {
      action: "match",
      candidateId: best.candidate.id,
      confidence: best.score,
      reasons: best.reasons,
    };
  }

  return {
    action: "review",
    reason: "low_confidence",
    candidates: scored.slice(0, 5),
    confidence: best.score,
    reasons: best.reasons,
  };
}
