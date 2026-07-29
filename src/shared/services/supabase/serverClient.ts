import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isSupabaseConfigured, publicEnv } from "@shared/config/publicEnv";

/**
 * Request-scoped Supabase client bound to the signed-in user's cookies.
 * Anon key, so RLS applies — this is the client used to answer "who is asking",
 * never to read workspace data. Data access goes through `adminClient`.
 *
 * Not cached: `cookies()` is per-request.
 */
export async function getServerSupabase(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured) {
    console.warn("[rob-os] Supabase is not configured — server client unavailable.");
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. Session refresh happens in
          // route handlers and server actions, so this is safe to ignore.
        }
      },
    },
  });
}
