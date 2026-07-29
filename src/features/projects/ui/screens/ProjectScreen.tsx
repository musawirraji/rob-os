import {
  ActivityFeed,
  DetailPanel,
  LivingSummary,
  ObjectList,
  ObjectPage,
  ObjectTabs,
} from "@shared/components/objectPage";
import { Card, CardHeader } from "@shared/components/primitives";
import { routes } from "@shared/navigation/routes";
import type { ProjectState } from "@features/projects";

export function ProjectScreen({ state, tab }: { state: ProjectState; tab: string }) {
  return (
    <ObjectPage
      detail={
        <DetailPanel
          tile="project"
          initials={state.initials}
          name={state.name}
          subtitle={state.subtitle}
          facts={state.facts}
        />
      }
      tabs={
        <ObjectTabs
          basePath={routes.project(state.id)}
          active={tab}
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "people", label: "People", count: state.counts.people },
            { id: "activity", label: "Activity", count: state.counts.activity },
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
          {state.blockers.length > 0 ? (
            <Card padded={false}>
              <CardHeader label="Blockers" aside={`${state.blockers.length}`} />
              <ul className="ro-blockers">
                {state.blockers.map((blocker) => (
                  <li key={blocker} className="ro-blockers__item">
                    {blocker}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <ActivityFeed entries={state.feed.slice(0, 8)} />
        </>
      ) : null}

      {tab === "people" ? (
        <ObjectList
          label="People"
          rows={state.people}
          emptyTitle="Nobody linked yet"
          emptyBody="People appear once a source connects them to this project."
        />
      ) : null}

      {tab === "activity" ? <ActivityFeed entries={state.feed} /> : null}
    </ObjectPage>
  );
}
