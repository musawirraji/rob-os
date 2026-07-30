import { Card, CardHeader } from "./primitives";

/**
 * Loading skeletons, one per screen shape.
 *
 * Two rules govern these. **They mirror the real geometry** — same paddings, same
 * row heights, same column split — because a skeleton whose shape is wrong just
 * moves the jank from "blank screen" to "everything jumps once it arrives".
 * And **they never invent counts**: a skeleton showing four rows where two arrive
 * is a small lie the user watches correct itself.
 *
 * Row counts below are therefore deliberately typical-not-precise, and the blocks
 * carry no numbers, no names and no badges — nothing that could be mistaken for
 * data that has loaded.
 *
 * `aria-busy` plus one polite live label per screen means a screen reader hears
 * "loading" once, rather than reading out forty empty boxes.
 */

function Block({
  w,
  h = 12,
  radius = 6,
}: {
  w: number | string;
  h?: number;
  radius?: number;
}) {
  return (
    <span
      className="ro-sk"
      style={{ width: typeof w === "number" ? `${w}px` : w, height: h, borderRadius: radius }}
    />
  );
}

function Shell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ro-sk-screen" aria-busy="true">
      <span className="ro-visually-hidden" role="status">
        {label}
      </span>
      {children}
    </div>
  );
}

// ── Rows ─────────────────────────────────────────────────────────────────────

function ListRows({ count }: { count: number }) {
  return (
    <div className="ro-sk-list">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="ro-sk-list__row">
          <Block w={26} h={26} radius={8} />
          <span className="ro-sk-list__body">
            {/* Widths vary a little so the column does not read as a solid bar. */}
            <Block w={i % 3 === 0 ? 168 : i % 3 === 1 ? 132 : 194} h={13} />
            <Block w={i % 2 === 0 ? 232 : 188} h={11} />
          </span>
          <Block w={54} h={18} radius={999} />
        </div>
      ))}
    </div>
  );
}

// ── Today ────────────────────────────────────────────────────────────────────

export function TodaySkeleton() {
  return (
    <Shell label="Loading your brief">
      <Block w={120} h={12} />
      <div className="ro-sk-gap" />
      <Block w="min(560px, 90%)" h={30} />

      <div className="ro-sk-stats">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="ro-sk-stat">
            <Block w={72} h={10} />
            <Block w={44} h={26} />
            <Block w={96} h={10} />
          </div>
        ))}
      </div>

      {["Due", "Waiting on", "At risk"].map((label) => (
        <Card key={label} padded={false}>
          <CardHeader label={label} />
          <div className="ro-sk-brief">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="ro-sk-brief__row">
                <Block w={22} h={22} radius={7} />
                <span className="ro-sk-list__body">
                  <Block w={i === 0 ? "72%" : "58%"} h={13} />
                  <Block w={140} h={11} />
                </span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </Shell>
  );
}

// ── Index list (People, Companies, Projects, Meetings) ───────────────────────

export function IndexSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Shell label="Loading records">
      <Block w={172} h={24} />
      <div className="ro-sk-gap" />
      <Block w="min(420px, 80%)" h={13} />
      <div className="ro-sk-gap" />
      <Card padded={false}>
        <CardHeader label="Loading" />
        <ListRows count={rows} />
      </Card>
    </Shell>
  );
}

// ── Object record (Person, Company, Project, Meeting) ────────────────────────

