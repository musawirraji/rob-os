import {
  ActivityFeed,
  DetailPanel,
  LivingSummary,
  ObjectPage,
  ObjectTabs,
} from "@shared/components/objectPage";
import { Card, CardHeader, EmptyState } from "@shared/components/primitives";
import { routes } from "@shared/navigation/routes";
import type { PersonState } from "@features/people";

/** Render-only. Every value was decided in `loadPersonScreen`. */
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
      tabs={
        <ObjectTabs
          basePath={routes.person(state.id)}
          active={tab}
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "activity", label: "Activity", count: state.counts.activity },
            { id: "commitments", label: "Commitments", count: commitments.length },
            { id: "decisions", label: "Decisions", count: decisions.length },
          ]}
        />
      }
    >
      {tab === "overview" ? (
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
      ) : null}

      {tab === "activity" ? <ActivityFeed entries={state.feed} /> : null}

      {tab === "commitments" ? (
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
        )
      ) : null}

      {tab === "decisions" ? (
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
        )
      ) : null}
    </ObjectPage>
  );
}
