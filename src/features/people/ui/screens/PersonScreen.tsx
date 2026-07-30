import {
  ActivityFeed,
  DetailPanel,
  LivingSummary,
  ObjectPage,
} from "@shared/components/objectPage";
import { RecordTabs } from "@shared/components/RecordTabs";
import { Card, CardHeader, EmptyState } from "@shared/components/primitives";
import { routes } from "@shared/navigation/routes";
import type { PersonState } from "@features/people";

/**
 * Render-only. Every value was decided in `loadPersonScreen`.
 *
 * All four panels are built here rather than one per request. They are filters of
 * the same already-loaded feed, so building them together costs one pass over an
 * array the page is holding anyway — and it means changing tab is instant instead
 * of a round trip that re-fetches the record to show a subset of itself.
 */
export function PersonScreen({
  state,
  tab,
}: {
  state: PersonState;
  tab: string;
}) {
  const commitments = state.feed.filter((entry) => entry.kind === "commitment");
  const decisions = state.feed.filter((entry) => entry.kind === "decision");

  return (
    <ObjectPage
      back={{ href: routes.people(), label: "People" }}
      detail={
        <DetailPanel
          tile="person"
          initials={state.initials}
          name={state.name}
          subtitle={state.subtitle}
          facts={state.facts}
          actions={
            state.companyHref
              ? [{ icon: "company", label: "Company", href: state.companyHref }]
              : undefined
          }
        />
      }
    >
      <RecordTabs
        basePath={routes.person(state.id)}
        initial={tab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "activity", label: "Activity", count: state.counts.activity },
          { id: "commitments", label: "Commitments", count: commitments.length },
          { id: "decisions", label: "Decisions", count: decisions.length },
        ]}
        panels={{
          overview: (
            <>
              <LivingSummary
                text={state.summary.text}
                label={state.summary.label}
                confidence={state.summary.confidence}
                sources={state.summary.sources}
                updatedAt={state.summary.updatedAt}
              />
              <ActivityFeed entries={state.feed.slice(0, 8)} />
            </>
          ),
          activity: <ActivityFeed entries={state.feed} />,
          commitments:
            commitments.length > 0 ? (
              <ActivityFeed entries={commitments} />
            ) : (
              <Card padded={false}>
                <CardHeader label="Commitments" />
                <EmptyState
                  title="Nothing outstanding"
                  body="No open promises in either direction with this person."
                />
              </Card>
            ),
          decisions:
            decisions.length > 0 ? (
              <ActivityFeed entries={decisions} />
            ) : (
              <Card padded={false}>
                <CardHeader label="Decisions" />
                <EmptyState
                  title="No decisions recorded"
                  body="Decisions this person made or was bound by will appear here."
                />
              </Card>
            ),
        }}
      />
    </ObjectPage>
  );
}
