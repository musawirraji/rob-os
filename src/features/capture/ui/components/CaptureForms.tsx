import { Icon } from "@shared/components/Icon";
import { Card, CardHeader, SectionLabel } from "@shared/components/primitives";
import { SOURCE_KINDS, type SourceKind } from "@shared/interfaces/objects";

/**
 * The two capture paths. Plain forms posting to server actions — no client
 * JavaScript, so capture works before anything has hydrated.
 */
export function CaptureForms({
  pasteAction,
  uploadAction,
  message,
  ok,
}: {
  pasteAction: (formData: FormData) => Promise<void>;
  uploadAction: (formData: FormData) => Promise<void>;
  message: string | null;
  ok: boolean;
}) {
  return (
    <>
      {message ? (
        <p className={`ro-capture__flash${ok ? "" : " is-error"}`}>
          <Icon name={ok ? "fact" : "overdue"} size={13} />
          {message}
        </p>
      ) : null}

      <div className="ro-capture">
        <Card padded={false}>
          <CardHeader label="Paste" aside="Email, notes, a transcript" />
          <form className="ro-capture__form" action={pasteAction}>
            <div className="ro-capture__row">
              <input
                className="ro-capture__input"
                type="text"
                name="title"
                placeholder="Title (optional — the first line is used otherwise)"
              />
              <select className="ro-capture__select" name="kind" defaultValue="note">
                {SOURCE_KINDS.map((kind: SourceKind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              className="ro-capture__textarea"
              name="text"
              rows={7}
              required
              placeholder="Paste the email, the note, the transcript…"
            />
            <div className="ro-capture__actions">
              <button className="ro-btn ro-btn--primary" type="submit">
                <Icon name="capture" size={14} />
                Capture
              </button>
              <p className="ro-capture__note">
                Runs the full pipeline: chunk, embed, extract, resolve.
              </p>
            </div>
          </form>
        </Card>

        <Card padded={false}>
          <CardHeader label="Upload" aside="PDF, docx, eml, csv, txt" />
          <form className="ro-capture__form" action={uploadAction}>
            <input
              className="ro-capture__file"
              type="file"
              name="file"
              required
              accept=".pdf,.docx,.eml,.csv,.txt,.md,.json,.png,.jpg,.jpeg,.webp"
            />
            <div className="ro-capture__row">
              <select className="ro-capture__select" name="kind" defaultValue="upload">
                {SOURCE_KINDS.map((kind: SourceKind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
              <button className="ro-btn ro-btn--primary" type="submit">
                <Icon name="attachment" size={14} />
                Upload
              </button>
            </div>
            <SectionLabel>
              The original is stored before anything is parsed. Images are kept
              pending OCR.
            </SectionLabel>
          </form>
        </Card>
      </div>
    </>
  );
}
