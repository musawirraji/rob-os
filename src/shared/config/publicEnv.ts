import { z } from "zod";

/**
 * Browser-safe configuration. Every value here is inlined into the client
 * bundle, so nothing secret may live in this file.
 *
 * Parsing is defensive by design: a missing variable warns and falls back to an
 * empty string rather than throwing, so the shell still renders while the
 * project is being wired up. Consumers check `isSupabaseConfigured` before
 * assuming a value is usable.
 */
const publicEnvSchema = z.object({
  supabaseUrl: z.string().url().or(z.literal("")),
  supabaseAnonKey: z.string(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

// NEXT_PUBLIC_* must be referenced statically for Next to inline it.
const raw: PublicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

const parsed = publicEnvSchema.safeParse(raw);

if (!parsed.success) {
  console.warn(
    "[rob-os] Public env is incomplete — Supabase features are disabled.",
    parsed.error.flatten().fieldErrors,
  );
}

export const publicEnv: PublicEnv = parsed.success ? parsed.data : raw;

export const isSupabaseConfigured =
  publicEnv.supabaseUrl.length > 0 && publicEnv.supabaseAnonKey.length > 0;
