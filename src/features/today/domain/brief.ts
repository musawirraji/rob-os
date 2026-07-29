import { COOLING_AFTER_DAYS } from "@shared/constants";
import type { StatusTone } from "@shared/interfaces/objects";

/**
 * The daily brief, built by rule rather than by model.
 *
 * This is deliberate. Every line has to link to something the user can open, so a
 * line has to be derived from a row that already carries its own sources. A model
 * writing the brief from scratch would produce better prose and worse receipts —
 * and on the Today screen, the receipts are the product.
 *
 * Pure: rows in, draft out. No I/O, no dates from the ambient clock.
 */

export type BriefCommitment = {
  id: string;
  what: string;
  deadline: string | null;
  status: string;
  owedByPrincipal: boolean;
  owedToPrincipal: boolean;
  counterpartyName: string | null;
  counterpartyId: string | null;
  sourceIds: string[];
  confidence: number;
};

export type BriefProject = {
  id: string;
  name: string;
  status: string;
  deadline: string | null;
  nextAction: string | null;
  blockers: string[];
  sourceIds: string[];
};

export type BriefPerson = {
  id: string;
  name: string;
  companyName: string | null;
  lastInteraction: string | null;
  currentContext: string | null;
  sourceIds: string[];
};

export type BriefMeeting = {
  id: string;
  title: string;
  occurredAt: string;
  companyName: string | null;
  sourceIds: string[];
};

export type BriefInput = {
  today: string;
  principalName: string;
  commitments: BriefCommitment[];
  projects: BriefProject[];
  people: BriefPerson[];
  meetings: BriefMeeting[];
};

export type BriefLine = {
  position: number;
  category: "at_risk" | "due_today" | "meeting" | "good_news" | "observation";
  body: string;
  badgeLabel: string | null;
  badgeTone: StatusTone | null;
  personId: string | null;
  projectId: string | null;
  meetingId: string | null;
  commitmentId: string | null;
  /** Never empty — a line with no source does not get written. */
  sourceIds: string[];
  factType: "extracted" | "inference";
  confidence: number;
};

