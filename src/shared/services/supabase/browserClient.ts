"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isSupabaseConfigured, publicEnv } from "@shared/config/publicEnv";

let cached: SupabaseClient | null = null;

/**
 * Browser Supabase client — anon key, RLS enforced, session in cookies.
 * Used for auth only; all data access happens server-side via the service role.
 *
 * Returns `null` when Supabase is unconfigured rather than throwing, so the
 * shell renders during setup.
 */
export function getBrowserSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) {
    console.warn("[rob-os] Supabase is not configured — browser client unavailable.");
    return null;
  }

  cached ??= createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
  return cached;
}
