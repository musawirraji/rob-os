import type { SourceKind } from "@shared/interfaces/objects";

import { parseCsv } from "./csv";
import { parseEml } from "./eml";

export type RawFile = {
  filename: string;
  content: string;
  kind: SourceKind;
};

export type ParsedFile = {
  /** Clean text, ready to chunk. */
  text: string;
  /** Recovered from the file itself; the manifest wins if it disagrees. */
  title: string | null;
  author: string | null;
  participants: string[];
  occurredAt: string | null;
};

/**
 * Turns a raw file into plain text. Markdown and text pass through unchanged —
 * the original formatting is what a human would quote, so flattening it would
 * make citations read worse.
 */
export function parseFile(file: RawFile): ParsedFile {
  const extension = file.filename.slice(file.filename.lastIndexOf(".")).toLowerCase();

  if (extension === ".eml") return parseEml(file.content);
  if (extension === ".csv") return parseCsv(file.content, file.filename);

  // Markdown: lift the first H1 as a title, keep the body as-is.
  const headingMatch = file.content.match(/^#\s+(.+)$/m);
  return {
    text: file.content.trim(),
    title: headingMatch?.[1]?.trim() ?? null,
    author: null,
    participants: [],
    occurredAt: null,
  };
}

export { parseEml } from "./eml";
export { parseCsv } from "./csv";