export type BriefDraft = {
  greeting: string;
  headline: string;
  stats: {
    waitingOnYou: number;
    waitingOnYouOverdue: number;
    waitingOnOthers: number;
    waitingOnOthersChased: number;
    dealsGoingCold: number;
    coldest: string | null;
  };
  lines: BriefLine[];
};

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${to.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function isOverdue(deadline: string | null, today: string): boolean {
  if (!deadline) return false;
  return deadline.slice(0, 10) < today;
}

function isDueToday(deadline: string | null, today: string): boolean {
  return deadline?.slice(0, 10) === today;
}

/** Documents are the thing this user keeps failing to send — worth naming. */
const DOCUMENT_WORDS = /\b(proposal|sow|deck|doc|document|contract|brief|summary|quote)\b/i;

export function buildBrief(input: BriefInput): BriefDraft {
  const { today } = input;

  const owedByPrincipal = input.commitments.filter(
    (commitment) =>
      commitment.owedByPrincipal && ["open", "due", "overdue"].includes(commitment.status),
  );
  const owedToPrincipal = input.commitments.filter(
    (commitment) =>
      commitment.owedToPrincipal && ["open", "due", "overdue"].includes(commitment.status),
  );

  const overdue = owedByPrincipal.filter((commitment) =>
    isOverdue(commitment.deadline, today),
  );

  // A relationship goes cold by silence, not by sentiment. The rule is the last
  // recorded interaction, because that is the only thing the corpus can prove.
  const cooling = input.people
    .filter((person) => person.lastInteraction !== null)
    .map((person) => ({
      person,
      silentDays: daysBetween(person.lastInteraction as string, today),
    }))
    .filter((entry) => entry.silentDays >= COOLING_AFTER_DAYS)
    .sort((a, b) => b.silentDays - a.silentDays);

  const lines: BriefLine[] = [];
  const push = (line: Omit<BriefLine, "position">): void => {
    // The rule that keeps the screen honest: no source, no line.
    if (line.sourceIds.length === 0) return;
    lines.push({ ...line, position: lines.length });
  };

  // ── Cooling relationships with an outstanding promise ──────────────────────
  // The sharpest signal in the corpus: someone has gone quiet *and* is owed
  // something. Either alone is noise; together it is the thing to act on.

  for (const entry of cooling.slice(0, 3)) {
    const promise = owedByPrincipal.find(
      (commitment) => commitment.counterpartyId === entry.person.id,
    );

    const sourceIds = [
      ...new Set([...entry.person.sourceIds, ...(promise?.sourceIds ?? [])]),
    ];

    push({
      category: "at_risk",
      body: promise
        ? `${entry.person.name} has gone quiet — no reply in ${entry.silentDays} days, and you still owe them: ${promise.what}.`
        : `${entry.person.name} has gone quiet. No reply in ${entry.silentDays} days.`,
      badgeLabel: promise ? "At risk" : "Cooling",
      badgeTone: promise ? "crit" : "warn",
      personId: entry.person.id,
      projectId: null,
      meetingId: null,
      commitmentId: promise?.id ?? null,
      sourceIds,
      // Joining a silence to a promise is a reading of two records, not a quote.
      factType: "inference",
      confidence: promise ? 0.85 : 0.7,
    });
  }

  // ── Overdue and due-today promises ────────────────────────────────────────

  for (const commitment of [...overdue].sort((a, b) =>
    (a.deadline ?? "").localeCompare(b.deadline ?? ""),
  )) {
    const to = commitment.counterpartyName ?? "someone";
    const late = commitment.deadline ? daysBetween(commitment.deadline, today) : 0;
    push({
      category: "due_today",
      body: `You promised ${to} — ${commitment.what}. ${
        late === 1 ? "One day late." : `${late} days late.`
      }`,
      badgeLabel: "Overdue",
      badgeTone: "crit",
      personId: commitment.counterpartyId,
      projectId: null,
      meetingId: null,
      commitmentId: commitment.id,
      sourceIds: commitment.sourceIds,
      factType: "extracted",
      confidence: commitment.confidence,
    });
  }

  for (const commitment of owedByPrincipal.filter((entry) =>
    isDueToday(entry.deadline, today),
  )) {
    push({
      category: "due_today",
      body: `You promised ${commitment.counterpartyName ?? "someone"} — ${commitment.what}. Due by end of day.`,
      badgeLabel: "Due today",
      badgeTone: "warn",
      personId: commitment.counterpartyId,
      projectId: null,
      meetingId: null,
      commitmentId: commitment.id,
      sourceIds: commitment.sourceIds,
      factType: "extracted",
      confidence: commitment.confidence,
    });
  }

  // ── Projects at risk ──────────────────────────────────────────────────────

  for (const project of input.projects.filter((entry) =>
    ["at_risk", "slipping", "blocked"].includes(entry.status),
  )) {
    const blocker = project.blockers[0];
    push({
      category: "at_risk",
      body:
        `${project.name} is ${project.status.replace(/_/g, " ")}` +
        (blocker ? ` — ${blocker}` : "") +
        (project.deadline ? `. Deadline ${project.deadline}.` : "."),
      badgeLabel: project.status === "blocked" ? "Blocked" : "At risk",
      badgeTone: "crit",
      personId: null,
      projectId: project.id,
      meetingId: null,
      commitmentId: null,
      sourceIds: project.sourceIds,
      factType: "extracted",
      confidence: 0.8,
    });
  }

  // ── Today's meetings ──────────────────────────────────────────────────────

  for (const meeting of input.meetings.filter(
    (entry) => entry.occurredAt.slice(0, 10) === today,
  )) {
    const time = meeting.occurredAt.slice(11, 16);
    push({
      category: "meeting",
      body: `${time} — ${meeting.title}${meeting.companyName ? ` with ${meeting.companyName}` : ""}.`,
      badgeLabel: "Meeting",
      badgeTone: "neutral",
      personId: null,
      projectId: null,
      meetingId: meeting.id,
      commitmentId: null,
      sourceIds: meeting.sourceIds,
      factType: "extracted",
      confidence: 0.9,
    });
  }

  // ── Good news ─────────────────────────────────────────────────────────────
  // Something owed *to* the user that arrived is the only unambiguously good
  // signal available without sentiment analysis.

  for (const commitment of owedToPrincipal.slice(0, 2)) {
    push({
      category: "good_news",
      body: `${commitment.counterpartyName ?? "Someone"} owes you — ${commitment.what}${
        commitment.deadline ? `, by ${commitment.deadline}` : ""
      }.`,
      badgeLabel: "Waiting",
      badgeTone: "neutral",
      personId: commitment.counterpartyId,
      projectId: null,
      meetingId: null,
      commitmentId: commitment.id,
      sourceIds: commitment.sourceIds,
      factType: "extracted",
      confidence: commitment.confidence,
    });
  }

  // ── The one observation ───────────────────────────────────────────────────
  // A pattern across records, not a summary of them. Stated only when the rule
  // actually fires, so the slot is empty rather than padded on a quiet day.

  const stuckDocuments = overdue.filter((commitment) =>
    DOCUMENT_WORDS.test(commitment.what),
  );

  if (stuckDocuments.length >= 2) {
    push({
      category: "observation",
      body: `${stuckDocuments.length} of the things holding you up are unsent documents, not unfinished work — ${stuckDocuments
        .map((commitment) => commitment.counterpartyName ?? "someone")
        .join(" and ")} are both waiting on a file.`,
      badgeLabel: "Pattern",
      badgeTone: "warn",
      personId: null,
      projectId: null,
      meetingId: null,
      commitmentId: null,
      sourceIds: [...new Set(stuckDocuments.flatMap((entry) => entry.sourceIds))],
      factType: "inference",
      confidence: 0.75,
    });
  }

  const headlineParts: string[] = [];
  const todaysMeetings = input.meetings.filter(
    (entry) => entry.occurredAt.slice(0, 10) === today,
  ).length;

  if (todaysMeetings > 0) {
    headlineParts.push(`${todaysMeetings} meeting${todaysMeetings === 1 ? "" : "s"}`);
  }
  const dueCount = overdue.length + owedByPrincipal.filter((entry) => isDueToday(entry.deadline, today)).length;
  if (dueCount > 0) {
    headlineParts.push(`${dueCount} commitment${dueCount === 1 ? "" : "s"} due`);
  }
  const slipping = input.projects.filter((entry) =>
    ["at_risk", "slipping", "blocked"].includes(entry.status),
  ).length;
  if (slipping > 0) {
    headlineParts.push(`${slipping} project${slipping === 1 ? "" : "s"} slipping`);
  }

  return {
    greeting: `Good morning, ${input.principalName.split(" ")[0] ?? input.principalName}.`,
    headline:
      headlineParts.length > 0
        ? `${headlineParts.join(", ")}. You can ignore the rest.`
        : "Nothing is on fire. No commitments due, no projects slipping.",
    stats: {
      waitingOnYou: owedByPrincipal.length,
      waitingOnYouOverdue: overdue.length,
      waitingOnOthers: owedToPrincipal.length,
      waitingOnOthersChased: owedToPrincipal.filter((entry) =>
        isOverdue(entry.deadline, today),
      ).length,
      dealsGoingCold: cooling.length,
      coldest: cooling[0]?.person.companyName ?? cooling[0]?.person.name ?? null,
    },
    lines,
  };
}
