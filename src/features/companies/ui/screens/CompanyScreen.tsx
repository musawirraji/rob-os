import {
  ActivityFeed,
  DetailPanel,
  LivingSummary,
  ObjectList,
  ObjectPage,
  ObjectTabs,
} from "@shared/components/objectPage";
import { routes } from "@shared/navigation/routes";
import type { CompanyState } from "@features/companies";

export function CompanyScreen({ state, tab }: { state: CompanyState; tab: string }) {
  return (
    <ObjectPage
      detail={
        <DetailPanel
          tile="company"
          initials={state.initials}
          name={state.name}
          subtitle={state.subtitle}
          facts={state.facts}
        />
      }
      tabs={
        <ObjectTabs
          basePath={routes.company(state.id)}
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
          <ObjectList
            label="People"
            rows={state.people}
            emptyTitle="No contacts yet"
            emptyBody="Contacts appear as sources connect a person to this company."
          />
        </>
      ) : null}

      {tab === "people" ? (
        <ObjectList
          label="People"
          rows={state.people}
          emptyTitle="No contacts yet"
          emptyBody="Contacts appear as sources connect a person to this company."
        />
      ) : null}

      {tab === "activity" ? <ActivityFeed entries={state.feed} /> : null}
    </ObjectPage>
  );
}
