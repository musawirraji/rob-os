"use server";

import { redirect } from "next/navigation";

import { getServerSupabase } from "@shared/services/supabase/serverClient";
import { serverEnv } from "@shared/config/serverEnv";

/**
 * Two ways in, for two different situations.
 *
 * **Magic link** is the default for the workspace owner — nothing to remember and
 * no password to leak.
 *
 * **Password** exists because a magic link is worthless to someone who does not
 * control the mailbox it is sent to. Handing a reviewer a link addressed to
 * `rob@aisle3.io` gives them nothing. A password on a shared account is the only
 * way to grant access to an inbox you do not own.
 *
 * No password is ever *set* here. It is set by whoever owns the Supabase project;
 * this app only verifies one.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function backTo(next: string, message: string, ok: boolean): never {
  redirect(
    `/login?m=${encodeURIComponent(message)}&ok=${ok ? "1" : "0"}&next=${encodeURIComponent(next)}`,
  );
}

/** Same-origin only, so a crafted `next` cannot bounce a signed-in user offsite. */
function safePath(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function sendMagicLink(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = String(formData.get("next") ?? "/");

  if (!EMAIL.test(email)) {
    backTo(next, "That doesn't look like an email address.", false);
  }

  const supabase = await getServerSupabase();
  if (!supabase) {
    backTo(next, "Auth is not configured — set the Supabase environment variables.", false);
    return;
  }

  // Falls back to the local origin when APP_URL is unset, so dev needs no extra
  // configuration.
  const base = serverEnv.appUrl || "http://localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${base}/auth/callback?next=${encodeURIComponent(next)}`,
      // Phase 1 is a private tool: an unknown address must not silently create an
      // account.
      shouldCreateUser: false,
    },
  });

  if (error) {
    console.warn("[rob-os] magic link failed:", error.message);
    // Deliberately vague — confirming which addresses exist would leak the user
    // list to anyone who can reach the form.
    backTo(next, "Could not send a link to that address.", false);
  }

  backTo(next, "Check your email for a sign-in link.", true);
}

export async function signInWithPassword(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!EMAIL.test(email) || password.length === 0) {
    backTo(next, "Enter both an email address and a password.", false);
  }

  const supabase = await getServerSupabase();
  if (!supabase) {
    backTo(next, "Auth is not configured — set the Supabase environment variables.", false);
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.warn("[rob-os] password sign-in failed:", error.message);
    // One message for a wrong password and for an unknown address alike, so the
    // form cannot be used to work out who has an account.
    backTo(next, "Those details were not accepted.", false);
  }

  redirect(safePath(next));
}

export async function signOut(): Promise<void> {
  const supabase = await getServerSupabase();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}
