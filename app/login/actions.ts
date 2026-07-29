"use server";

import { redirect } from "next/navigation";

import { getServerSupabase } from "@shared/services/supabase/serverClient";
import { serverEnv } from "@shared/config/serverEnv";

/**
 * Magic-link sign-in. No passwords are handled anywhere in this app — the link is
 * emailed and exchanged for a session at /auth/callback.
 */
export async function sendMagicLink(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = String(formData.get("next") ?? "/");

  const fail = (message: string): never =>
    redirect(`/login?m=${encodeURIComponent(message)}&ok=0&next=${encodeURIComponent(next)}`);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail("That doesn't look like an email address.");
  }

  const supabase = await getServerSupabase();
  if (!supabase) {
    fail("Auth is not configured — set the Supabase environment variables.");
    return;
  }

  // Falls back to the request origin when APP_URL is unset, so local dev works
  // without extra configuration.
  const base = serverEnv.appUrl || "http://localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${base}/auth/callback?next=${encodeURIComponent(next)}`,
      // Phase 1 is a private tool: an unknown address should not silently create
      // an account.
      shouldCreateUser: false,
    },
  });

  if (error) {
    console.warn("[rob-os] magic link failed:", error.message);
    // Deliberately vague: confirming which addresses exist would leak the user
    // list to anyone who can reach the form.
    fail("Could not send a link to that address.");
  }

  redirect(
    `/login?m=${encodeURIComponent("Check your email for a sign-in link.")}&ok=1&next=${encodeURIComponent(next)}`,
  );
}

export async function signOut(): Promise<void> {
  const supabase = await getServerSupabase();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}
