import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { publicEnv } from "@shared/config/publicEnv";
import { isSupabaseAdminConfigured, serverEnv } from "@shared/config/serverEnv";
import type { Database } from "@shared/interfaces/db";

export type AdminClient = SupabaseClient<Database>;

let cached: AdminClient | null = null;

/**
 * Service-role Supabase client. Bypasses RLS, so it must only ever be reached
 * from server code — `server-only` enforces that at build time.
 *
 * Every table has RLS enabled with no public policy; this client is the single
 * authorised path to workspace data. Callers are responsible for scoping each
 * query to the requesting user's workspace.
 */
export function getAdminSupabase(): AdminClient | null {
  if (!isSupabaseAdminConfigured) {
    console.warn(
      "[rob-os] SUPABASE_SERVICE_ROLE_KEY is not set — admin client unavailable.",
    );
    return null;
  }

  cached ??= createClient<Database>(
    publicEnv.supabaseUrl,
    serverEnv.supabaseServiceRoleKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return cached;
}
