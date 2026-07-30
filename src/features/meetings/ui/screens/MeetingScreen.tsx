import {
  ActivityFeed,
  DetailPanel,
  LivingSummary,
  ObjectList,
  ObjectPage,
} from "@shared/components/objectPage";
import { RecordTabs } from "@shared/components/RecordTabs";
import { Card, CardHeader, EmptyState } from "@shared/components/primitives";
import { routes } from "@shared/navigation/routes";
import type { MeetingState } from "@features/meetings";

/** Render-only. Panels are views of one already-loaded state, so tabs are local. */
export function MeetingScreen({ state, tab }: { state: MeetingState; tab: string }) {
  return (
    <ObjectPage
      back={{ href: routes.meetings(), label: "Meetings" }}
      detail={
        <DetailPanel
          tile="meeting"
          initials={state.initials}
          name={state.title}
          subtitle={state.subtitle}
          facts={state.facts}
        />
      }
    >
      <RecordTabs
        basePath={routes.meeting(state.id)}
        initial={tab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "decisions", label: "Decisions", count: state.counts.decisions },
          { id: "commitments", label: "Commitments", count: state.counts.commitments },
          { id: "transcript", label: "Transcript" },
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
              <ObjectList
                label="Attendees"
                rows={state.attendees}
                emptyTitle="No attendees linked"
                emptyBody="Attendees come from the names in the transcript."
              />
              {state.decisions.length > 0 ? (
                <ActivityFeed entries={state.decisions} />
              ) : null}
            </>
          ),
          decisions:
            state.decisions.length > 0 ? (
              <ActivityFeed entries={state.decisions} />
            ) : (
              <Card padded={false}>
                <CardHeader label="Decisions" />
                <EmptyState
                  title="No decisions recorded"
                  body="Nothing in this transcript was extracted as a decision."
                />
              </Card>
            ),
          commitments:
            state.commitments.length > 0 ? (
              <ActivityFeed entries={state.commitments} />
            ) : (
              <Card padded={false}>
                <CardHeader label="Commitments" />
                <EmptyState
                  title="No commitments recorded"
                  body="Nothing in this transcript was extracted as a promise."
                />
              </Card>
            ),
          transcript: (
            <Card padded={false}>
              <CardHeader label="Transcript" aside="Source of record" />
              {state.transcript ? (
                <pre className="ro-transcript ro-scroll-x">{state.transcript}</pre>
              ) : (
                <EmptyState
                  title="No transcript stored"
                  body="This meeting was not derived from a transcript source."
                />
              )}
            </Card>
          ),
        }}
      />
    </ObjectPage>
  );
}
