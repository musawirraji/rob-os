import {
  Card,
  CardHeader,
  EmptyState,
  ProvenanceTag,
  SectionLabel,
  SourceChip,
  StatTile,
  StatusBadge,
  toneFrom,
} from "@shared/components/primitives";
import { Icon, type IconName } from "@shared/components/Icon";
import type { TodayLine, TodayState } from "@features/today";

/**
 * Today. Render-only: every string, badge and link was decided in
 * `loadTodayScreen`, so this file contains no formatting or branching logic
 * beyond choosing a glyph.
 */

const CATEGORY_ICON: Record<TodayLine["category"], IconName> = {
  at_risk: "overdue",
  due_today: "waiting",
  meeting: "meeting",
  good_news: "fact",
  observation: "inference",
};

function BriefRow({ line }: { line: TodayLine }) {
  const body = (
    <>
      <span className="ro-brief__icon">
        <Icon name={CATEGORY_ICON[line.category]} size={15} />
      </span>
      <span className="ro-brief__text">
        {line.body}
        <span className="ro-brief__meta">
          {line.factType === "inference" ? <ProvenanceTag label="inference" /> : null}
          {line.sources.map((source) => (
            <SourceChip
              key={source.sourceId}
              kind={source.kind}
              title={source.title}
            />
          ))}
        </span>
      </span>
      {line.badgeLabel ? (
        <StatusBadge tone={toneFrom(line.badgeTone)}>{line.badgeLabel}</StatusBadge>
      ) : null}
    </>
  );

  if (line.href) {
    return (
      <a className="ro-brief__row" href={line.href}>
        {body}
      </a>
    );
  }
  return <div className="ro-brief__row">{body}</div>;
}

export function TodayScreen({ state }: { state: TodayState }) {
  return (
    <div className="ro-today">
      <header className="ro-today__head">
        <h1 className="ro-today__greeting">
          {state.greeting} <span>Here&rsquo;s what matters.</span>
        </h1>
        <p className="ro-today__headline">{state.headline}</p>
      </header>

      <div className="ro-today__stats">
        <StatTile
          label="Waiting on you"
          value={state.stats.waitingOnYou}
          detail={
            state.stats.waitingOnYouOverdue > 0
              ? `${state.stats.waitingOnYouOverdue} overdue`
              : "none overdue"
          }
        />
        <StatTile
          label="Waiting on others"
          value={state.stats.waitingOnOthers}
          detail={
            state.stats.waitingOnOthersChased > 0
              ? `${state.stats.waitingOnOthersChased} past due`
              : "none past due"
          }
        />
        <StatTile
          label="Going cold"
          value={state.stats.dealsGoingCold}
          detail={state.stats.coldest ? `${state.stats.coldest} flagged` : "nothing flagged"}
        />
      </div>

      <Card padded={false}>
        <CardHeader label="Daily brief" aside={state.date} />
        {state.lines.length > 0 ? (
          <div className="ro-brief">
            {state.lines.map((line) => (
              <BriefRow key={line.id} line={line} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nothing to report"
            body={
              state.empty
                ? "No sources have been ingested yet. Capture something, or run the seed corpus."
                : "No commitments due, nothing going cold, no projects slipping."
            }
          />
        )}
      </Card>

      <p className="ro-note">
        <SectionLabel>Every line above links to the source it came from.</SectionLabel>
      </p>
    </div>
  );
}
