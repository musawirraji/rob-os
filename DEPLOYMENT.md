# Deploying Rob OS

Everything so far runs against a **local** Supabase stack — Docker containers on one
machine. That is why a Vercel deployment cannot use it: `127.0.0.1:54422` means "the
machine running this code", which on Vercel is Vercel's server, not your laptop.

Going live means one thing: **a hosted Supabase project**. The app code does not change.

---

## 1. Create the hosted project

In the Supabase dashboard, create a project and note the region. The free tier is
enough for a demo — this corpus is 15 sources.

Then push the schema from this repo:

```bash
supabase link --project-ref <your-project-ref>
```

```bash
supabase db push
```

That replays all nine migrations, which brings the whole schema, RLS, the
`match_chunks` RPC, the `sources` storage bucket, and the `pg_cron` job with it.
Nothing is configured by hand in the dashboard.

**Two extensions need to be available:** `pgvector` (on by default) and `pg_cron` +
`pg_net` for the scheduled brief. If `db push` fails on those, enable them under
Database → Extensions and re-run.

## 2. Environment variables in Vercel

From Settings → API in Supabase:

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key — **server only**, never expose |
| `ANTHROPIC_API_KEY` | your Anthropic key |
| `VOYAGE_API_KEY` | your Voyage key |
| `APP_URL` | `https://your-app.vercel.app` |
| `CRON_SECRET` | any long random string you generate |

`APP_URL` is the origin the app considers itself to live at, and what any
admin-generated sign-in link is pointed back at. Get it wrong and those links
resolve against the wrong host.

## 3. Auth redirect URLs

Supabase compares redirect hosts **exactly**, so the Vercel domain has to be listed or
admin-generated sign-in links silently fall back to `site_url`. In
Authentication → URL Configuration:

- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: `https://your-app.vercel.app/**`

Add the preview domain too if you want sign-in to work on preview deployments.

## 4. Email

**Sign-in does not send email.** The login form is email and password only, so the
Supabase mailer is not on the critical path and its rate limit cannot break a
sign-in. This was a deliberate removal: the built-in service returns success and
quietly sends nothing once past its hourly limit, which is indistinguishable from a
broken login — and a link is worthless to a reviewer who does not own the mailbox.

Email is still needed if you later add password reset or invitations. At that point
add custom SMTP under Authentication → Emails; Resend or Postmark take five minutes.

## 5. Load the corpus

The seed script reads the same env vars, so point it at the hosted project and run it
locally once:

```bash
npm run seed:ingest
```

With `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` set this is the real thing: Claude
extraction, Voyage embeddings, living summaries. Expect it to take a few minutes for
15 sources and to cost a few cents.

Then confirm the grounding contract actually holds against live models:

```bash
npm run ask:test
```

Part C of that suite is the §8 acceptance test — the five out-of-corpus questions must
abstain. **Do not demo before that passes.**

## 6. Arm the scheduled brief

The `pg_cron` job calls back into the app, so it needs to know where the app is. In the
SQL editor:

```sql
insert into public.cron_config (id, app_url, cron_secret)
values (true, 'https://your-app.vercel.app', '<the same CRON_SECRET>')
on conflict (id) do update
  set app_url = excluded.app_url, cron_secret = excluded.cron_secret;
```

Check it fires:

```sql
select jobname, schedule, active from cron.job;
```

Until this row exists the job logs a notice and stops — the brief still regenerates
whenever Today is opened, so nothing breaks, it just is not pre-warmed.

---

## Giving a reviewer access

The form only ever *verifies* a password — there is no sign-up path — so it
**cannot create accounts**. Only people you add can get in, and a wrong password and
an unknown address return the same deliberately vague message, so the form cannot be
used to work out who has an account.

### Giving out access

**1. A password on the demo account — recommended.**

This is the whole reason sign-in is password-based: access can be granted to a
mailbox you do not own. You set the password; the app only verifies one.

Authentication → Users → `rob@aisle3.io` → **Reset password** (or Add user with a
password). Then send the reviewer the address and password. They sign in whenever they
like, as many times as they like, and see the full seeded corpus because they are
signing in *as the workspace owner*.

Use a throwaway password and rotate it after the review.

**2. A one-off link you generate yourself.** Still supported — `/auth/callback`
handles admin-generated links even though the login form no longer requests any.

Authentication → Users → the user → **Generate link**, or:

```bash
curl -X POST "$SUPABASE_URL/auth/v1/admin/generate_link" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "content-type: application/json" \
  -d '{"type":"magiclink","email":"rob@aisle3.io","redirect_to":"https://your-app.vercel.app/auth/callback"}'
```

Paste the returned link to the reviewer. `/auth/callback` handles this shape
(`token_hash`) as well as the app's own PKCE links, and because there is no code
verifier involved it works in **any** browser — which is what makes it useful here, and
also why it is single-use and expires within the hour. Good for a scheduled walkthrough,
not for "have a look whenever".

**3. Their own account.** Add their email as a user and they get their own link. But see
the workspace note below — on its own this shows them an empty app.

### If the reviewer signs in as themselves

**A user with no workspace sees empty screens.** A workspace row is tied to one `owner_user_id`, so a second user is not
looking at the seeded corpus — they are looking at nothing. Two options:

- **Simplest for review:** repoint the existing workspace at their user id after they
  first sign in. They see the full Aisle3 corpus. You lose your own access until you
  point it back, so this suits a scheduled walkthrough.

  ```sql
  update public.workspace
  set owner_user_id = (select id from auth.users where email = 'reviewer@example.com');
  ```

- **Proper fix:** a `workspace_member` join table so several users share one workspace.
  That is the multi-user work the schema was already shaped for — every table carries
  `workspace_id` — but it is out of Phase 1 scope.

---

## What is not ready for a public URL

Worth being straight about before sharing a link:

- **Everything runs as `service_role` in server code.** That is correct for Phase 1
  (RLS denies all, the browser never touches the database) but it means server-side
  authorisation is doing all the work. Any new query must scope by `workspace_id`
  itself — there is no policy backstop yet.
- **No rate limiting** on the Ask endpoint. Each question costs a Claude call.
- **OCR is not wired.** Uploaded images are stored and flagged, not read.
- **The Ask answered-state has never been rendered with real content**, because no
  Anthropic key has been available during the build. It is the first thing to look at
  once keys are in.
