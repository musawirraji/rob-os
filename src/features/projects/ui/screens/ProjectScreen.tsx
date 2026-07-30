import {
  ActivityFeed,
  DetailPanel,
  LivingSummary,
  ObjectList,
  ObjectPage,
} from "@shared/components/objectPage";
import { RecordTabs } from "@shared/components/RecordTabs";
import { Card, CardHeader } from "@shared/components/primitives";
import { routes } from "@shared/navigation/routes";
import type { ProjectState } from "@features/projects";

/** Render-only. Panels are views of one already-loaded state, so tabs are local. */
export function ProjectScreen({ state, tab }: { state: ProjectState; tab: string }) {
  return (
    <ObjectPage
      back={{ href: routes.projects(), label: "Projects" }}
      detail={
        <DetailPanel
          tile="project"
          initials={state.initials}
          name={state.name}
          subtitle={state.subtitle}
          facts={state.facts}
        />
      }
    >
      <RecordTabs
        basePath={routes.project(state.id)}
        initial={tab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "people", label: "People", count: state.counts.people },
          { id: "activity", label: "Activity", count: state.counts.activity },
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
          ),
          people: (
            <ObjectList
              label="People"
              rows={state.people}
              emptyTitle="Nobody linked yet"
              emptyBody="People appear once a source connects them to this project."
            />
          ),
          activity: <ActivityFeed entries={state.feed} />,
        }}
      />
    </ObjectPage>
  );
}
