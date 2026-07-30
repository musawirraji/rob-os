import { BusyFields } from "@shared/components/BusyFields";
import { Icon } from "@shared/components/Icon";
import { SubmitButton } from "@shared/components/SubmitButton";
import { APP_NAME } from "@shared/constants";

import { signInWithPassword, type LoginError } from "./actions";

export const dynamic = "force-dynamic";

/**
 * The only messages this screen can show.
 *
 * The copy lives here rather than travelling in the URL, so a crafted link cannot
 * put arbitrary words above a real password field — and a message from a removed
 * feature cannot keep appearing because it is still sitting in someone's address
 * bar. An unrecognised code shows nothing at all.
 */
const ERRORS: Record<LoginError, string> = {
  invalid: "Enter both an email address and a password.",
  rejected: "Those details were not accepted.",
  unconfigured: "Auth is not configured — set the Supabase environment variables.",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; next?: string }>;
}) {
  const { e, next } = await searchParams;
  const message = e && e in ERRORS ? ERRORS[e as LoginError] : null;

  return (
    <main className="ro-login">
      <div className="ro-login__card">
        <span className="ro-login__mark">
          <Icon name="ask" size={16} />
        </span>
        <h1 className="ro-login__title">{APP_NAME}</h1>
        <p className="ro-login__sub">A private operating system for your work.</p>

        {/* Email and password only. Sign-in links were removed: they are useless
            to a reviewer who does not control the mailbox they arrive at, and
            keeping a second route that mostly fails is worse than not offering it.
            Admin-generated links still resolve at /auth/callback. */}
        <form action={signInWithPassword}>
          <BusyFields className="ro-login__form">
            <input type="hidden" name="next" value={next ?? "/"} />

            <input
              className="ro-login__input"
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
            />

            <input
              className="ro-login__input"
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="Password"
            />

            <SubmitButton busyLabel="Checking…">Sign in</SubmitButton>
          </BusyFields>
        </form>

        {message ? <p className="ro-login__flash is-error">{message}</p> : null}

        <p className="ro-login__note">
          Accounts are not created here. If you have not been added to a workspace,
          this form will not let you in.
        </p>
      </div>
    </main>
  );
}
