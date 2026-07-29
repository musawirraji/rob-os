import { NextResponse } from "next/server";

import { getServerSupabase } from "@shared/services/supabase/serverClient";

export const dynamic = "force-dynamic";

/**
 * Exchanges the magic-link code for a session cookie, then sends the user where
 * they were originally headed.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  // Only same-origin paths, so a crafted link cannot bounce a freshly
  // authenticated user off to somebody else's site.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!code) {
    return NextResponse.redirect(new URL("/auth/error?reason=missing-code", url.origin));
  }

  const supabase = await getServerSupabase();
  if (!supabase) {
    return NextResponse.redirect(new URL("/auth/error?reason=unconfigured", url.origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.warn("[rob-os] code exchange failed:", error.message);
    return NextResponse.redirect(new URL("/auth/error?reason=expired", url.origin));
  }

  return NextResponse.redirect(new URL(safeNext, url.origin));
}
