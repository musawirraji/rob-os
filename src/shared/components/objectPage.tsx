import type { ReactNode } from "react";

import Link from "next/link";

import type { FeedEntry } from "@shared/services/objectFeed";
import { relativeAge } from "@shared/services/objectFeed";
import type { ProvenanceLabel } from "@shared/interfaces/provenance";
import { provenanceLabel } from "@shared/interfaces/provenance";
import type { TileColor } from "@shared/interfaces/objects";

import { Icon, type IconName } from "./Icon";
import {
  Card,
  CardHeader,
  EmptyState,
  ObjectTile,
  ProvenanceTag,
  SourceChip,
  StatusBadge,
} from "./primitives";

/**
 * The three-pane object record, shared by Person, Company and Project.
 *
 * The left panel stays visible because it is the answer to "who am I looking at",
 * and losing it while scrolling a feed is disorienting. Tabs are plain links with
 * a `?tab=` query, so the whole record is server-rendered and needs no client JS.
 */

// ── Left detail panel ────────────────────────────────────────────────────────

export type DetailFact = {
  label: string;
  value: string;
  /** Renders as a pastel badge instead of plain text. */
  tone?: "good" | "warn" | "crit" | "neutral";
};

export function DetailPanel({
  tile,
  initials,
  name,
  subtitle,
  facts,
  actions,
}: {
  tile: TileColor;
  initials: string;
  name: string;
  subtitle: string | null;
  facts: DetailFact[];
  actions?: { icon: IconName; label: string; href: string }[];
}) {
  return (
    <aside className="ro-detail">
      <div className="ro-detail__avatar" style={{ background: `var(--ro-tile-${tile})` }}>
        {initials}
      </div>

      <h1 className="ro-detail__name">{name}</h1>
      {subtitle ? <p className="ro-detail__sub">{subtitle}</p> : null}

      {actions && actions.length > 0 ? (
        <div className="ro-detail__actions">
          {actions.map((action) => (
            <Link
              key={action.label}
              className="ro-detail__action"
              href={action.href}
              aria-label={action.label}
              title={action.label}
            >
              <Icon name={action.icon} size={14} />
            </Link>
          ))}
        </div>
      ) : null}

      <dl className="ro-detail__facts">
        {facts.map((fact) => (
          <div key={fact.label} className="ro-detail__fact">
            <dt>{fact.label}</dt>
            <dd>
              {fact.tone ? (
                <StatusBadge tone={fact.tone}>{fact.value}</StatusBadge>
              ) : (
                fact.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

export type ObjectTab = { id: string; label: string; count?: number };

export function ObjectTabs({
  tabs,
  active,
  basePath,
}: {
  tabs: ObjectTab[];
  active: string;
  basePath: string;
}) {
  return (
    <nav className="ro-tabs" aria-label="Record sections">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            className={`ro-tabs__tab${isActive ? " is-active" : ""}`}
            href={tab.id === "overview" ? basePath : `${basePath}?tab=${tab.id}`}
            aria-current={isActive ? "page" : undefined}
            scroll={false}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 ? (
              <span className="ro-tabs__count">{tab.count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

// ── Living summary ───────────────────────────────────────────────────────────

export function LivingSummary({
  text,
  label,
  confidence,
  sources,
  updatedAt,
}: {
  text: string | null;
  label: ProvenanceLabel;
  confidence: number;
  sources: { sourceId: string; kind: FeedEntry["sources"][number]["kind"]; title: string }[];
  updatedAt: string | null;
}) {
  const age = updatedAt ? relativeAge(updatedAt) : null;

  if (!text) {
    return (
      <Card>
        <CardHeader label="Living summary" />
        <p className="ro-summary__none">
          No summary yet. One is written once this record has been touched by an
          ingested source.
        </p>
      </Card>
    );
  }

  return (
    <Card padded={false} className="ro-summary">
      <CardHeader
        label="Living summary"
        aside={
          <span className="ro-summary__meta">
            <ProvenanceTag label={label} />
            <span className="ro-summary__conf">{Math.round(confidence * 100)}%</span>
          </span>
        }
      />
      <div className="ro-summary__body">
        <p>{text}</p>
        <div className="ro-summary__chips">
          {sources.map((source) => (
            <SourceChip key={source.sourceId} kind={source.kind} title={source.title} />
          ))}
        </div>
        {updatedAt ? (
          <p className="ro-summary__stamp">
            {/* `relativeAge` returns "today" for the current day, which does not
                take "ago". */}
            Rewritten {age === "today" ? "today" : `${age} ago`} from{" "}
            {sources.length} source{sources.length === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

// ── Activity feed ────────────────────────────────────────────────────────────

const FEED_ICON: Record<FeedEntry["kind"], IconName> = {
  mention: "email",
  commitment: "waiting",
  decision: "fact",
  task: "review",
};

export function ActivityFeed({ entries }: { entries: FeedEntry[] }) {
  if (entries.length === 0) {
    return (
      <Card padded={false}>
        <CardHeader label="Activity" />
        <EmptyState
          title="Nothing recorded yet"
          body="Activity appears here as sources mentioning this record are ingested."
        />
      </Card>
    );
  }

  return (
    <Card padded={false}>
      <CardHeader label="Activity" aside={`${entries.length} entries`} />
      <div className="ro-feed">
        {entries.map((entry) => (
          <article key={entry.id} className="ro-feed__row">
            <span className="ro-feed__icon">
              <Icon name={FEED_ICON[entry.kind]} size={14} />
            </span>

            <div className="ro-feed__body">
              <p className="ro-feed__title">
                {entry.title}
                {entry.badgeLabel ? (
                  <StatusBadge tone={entry.badgeTone ?? "neutral"}>
                    {entry.badgeLabel}
                  </StatusBadge>
                ) : null}
              </p>
              {entry.detail ? <p className="ro-feed__detail">{entry.detail}</p> : null}
              <div className="ro-feed__meta">
                <ProvenanceTag label={provenanceLabel(entry.factType)} />
                {entry.sources.map((source) => (
                  <SourceChip
                    key={source.sourceId}
                    kind={source.kind}
                    title={source.title}
                  />
                ))}
              </div>
            </div>

            <time className="ro-feed__age">{relativeAge(entry.occurredAt)}</time>
          </article>
        ))}
      </div>
    </Card>
  );
}

// ── Layout ───────────────────────────────────────────────────────────────────

export function ObjectPage({
  detail,
  tabs,
  children,
}: {
  detail: ReactNode;
  tabs: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="ro-object">
      {detail}
      <div className="ro-object__main">
        {tabs}
        <div className="ro-object__stack">{children}</div>
      </div>
    </div>
  );
}

// ── List index ───────────────────────────────────────────────────────────────

export type ObjectListRow = {
  id: string;
  href: string;
  tile: TileColor;
  name: string;
  subtitle: string | null;
  meta: string | null;
  badgeLabel: string | null;
  badgeTone: "good" | "warn" | "crit" | "neutral" | null;
};

export function ObjectList({
  label,
  rows,
  emptyTitle,
  emptyBody,
}: {
  label: string;
  rows: ObjectListRow[];
  emptyTitle: string;
  emptyBody: string;
}) {
  return (
    <Card padded={false}>
      <CardHeader label={label} aside={`${rows.length}`} />
      {rows.length === 0 ? (
        <EmptyState title={emptyTitle} body={emptyBody} />
      ) : (
        <div className="ro-list">
          {rows.map((row) => (
            <Link key={row.id} className="ro-list__row" href={row.href}>
              <ObjectTile color={row.tile} size={26} />
              <span className="ro-list__body">
                <span className="ro-list__name">{row.name}</span>
                {row.subtitle ? (
                  <span className="ro-list__sub">{row.subtitle}</span>
                ) : null}
              </span>
              {row.badgeLabel ? (
                <StatusBadge tone={row.badgeTone ?? "neutral"}>{row.badgeLabel}</StatusBadge>
              ) : null}
              {row.meta ? <span className="ro-list__meta">{row.meta}</span> : null}
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
