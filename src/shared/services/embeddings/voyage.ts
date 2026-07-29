import "server-only";

import { isVoyageConfigured, serverEnv } from "@shared/config/serverEnv";

/**
 * Voyage-3 produces 1024-dimension vectors, which is what `chunk.embedding` is
 * declared as. Changing the model means changing the column and re-embedding
 * the whole corpus, so this constant is deliberately not configurable per call.
 */
export const VOYAGE_MODEL = "voyage-3" as const;
export const EMBEDDING_DIMENSIONS = 1024 as const;

const VOYAGE_ENDPOINT = "https://api.voyageai.com/v1/embeddings";

/**
 * Retrieval is asymmetric: stored chunks and the question that searches for
 * them are embedded with different input types.
 */
export type EmbeddingInputType = "document" | "query";

type VoyageResponse = {
  data?: { embedding: number[]; index: number }[];
};

/**
 * Embeds a batch of texts. Returns `null` when Voyage is unconfigured or the
 * request fails — callers treat that as "this source could not be embedded yet"
 * and leave it for a retry rather than writing a partial record.
 */
export async function embed(
  texts: string[],
  inputType: EmbeddingInputType,
): Promise<number[][] | null> {
  if (!isVoyageConfigured) {
    console.warn("[rob-os] VOYAGE_API_KEY is not set — embedding skipped.");
    return null;
  }

  if (texts.length === 0) return [];

  try {
    const response = await fetch(VOYAGE_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${serverEnv.voyageApiKey}`,
      },
      body: JSON.stringify({
        model: VOYAGE_MODEL,
        input: texts,
        input_type: inputType,
      }),
    });

    if (!response.ok) {
      console.warn(
        `[rob-os] Voyage returned ${response.status}: ${await response.text()}`,
      );
      return null;
    }

    const payload = (await response.json()) as VoyageResponse;
    const data = payload.data;

    if (!data || data.length !== texts.length) {
      console.warn("[rob-os] Voyage returned an unexpected number of embeddings.");
      return null;
    }

    // Voyage does not guarantee response ordering; re-sort by the input index.
    return [...data]
      .sort((a, b) => a.index - b.index)
      .map((entry) => entry.embedding);
  } catch (error) {
    console.warn("[rob-os] Could not reach Voyage:", error);
    return null;
  }
}

/** Convenience wrapper for the single-text query path used by Ask. */
export async function embedQuery(text: string): Promise<number[] | null> {
  const result = await embed([text], "query");
  return result?.[0] ?? null;
}
