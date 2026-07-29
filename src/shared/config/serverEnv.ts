import "server-only";

import { z } from "zod";

import { publicEnv } from "./publicEnv";

/**
 * Server-only secrets. `server-only` makes importing this from a Client
 * Component a build error, so these values can never reach the browser.
 *
 * Same defensive contract as the public env: a missing key warns and leaves the
 * corresponding capability flag false. Nothing here crashes the build.
 */
const serverEnvSchema = z.object({
  supabaseServiceRoleKey: z.string(),
  anthropicApiKey: z.string(),
  voyageApiKey: z.string(),
  /** Shared secret the `pg_cron` daily-brief job authenticates with. */
  cronSecret: z.string(),
  /** Where `pg_net` should POST the brief job. Empty disables scheduling. */
  appUrl: z.string(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

const raw: ServerEnv = {
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  voyageApiKey: process.env.VOYAGE_API_KEY ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  appUrl: process.env.APP_URL ?? "",
};

const parsed = serverEnvSchema.safeParse(raw);

if (!parsed.success) {
  console.warn(
    "[rob-os] Server env is incomplete.",
    parsed.error.flatten().fieldErrors,
  );
}

export const serverEnv: ServerEnv = parsed.success ? parsed.data : raw;

/** Service-role Supabase access — required for every write path. */
export const isSupabaseAdminConfigured =
  publicEnv.supabaseUrl.length > 0 && serverEnv.supabaseServiceRoleKey.length > 0;

/** Claude — extraction, living summaries, Ask synthesis. */
export const isClaudeConfigured = serverEnv.anthropicApiKey.length > 0;

/** Voyage — chunk embeddings for `match_chunks`. */
export const isVoyageConfigured = serverEnv.voyageApiKey.length > 0;

/** The scheduled daily-brief job. Both halves are required, or it stays off. */
export const isCronConfigured =
  serverEnv.cronSecret.length > 0 && serverEnv.appUrl.length > 0;

const missing = [
  isSupabaseAdminConfigured ? null : "SUPABASE_SERVICE_ROLE_KEY",
  isClaudeConfigured ? null : "ANTHROPIC_API_KEY",
  isVoyageConfigured ? null : "VOYAGE_API_KEY",
].filter((name): name is string => name !== null);

if (missing.length > 0) {
  console.warn(
    `[rob-os] Missing server secrets: ${missing.join(", ")}. ` +
      "Dependent services will no-op until they are set.",
  );
}
