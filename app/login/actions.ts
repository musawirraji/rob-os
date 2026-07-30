"use server";

import { redirect } from "next/navigation";

import { getServerSupabase } from "@shared/services/supabase/serverClient";

/**
 * One way in: email and password.
 *
 * Sign-in links were removed deliberately. They are worthless to anyone who does
 * not control the mailbox they arrive at — handing a reviewer a link addressed to
 * `rob@aisle3.io` gives them nothing — and the built-in Supabase mailer silently
 * drops messages past its hourly limit, so the failure looks exactly like a broken
 * login. A password works for whoever holds it, every time.
 *
 * No password is ever *set* here. It is set by whoever owns the Supabase project;
 * this app only verifies one. Admin-generated links still resolve at
 * `/auth/callback`, which is a separate path and unaffected.
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
