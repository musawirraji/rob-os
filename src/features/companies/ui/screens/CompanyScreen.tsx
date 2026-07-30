import {
  ActivityFeed,
  DetailPanel,
  LivingSummary,
  ObjectList,
  ObjectPage,
} from "@shared/components/objectPage";
import { RecordTabs } from "@shared/components/RecordTabs";
import { routes } from "@shared/navigation/routes";
import type { CompanyState } from "@features/companies";

/** Render-only. Panels are views of one already-loaded state, so tabs are local. */
export function CompanyScreen({ state, tab }: { state: CompanyState; tab: string }) {
  const people = (
    <ObjectList
      label="People"
      rows={state.people}
      emptyTitle="No contacts yet"
      emptyBody="Contacts appear as sources connect a person to this company."
    />
  );

  return (
    <ObjectPage
      back={{ href: routes.companies(), label: "Companies" }}
      detail={
        <DetailPanel
          tile="company"
          initials={state.initials}
          name={state.name}
          subtitle={state.subtitle}
          facts={state.facts}
        />
      }
    >
      <RecordTabs
        basePath={routes.company(state.id)}
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
              {people}
            </>
          ),
          people,
          activity: <ActivityFeed entries={state.feed} />,
        }}
      />
    </ObjectPage>
  );
}
