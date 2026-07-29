import { Icon } from "@shared/components/Icon";
import { APP_NAME } from "@shared/constants";

import { sendMagicLink, signInWithPassword } from "./actions";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; ok?: string; next?: string }>;
}) {
  const { m, ok, next } = await searchParams;

  return (
    <main className="ro-login">
      <div className="ro-login__card">
        <span className="ro-login__mark">
          <Icon name="ask" size={16} />
        </span>
        <h1 className="ro-login__title">{APP_NAME}</h1>
        <p className="ro-login__sub">A private operating system for your work.</p>

        {/* One form, two submit buttons. A magic link suits the owner; a password
            is the only thing that works for someone who does not have access to
            the mailbox the link would go to. */}
        <form className="ro-login__form">
          <input type="hidden" name="next" value={next ?? "/"} />

          <input
            className="ro-login__input"
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
          />

          <button
            className="ro-btn ro-btn--primary"
            type="submit"
            formAction={sendMagicLink}
          >
            <Icon name="send" size={14} />
            Email me a sign-in link
          </button>

          <p className="ro-login__divider">
            <span>or sign in with a password</span>
          </p>

          <input
            className="ro-login__input"
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="Password"
          />

          <button
            className="ro-btn ro-btn--secondary"
            type="submit"
            formAction={signInWithPassword}
          >
            Sign in
          </button>
        </form>

        {m ? (
          <p className={`ro-login__flash${ok === "0" ? " is-error" : ""}`}>{m}</p>
        ) : null}

        <p className="ro-login__note">
          Accounts are not created here. If you have not been added to a workspace,
          neither route will let you in.
        </p>
      </div>
    </main>
  );
}
