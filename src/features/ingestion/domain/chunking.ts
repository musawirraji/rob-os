import { CHUNK_OVERLAP_TOKENS, CHUNK_TARGET_TOKENS } from "@shared/constants";

import type { PendingChunk } from "./types";

/**
 * Chunking, pure. No I/O, no model — deterministic so the same source always
 * produces the same spans and re-ingesting is genuinely idempotent.
 *
 * Splits on paragraph boundaries rather than a fixed character window: a
 * citation that lands mid-sentence is worse than a slightly uneven chunk, and
 * every chunk here becomes a quotable source in the UI.
 */

/**
 * Rough token estimate. Deliberately not a real tokenizer — this only sizes
 * chunks, and being 10% out costs nothing. Voyage counts the real tokens.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function splitIntoBlocks(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

/**
 * A single paragraph longer than the target — a transcript monologue, a wall of
 * CSV — is split on sentence boundaries so the chunk still ends somewhere a
 * human would quote from.
 */
function splitOversizedBlock(block: string, targetTokens: number): string[] {
  if (estimateTokens(block) <= targetTokens) return [block];

  const sentences = block.match(/[^.!?\n]+[.!?]*\s*/g) ?? [block];
  const out: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current && estimateTokens(current + sentence) > targetTokens) {
      out.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }

  if (current.trim()) out.push(current.trim());
  return out;
}

export type ChunkOptions = {
  targetTokens?: number;
  overlapTokens?: number;
};

export function chunkText(text: string, options: ChunkOptions = {}): PendingChunk[] {
  const targetTokens = options.targetTokens ?? CHUNK_TARGET_TOKENS;
  const overlapTokens = options.overlapTokens ?? CHUNK_OVERLAP_TOKENS;

  const normalised = text.replace(/\r\n/g, "\n").trim();
  if (normalised.length === 0) return [];

  const blocks = splitIntoBlocks(normalised).flatMap((block) =>
    splitOversizedBlock(block, targetTokens),
  );

  const chunks: PendingChunk[] = [];
  let buffer: string[] = [];
  let bufferTokens = 0;
  let tokenCursor = 0;

  const flush = () => {
    if (buffer.length === 0) return;

    const content = buffer.join("\n\n");
    const tokens = estimateTokens(content);
    chunks.push({
      index: chunks.length,
      content,
      tokenStart: tokenCursor,
      tokenEnd: tokenCursor + tokens,
    });

    // Carry the tail of this chunk into the next one so a claim that straddles
    // a boundary is still retrievable whole from at least one chunk.
    const overlap: string[] = [];
    let overlapSoFar = 0;
    for (let i = buffer.length - 1; i >= 0; i -= 1) {
      const block = buffer[i];
      if (block === undefined) continue;
      const blockTokens = estimateTokens(block);
      if (overlapSoFar + blockTokens > overlapTokens) break;
      overlap.unshift(block);
      overlapSoFar += blockTokens;
    }

    tokenCursor += tokens - overlapSoFar;
    buffer = overlap;
    bufferTokens = overlapSoFar;
  };

  for (const block of blocks) {
    const blockTokens = estimateTokens(block);
    if (bufferTokens > 0 && bufferTokens + blockTokens > targetTokens) {
      flush();
    }
    buffer.push(block);
    bufferTokens += blockTokens;
  }

  // The final flush must not leave an overlap-only chunk behind.
  if (buffer.length > 0) {
    const content = buffer.join("\n\n");
    const tokens = estimateTokens(content);
    const isDuplicateTail =
      chunks.length > 0 && chunks[chunks.length - 1]?.content.endsWith(content);

    if (!isDuplicateTail) {
      chunks.push({
        index: chunks.length,
        content,
        tokenStart: tokenCursor,
        tokenEnd: tokenCursor + tokens,
      });
    }
  }

  return chunks;
}
