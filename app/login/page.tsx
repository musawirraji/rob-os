import { Icon } from "@shared/components/Icon";
import { APP_NAME } from "@shared/constants";

import { sendMagicLink } from "./actions";

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
        <p className="ro-login__sub">
          A private operating system for your work. Sign in with a link — there is
          no password to remember or leak.
        </p>

        <form className="ro-login__form" action={sendMagicLink}>
          <input type="hidden" name="next" value={next ?? "/"} />
          <input
            className="ro-login__input"
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
          />
          <button className="ro-btn ro-btn--primary" type="submit">
            <Icon name="send" size={14} />
            Email me a link
          </button>
        </form>

        {m ? (
          <p className={`ro-login__flash${ok === "0" ? " is-error" : ""}`}>{m}</p>
        ) : null}

        <p className="ro-login__note">
          Accounts are not created from this form. If you have not been added to a
          workspace yet, the link will not arrive.
        </p>
      </div>
    </main>
  );
}
