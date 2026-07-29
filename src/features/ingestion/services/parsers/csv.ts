import type { ParsedFile } from "./index";

/**
 * CSV → readable prose.
 *
 * A raw CSV chunk retrieves badly: embeddings of comma-separated fragments are
 * noise, and a citation showing `Omnilux,omnilux.io,prospect,...` tells the user
 * nothing. So each row becomes a labelled block, which both embeds usefully and
 * reads as a real excerpt when cited.
 */

function parseRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

export type CsvTable = {
  headers: string[];
  rows: string[][];
};

export function readCsv(raw: string): CsvTable {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  const [headerLine, ...rest] = lines;
  if (!headerLine) return { headers: [], rows: [] };

  return {
    headers: parseRow(headerLine),
    rows: rest.map(parseRow),
  };
}

function humanise(header: string): string {
  return header.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function parseCsv(raw: string, filename: string): ParsedFile {
  const { headers, rows } = readCsv(raw);
  if (headers.length === 0) {
    return { text: "", title: null, author: null, participants: [], occurredAt: null };
  }

  // The first column is almost always the identifier — use it as the block title.
  const blocks = rows.map((row) => {
    const label = row[0] ?? "(unnamed)";
    const details = headers
      .slice(1)
      .map((header, i) => {
        const value = row[i + 1];
        if (value === undefined || value.length === 0) return null;
        return `${humanise(header)}: ${value}`;
      })
      .filter((line): line is string => line !== null);

    return [`${label}`, ...details].join("\n");
  });

  return {
    text: blocks.join("\n\n"),
    title: filename,
    author: null,
    participants: [],
    occurredAt: null,
  };
}
