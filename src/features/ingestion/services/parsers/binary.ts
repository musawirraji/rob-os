import "server-only";

/**
 * Text extraction from binary formats (brief §7 step 2).
 *
 * These are dynamically imported so a PDF library is only loaded when a PDF is
 * actually ingested — it keeps the server bundle small and means a broken
 * dependency degrades one source rather than the whole app.
 *
 * Every function returns `null` plus a reason rather than throwing. A source we
 * cannot read must land in the Inbox saying *why*, not vanish.
 */

export type ExtractionResult = {
  text: string | null;
  /** Set when extraction failed or was not possible. Surfaced in the Inbox. */
  reason: string | null;
  /** Metadata worth keeping on the source row. */
  meta: Record<string, unknown>;
};

export async function extractPdf(bytes: Uint8Array): Promise<ExtractionResult> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text, totalPages } = await extractText(pdf, { mergePages: true });

    const trimmed = typeof text === "string" ? text.trim() : "";

    if (trimmed.length === 0) {
      // A PDF with no text layer is a scan. That is a real, common case and it
      // needs OCR — saying so is more useful than an empty source.
      return {
        text: null,
        reason: `PDF has no text layer (${totalPages} page(s)) — this is a scan and needs OCR`,
        meta: { pages: totalPages, scanned: true },
      };
    }

    return { text: trimmed, reason: null, meta: { pages: totalPages } };
  } catch (error) {
    return {
      text: null,
      reason: `could not read the PDF: ${error instanceof Error ? error.message : String(error)}`,
      meta: {},
    };
  }
}

export async function extractDocx(bytes: Uint8Array): Promise<ExtractionResult> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(bytes),
    });

    const trimmed = result.value.trim();
    if (trimmed.length === 0) {
      return { text: null, reason: "the document contained no text", meta: {} };
    }

    return {
      text: trimmed,
      reason: null,
      // Mammoth reports things it could not convert. Worth keeping: it explains
      // why a citation might read oddly.
      meta: result.messages.length > 0
        ? { conversionNotes: result.messages.map((message) => message.message) }
        : {},
    };
  } catch (error) {
    return {
      text: null,
      reason: `could not read the document: ${error instanceof Error ? error.message : String(error)}`,
      meta: {},
    };
  }
}

/**
 * OCR for images.
 *
 * Deliberately not implemented with a bundled engine. Tesseract-in-Node needs
 * ~10MB of language data fetched at runtime and is slow enough to time out a
 * request, and a wrong transcription is worse here than no transcription: an OCR
 * error becomes a *cited* claim the user is invited to trust.
 *
 * So this is a seam. An image is stored, marked as needing OCR, and shows in the
 * Inbox with that reason — visible and resumable rather than silently empty.
 */
export async function extractImage(): Promise<ExtractionResult> {
  return {
    text: null,
    reason: "OCR is not configured — the image is stored but not yet readable",
    meta: { needsOcr: true },
  };
}

/** Maps a file extension or MIME type onto an extractor. */
export function extractorFor(
  filename: string,
  mimeType: string | null,
): ((bytes: Uint8Array) => Promise<ExtractionResult>) | "text" | null {
  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  const mime = mimeType?.toLowerCase() ?? "";

  if (extension === ".pdf" || mime === "application/pdf") return extractPdf;

  if (
    extension === ".docx" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return extractDocx;
  }

  if (mime.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp", ".gif", ".tiff"].includes(extension)) {
    return extractImage;
  }

  // Everything else is handled by the plain-text parsers (.eml, .csv, .md, .txt).
  if (
    [".eml", ".csv", ".md", ".txt", ".markdown", ".json", ".vtt"].includes(extension) ||
    mime.startsWith("text/")
  ) {
    return "text";
  }

  return null;
}
