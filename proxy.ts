import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Route protection. In Next 16 this file is `proxy.ts`, not `middleware.ts`, and
 * the exported function is `proxy`.
 *
 * Two jobs:
 *
 * 1. **Refresh the session.** Supabase access tokens are short-lived; refreshing
 *    here means a Server Component never renders against an expired token.
 * 2. **Fail closed.** Anything not explicitly public redirects to /login. A new
 *    route is protected by default — the failure mode of a deny-list is a screen
 *    someone forgot to add to it.
 */

const PUBLIC_PREFIXES = ["/login", "/auth/callback", "/auth/error"];

export async function proxy(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  // Unconfigured Supabase must not lock the app behind a login that cannot work.
  // The screens already show a "no workspace" state, which is the honest answer.
  if (url.length === 0 || anonKey.length === 0) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Supabase asks for no-store on any response that sets auth cookies, so a
        // CDN cannot hand one user's session to another.
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));

  if (!user && !isPublic) {
    const redirectTo = request.nextUrl.clone();
    redirectTo.pathname = "/login";
    // Come back to where they were trying to go.
    redirectTo.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(redirectTo);
  }

  // Already signed in: no reason to show the login screen.
  if (user && path.startsWith("/login")) {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return response;
}

export const config = {
  // Skip static assets and the cron endpoint, which authenticates with its own
  // bearer token rather than a session.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
