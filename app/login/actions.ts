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

/**
 * Failures travel back as a short code, never as prose.
 *
 * The earlier version put the message itself in the query string, which meant the
 * sign-in page rendered whatever text the URL carried. That let a crafted link show
 * an arbitrary message above a real password field — and it kept displaying copy
 * from a removed feature long after the code that produced it was gone. A code the
 * page has to recognise can only ever say one of the things below.
 */
export type LoginError = "invalid" | "rejected" | "unconfigured";

function backTo(next: string, error: LoginError): never {
  redirect(`/login?e=${error}&next=${encodeURIComponent(next)}`);
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
    backTo(next, "invalid");
  }

  const supabase = await getServerSupabase();
  if (!supabase) {
    backTo(next, "unconfigured");
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.warn("[rob-os] password sign-in failed:", error.message);
    // One code for a wrong password and for an unknown address alike, so the form
    // cannot be used to work out who has an account.
    backTo(next, "rejected");
  }

  redirect(safePath(next));
}

export async function signOut(): Promise<void> {
  const supabase = await getServerSupabase();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}
