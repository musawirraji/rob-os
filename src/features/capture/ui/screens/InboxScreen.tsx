import { Icon, type IconName } from "@shared/components/Icon";
import {
  Card,
  CardHeader,
  EmptyState,
  StatusBadge,
} from "@shared/components/primitives";
import type { InboxRow, InboxState } from "@features/capture";
import type { SourceKind } from "@shared/interfaces/objects";

import { CaptureForms } from "../components/CaptureForms";

const KIND_ICON: Record<SourceKind, IconName> = {
  email: "email",
  meeting: "transcript",
  doc: "document",
  note: "transcript",
  upload: "attachment",
  crm: "crm",
};

function Row({ row }: { row: InboxRow }) {
  return (
    <article className="ro-inbox__row">
      <span className="ro-inbox__icon">
        <Icon name={KIND_ICON[row.kind]} size={14} />
      </span>

      <div className="ro-inbox__body">
        <p className="ro-inbox__title">{row.title}</p>
        <p className="ro-inbox__meta">
          {[row.author, `${row.chunks} chunk${row.chunks === 1 ? "" : "s"}`,
            row.chunks > 0 ? `${row.embedded} embedded` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {row.error ? <p className="ro-inbox__error">{row.error}</p> : null}
      </div>

      <StatusBadge tone={row.statusTone}>{row.statusLabel}</StatusBadge>
      <time className="ro-inbox__age">{row.age}</time>
    </article>
  );
}

export function InboxScreen({
  state,
  actions,
  message,
  ok,
}: {
  state: InboxState;
  actions: {
    paste: (formData: FormData) => Promise<void>;
    upload: (formData: FormData) => Promise<void>;
  };
  message: string | null;
  ok: boolean;
}) {
  return (
    <div className="ro-index">
      <h1 className="ro-index__title">Inbox</h1>
      <p className="ro-index__sub">
        {state.total} source{state.total === 1 ? "" : "s"} captured
        {state.pending > 0 ? `, ${state.pending} not fully ingested` : ", all ingested"}.
      </p>

      <CaptureForms
        pasteAction={actions.paste}
        uploadAction={actions.upload}
        message={message}
        ok={ok}
      />

      {state.groups.length === 0 ? (
        <Card padded={false}>
          <CardHeader label="Inbox" aside="0" />
          <EmptyState
            title="Nothing captured yet"
            body="Run the seed corpus, or add upload and paste capture."
          />
        </Card>
      ) : (
        state.groups.map((group) => (
          <Card key={group.label} padded={false}>
            <CardHeader label={group.label} aside={`${group.rows.length}`} />
            <div className="ro-inbox">
              {group.rows.map((row) => (
                <Row key={row.id} row={row} />
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
