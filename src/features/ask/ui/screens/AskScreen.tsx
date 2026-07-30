import Link from "next/link";

import { Icon } from "@shared/components/Icon";
import {
  Card,
  CardHeader,
  ObjectTile,
  ProvenanceTag,
  SectionLabel,
} from "@shared/components/primitives";
import { routes } from "@shared/navigation/routes";
import type { AskAnswer } from "@features/ask";

import { AskForm } from "../components/AskForm";

/**
 * The Ask surface. Render-only.
 *
 * Three things here are the product rather than decoration: the numbered source
 * cards, the superscript citation after every claim, and the abstain block. The
 * abstain block is deliberately as prominent as the answer — a user who cannot
 * see what the system refused to answer has no way to know what it does not know.
 */

function CitationRefs({ indices }: { indices: number[] }) {
  return (
    <>
      {indices.map((index) => (
        <sup key={index} className="ro-cite">
          {index}
        </sup>
      ))}
    </>
  );
}

export function AskScreen({ answer }: { answer: AskAnswer | null }) {
  return (
    <div className="ro-ask">
      <header className="ro-ask__head">
        <h1 className="ro-ask__title">Ask Rob OS</h1>
        <p className="ro-ask__sub">
          Answered only from your own sources. If nothing supports it, it says so.
        </p>
      </header>

      <AskForm defaultValue={answer?.question ?? ""} />

      {answer === null ? (
        <div className="ro-ask__prompts">
          <SectionLabel>Try</SectionLabel>
          <ul className="ro-ask__examples">
            {[
              "What did I promise Sarah this week?",
              "Is Omnilux at risk?",
              "What's slipping?",
              "Which other vendors is Omnilux evaluating?",
            ].map((example) => (
              <li key={example}>
                <Link href={`${routes.ask()}?q=${encodeURIComponent(example)}`}>{example}</Link>
              </li>
            ))}
          </ul>
          <p className="ro-ask__hint">
            The last one has no answer in your corpus. It should refuse.
          </p>
        </div>
      ) : null}

      {answer?.unavailableReason ? (
        <Card>
          <CardHeader label="Unavailable" />
          <p className="ro-ask__unavailable">
            {answer.unavailableReason}. No answer was generated — nothing here is a
            guess.
          </p>
        </Card>
      ) : null}

      {answer && !answer.unavailableReason ? (
        <div className="ro-ask__layout">
          <div className="ro-ask__main">
            <p className="ro-ask__question">{answer.question}</p>

            {answer.sources.length > 0 ? (
              <section className="ro-ask__sources">
                <SectionLabel>Sources · {answer.sources.length}</SectionLabel>
                <div className="ro-ask__cards">
                  {answer.sources.map((source) => (
                    <article key={source.index} className="ro-ask__card">
                      <p className="ro-ask__cardTitle">
                        <span className="ro-cite ro-cite--card">{source.index}</span>
                        {source.title}
                      </p>
                      <p className="ro-ask__cardMeta">
                        {source.kind}
                        {source.occurredAt ? ` · ${source.occurredAt.slice(0, 10)}` : ""}
                      </p>
                      <p className="ro-ask__cardExcerpt">{source.excerpt}</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <Card padded={false}>
              <CardHeader
                label="Answer"
                aside={
                  answer.grounded ? (
                    <span className="ro-ask__grounded">
                      <Icon name="fact" size={12} /> fully grounded
                    </span>
                  ) : (
                    <span className="ro-ask__partial">
                      <Icon name="inference" size={12} /> partial
                    </span>
                  )
                }
              />

              <div className="ro-ask__body">
                {answer.claims.length > 0 ? (
                  answer.claims.map((claim, index) => (
                    <p key={index} className="ro-ask__claim">
                      {claim.text}
                      <CitationRefs indices={claim.citations} />
                      {claim.label !== "fact" ? (
                        <ProvenanceTag label={claim.label} />
                      ) : null}
                    </p>
                  ))
                ) : (
                  <p className="ro-ask__claim ro-ask__claim--none">
                    Nothing in your sources answers this.
                  </p>
                )}

                {answer.abstained.length > 0 ? (
                  <aside className="ro-abstain">
                    <Icon name="inference" size={14} />
                    <div>
                      <p className="ro-abstain__lead">
                        I don&rsquo;t have a source for
                        {answer.abstained.length === 1 ? " this" : " these"}, so I
                        won&rsquo;t guess:
                      </p>
                      <ul className="ro-abstain__list">
                        {answer.abstained.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </aside>
                ) : null}
              </div>
            </Card>
          </div>

          <aside className="ro-ask__rail">
            {answer.objects.length > 0 ? (
              <Card>
                <SectionLabel>Objects in this answer</SectionLabel>
                <ul className="ro-ask__objects">
                  {answer.objects.map((object) => (
                    <li key={`${object.kind}-${object.id}`}>
                      <Link
                        href={
                          object.kind === "person"
                            ? routes.person(object.id)
                            : object.kind === "company"
                              ? routes.company(object.id)
                              : routes.project(object.id)
                        }
                      >
                        <ObjectTile
                          color={object.kind === "person" ? "person" : object.kind === "company" ? "company" : "project"}
                          size={22}
                        />
                        <span className="ro-ask__objectName">{object.name}</span>
                        {object.subtitle ? (
                          <span className="ro-ask__objectSub">{object.subtitle}</span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {answer.suggestedNext.length > 0 ? (
              <Card>
                <SectionLabel>Suggested next</SectionLabel>
                <ul className="ro-ask__next">
                  {answer.suggestedNext.map((suggestion) => (
                    <li key={suggestion}>{suggestion}</li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
