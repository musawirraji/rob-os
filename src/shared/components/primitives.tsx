import type { ReactNode } from "react";

import type { SourceKind, StatusTone, TileColor } from "@shared/interfaces/objects";
import type { ProvenanceLabel } from "@shared/interfaces/provenance";

import { Icon, type IconName } from "./Icon";

/**
 * The atoms of the design system. Render-only — props in, JSX out, no logic.
 *
 * They live in one file because they are one idea: the small set of marks that
 * carry the product's meaning. The source chip and the provenance tag in
 * particular are not decoration; they are the interface's promise that a claim can
 * be checked, and they repeat on every surface.
 */

// ── Section eyebrow ──────────────────────────────────────────────────────────

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="ro-eyebrow">{children}</p>;
}

// ── Object tile ──────────────────────────────────────────────────────────────

const TILE_ICON: Record<TileColor, IconName> = {
  person: "person",
  company: "company",
  project: "project",
  deal: "company",
  meeting: "meeting",
  note: "transcript",
};

export function ObjectTile({
  color,
  size = 28,
  label,
}: {
  color: TileColor;
  size?: number;
  label?: string;
}) {
  return (
    <span
      className="ro-tile"
      style={{ background: `var(--ro-tile-${color})`, width: size, height: size }}
    >
      <Icon name={TILE_ICON[color]} size={Math.round(size * 0.52)} label={label} />
    </span>
  );
}

// ── Source chip — the signature element ──────────────────────────────────────

const SOURCE_ICON: Record<SourceKind, IconName> = {
  email: "email",
  meeting: "transcript",
  doc: "document",
  note: "transcript",
  upload: "attachment",
  crm: "crm",
};

const SOURCE_LABEL: Record<SourceKind, string> = {
  email: "Email",
  meeting: "Granola",
  doc: "Doc",
  note: "Note",
  upload: "Upload",
  crm: "CRM",
};

export function SourceChip({
  kind,
  title,
  href,
}: {
  kind: SourceKind;
  title: string;
  href?: string;
}) {
  const content = (
    <>
      <Icon name={SOURCE_ICON[kind]} size={12} />
      <span className="ro-chip__kind">{SOURCE_LABEL[kind]}</span>
      <span className="ro-chip__sep">·</span>
      <span className="ro-chip__title">{title}</span>
    </>
  );

  if (href) {
    return (
      <a className="ro-chip" href={href}>
        {content}
      </a>
    );
  }
  return <span className="ro-chip">{content}</span>;
}

// ── Provenance tag — quiet, never a loud chip ────────────────────────────────

export function ProvenanceTag({ label }: { label: ProvenanceLabel }) {
  const icon: IconName = label === "fact" ? "fact" : "inference";
  return (
    <span className={`ro-prov ro-prov--${label}`}>
      <Icon name={icon} size={11} />
      {label}
    </span>
  );
}

// ── Pastel status badge ──────────────────────────────────────────────────────

export function StatusBadge({
  tone,
  children,
}: {
  tone: StatusTone;
  children: ReactNode;
}) {
  return <span className={`ro-badge ro-badge--${tone}`}>{children}</span>;
}

/** Maps the strings stored on brief items onto the badge tones. */
export function toneFrom(value: string | null): StatusTone {
  if (value === "good" || value === "warn" || value === "crit") return value;
  return "neutral";
}

// ── Card ─────────────────────────────────────────────────────────────────────

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={`ro-card${padded ? "" : " ro-card--flush"}${className ? ` ${className}` : ""}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  label,
  aside,
}: {
  label: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="ro-card__head">
      <p className="ro-eyebrow">{label}</p>
      {aside ? <span className="ro-card__aside">{aside}</span> : null}
    </header>
  );
}

// ── Stat tile ────────────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | string;
  detail?: string | null;
}) {
  return (
    <div className="ro-stat">
      <p className="ro-eyebrow">{label}</p>
      <p className="ro-stat__value">{value}</p>
      {detail ? <p className="ro-stat__detail">{detail}</p> : null}
    </div>
  );
}

// ── Button ───────────────────────────────────────────────────────────────────
// Primary is black. It is never coloured, on any surface.

export function Button({
  variant = "secondary",
  icon,
  children,
  onClick,
  type = "button",
  disabled,
}: {
  variant?: "primary" | "secondary" | "ghost";
  icon?: IconName;
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      className={`ro-btn ro-btn--${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </button>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

export function EmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="ro-empty">
      <p className="ro-empty__title">{title}</p>
      <p className="ro-empty__body">{body}</p>
    </div>
  );
}
