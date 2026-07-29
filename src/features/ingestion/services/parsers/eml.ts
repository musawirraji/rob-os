import type { ParsedFile } from "./index";

/**
 * Minimal RFC 822 reader: headers, then a blank line, then the body. Enough for
 * the plain-text exports Phase 1 ingests. Multipart and MIME decoding arrive
 * with the live Gmail connector, which is a later phase — this parser
 * deliberately does not pretend to handle them.
 */

function splitAddresses(value: string): string[] {
  // Commas inside a quoted display name are not separators.
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of value) {
    if (char === '"') inQuotes = !inQuotes;
    if (char === "," && !inQuotes) {
      out.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out.filter((entry) => entry.length > 0);
}

export function parseEml(raw: string): ParsedFile {
  const normalised = raw.replace(/\r\n/g, "\n");
  const separator = normalised.indexOf("\n\n");
  const headerBlock = separator >= 0 ? normalised.slice(0, separator) : normalised;
  const body = separator >= 0 ? normalised.slice(separator + 2) : "";

  // Unfold continuation lines before parsing.
  const unfolded = headerBlock.replace(/\n[ \t]+/g, " ");
  const headers = new Map<string, string>();

  for (const line of unfolded.split("\n")) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (!headers.has(name)) headers.set(name, value);
  }

  const from = headers.get("from") ?? null;
  const participants = [
    ...(from ? [from] : []),
    ...splitAddresses(headers.get("to") ?? ""),
    ...splitAddresses(headers.get("cc") ?? ""),
  ];

  const rawDate = headers.get("date");
  let occurredAt: string | null = null;
  if (rawDate) {
    const parsed = new Date(rawDate);
    if (!Number.isNaN(parsed.getTime())) occurredAt = parsed.toISOString();
  }

  // The From/To/Subject lines stay at the top of the text. They are part of what
  // the source says — "who was on this thread" is frequently the answer — and a
  // citation that omits them reads as though it came from nowhere.
  const preamble = [
    from ? `From: ${from}` : null,
    headers.get("to") ? `To: ${headers.get("to")}` : null,
    headers.get("cc") ? `Cc: ${headers.get("cc")}` : null,
    headers.get("subject") ? `Subject: ${headers.get("subject")}` : null,
    rawDate ? `Date: ${rawDate}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const text = [preamble, body.trim()].filter((part) => part.length > 0).join("\n\n");

  return {
    text,
    title: headers.get("subject") ?? null,
    author: from,
    participants,
    occurredAt,
  };
}