export function ObjectSkeleton() {
  return (
    <Shell label="Loading record">
      <div className="ro-sk-object">
        <aside className="ro-sk-detail">
          <Block w={56} h={56} radius={14} />
          <Block w={148} h={20} />
          <Block w={104} h={12} />
          <div className="ro-sk-detail__actions">
            {Array.from({ length: 3 }, (_, i) => (
              <Block key={i} w={32} h={32} radius={9} />
            ))}
          </div>
          <div className="ro-sk-detail__facts">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="ro-sk-detail__fact">
                <Block w={64} h={10} />
                <Block w={i % 2 === 0 ? 92 : 116} h={11} />
              </div>
            ))}
          </div>
        </aside>

        <div className="ro-sk-main">
          <div className="ro-sk-tabs">
            {[62, 78, 70, 88].map((w, i) => (
              <Block key={i} w={w} h={14} />
            ))}
          </div>

          <Card>
            <Block w={92} h={10} />
            <div className="ro-sk-gap" />
            <Block w="100%" h={13} />
            <Block w="94%" h={13} />
            <Block w="68%" h={13} />
            <div className="ro-sk-gap" />
            <div className="ro-sk-chips">
              <Block w={148} h={22} radius={999} />
              <Block w={172} h={22} radius={999} />
            </div>
          </Card>

          <Card padded={false}>
            <CardHeader label="Activity" />
            <div className="ro-sk-list">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="ro-sk-list__row">
                  <Block w={26} h={26} radius={8} />
                  <span className="ro-sk-list__body">
                    <Block w={i % 2 === 0 ? "64%" : "48%"} h={13} />
                    <Block w={158} h={11} radius={999} />
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// ── Ask ──────────────────────────────────────────────────────────────────────

/**
 * The Ask stages, named rather than dressed up as a progress bar.
 *
 * All three of these do run, in this order, on every question — so listing them is
 * honest. What the server does not report is *which* one is in flight, so nothing
 * here claims to know: no ticks, no percentage, no step highlighted as current.
 * A faked progress bar on the one screen whose entire purpose is not overclaiming
 * would be the wrong place to start lying.
 */
const ASK_STAGES = [
  "Retrieving from your sources",
  "Synthesising an answer",
  "Checking every citation resolves",
];

export function AskSkeleton() {
  return (
    <Shell label="Working on your question">
      <Block w={196} h={26} />
      <div className="ro-sk-gap" />
      <Block w="min(520px, 88%)" h={13} />
      <div className="ro-sk-gap" />

      <div className="ro-sk-ask">
        <p className="ro-sk-ask__lead">
          <span className="ro-spinner is-busy" aria-hidden />
          Working through your sources
        </p>
        <ul className="ro-sk-ask__stages">
          {ASK_STAGES.map((stage) => (
            <li key={stage}>{stage}</li>
          ))}
        </ul>
        <p className="ro-sk-ask__note">
          Nothing is shown until each claim has a source behind it.
        </p>
      </div>
    </Shell>
  );
}

// ── Review queue ─────────────────────────────────────────────────────────────

export function ReviewSkeleton() {
  return (
    <Shell label="Loading the review queue">
      <Block w={188} h={24} />
      <div className="ro-sk-gap" />
      <Block w="min(460px, 86%)" h={13} />
      <div className="ro-sk-gap" />

      {Array.from({ length: 2 }, (_, i) => (
        <Card key={i}>
          <Block w={104} h={11} />
          <div className="ro-sk-gap" />
          <Block w="min(380px, 78%)" h={18} />
          <div className="ro-sk-gap" />
          <Block w="100%" h={52} radius={10} />
          <div className="ro-sk-gap" />
          <div className="ro-sk-chips">
            <Block w={168} h={22} radius={999} />
          </div>
          <div className="ro-sk-gap" />
          <div className="ro-sk-chips">
            <Block w={104} h={34} radius={9} />
            <Block w={116} h={34} radius={9} />
          </div>
        </Card>
      ))}
    </Shell>
  );
}

// ── Inbox / capture ──────────────────────────────────────────────────────────

export function InboxSkeleton() {
  return (
    <Shell label="Loading the inbox">
      <Block w={140} h={24} />
      <div className="ro-sk-gap" />
      <Block w="min(440px, 84%)" h={13} />
      <div className="ro-sk-gap" />

      <div className="ro-sk-capture">
        {["Paste", "Upload"].map((label) => (
          <Card key={label} padded={false}>
            <CardHeader label={label} />
            <div className="ro-sk-capture__form">
              <Block w="100%" h={38} radius={9} />
              <Block w="100%" h={label === "Paste" ? 128 : 38} radius={9} />
              <Block w={128} h={34} radius={9} />
            </div>
          </Card>
        ))}
      </div>

      <Card padded={false}>
        <CardHeader label="Sources" />
        <ListRows count={4} />
      </Card>
    </Shell>
  );
}
