import { APP_NAME } from "@shared/constants";

export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  "missing-code": "That link was incomplete. Ask for a new one.",
  expired: "That link has expired or was already used. Links are single-use.",
  unconfigured: "Auth is not configured on this deployment yet.",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  return (
    <main className="ro-login">
      <div className="ro-login__card">
        <h1 className="ro-login__title">Could not sign you in</h1>
        <p className="ro-login__sub">
          {REASONS[reason ?? ""] ?? "Something went wrong with that sign-in link."}
        </p>
        <p className="ro-login__form">
          <a className="ro-btn ro-btn--primary" href="/login">
            Back to sign in
          </a>
        </p>
        <p className="ro-login__note">{APP_NAME}</p>
      </div>
    </main>
  );
}
