import { BusyFields } from "@shared/components/BusyFields";
import { Icon } from "@shared/components/Icon";
import { SubmitButton } from "@shared/components/SubmitButton";
import { Card, CardHeader } from "@shared/components/primitives";
import { SOURCE_KINDS, type SourceKind } from "@shared/interfaces/objects";

/**
 * The two capture paths. Plain forms posting to server actions — no client
 * JavaScript required, so capture still works before anything has hydrated.
 *
 * These two get a spelled-out busy label rather than just a spinner, because
 * submitting here kicks off the whole pipeline — chunk, embed, extract, resolve —
 * and that is comfortably long enough for a silent button to read as a failed
 * click. Re-submitting midway through would ingest the same source twice.
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
          <form action={pasteAction}>
            <BusyFields className="ro-capture__form">
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
                <SubmitButton icon="capture" busyLabel="Running the pipeline…">
                  Capture
                </SubmitButton>
                <p className="ro-capture__note">
                  Runs the full pipeline: chunk, embed, extract, resolve.
                </p>
              </div>
            </BusyFields>
          </form>
        </Card>

        <Card padded={false}>
          <CardHeader label="Upload" aside="PDF, docx, eml, csv, txt" />
          <form action={uploadAction}>
            <BusyFields className="ro-capture__form">
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
                <SubmitButton icon="attachment" busyLabel="Storing…">
                  Upload
                </SubmitButton>
              </div>
              {/* A sentence, so it gets body treatment — the eyebrow style is for
                  labels, and using it here shouts a caption. */}
              <p className="ro-capture__note">
                The original is stored before anything is parsed. Images are kept
                pending OCR.
              </p>
            </BusyFields>
          </form>
        </Card>
      </div>
    </>
  );
}
