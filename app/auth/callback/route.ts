import { NextResponse } from "next/server";

import { getServerSupabase } from "@shared/services/supabase/serverClient";

export const dynamic = "force-dynamic";

/**
 * Turns a sign-in link into a session cookie, then sends the user where they were
 * originally headed.
 *
 * Two link shapes arrive here and they are not interchangeable:
 *
 * - **`?code=`** — the PKCE flow, used when the app itself asked for the link. The
 *   verifier lives in a cookie set when the request was made, so the link only
 *   works in the browser that started it.
 * - **`?token_hash=&type=`** — the non-PKCE flow, used by links generated with the
 *   admin API or the dashboard. No verifier is involved, so these work in any
 *   browser. That is what makes them usable for granting access to someone whose
 *   mailbox you do not control, and also why they must stay short-lived.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next") ?? "/";

  // Same-origin only, so a crafted link cannot bounce a freshly authenticated user
  // off to somebody else's site.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const supabase = await getServerSupabase();
  if (!supabase) {
    return NextResponse.redirect(new URL("/auth/error?reason=unconfigured", url.origin));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.warn("[rob-os] code exchange failed:", error.message);
      return NextResponse.redirect(new URL("/auth/error?reason=expired", url.origin));
    }
    return NextResponse.redirect(new URL(safeNext, url.origin));
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "magiclink" | "email" | "recovery" | "invite" | "signup",
    });
    if (error) {
      console.warn("[rob-os] token verification failed:", error.message);
      return NextResponse.redirect(new URL("/auth/error?reason=expired", url.origin));
    }
    return NextResponse.redirect(new URL(safeNext, url.origin));
  }

  return NextResponse.redirect(new URL("/auth/error?reason=missing-code", url.origin));
}
