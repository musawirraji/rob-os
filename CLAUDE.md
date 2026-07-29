@AGENTS.md

# Rob OS

Inherits my global CLAUDE.md (feature-sliced architecture, SCSS-only + tokens,
Next.js App Router + TS strict, Supabase with RLS, latest Claude models). This
file only adds what is specific to Rob OS. Do not restate the global rules.

The visual reference is `robos-v2.html`. Every screen, colour, spacing, radius,
icon and component must match it. Do not invent an aesthetic.

## 1. What we are building

Rob OS is a private, AI-native personal operating system. It ingests a founder's
work sources (email, calendar, meeting notes, documents, CRM), turns them into a
structured model of people, companies, projects, meetings, decisions, tasks and
commitments, and lets the user ask questions answered only from their real data,
with a citation on every claim.

The one non-negotiable thesis (this is the product):

- Every answer links to the source it came from.
- Every stored conclusion is labelled `fact` vs `inference` and carries a confidence.
- When there is no supporting source, the system says so and refuses to guess.
  A confident wrong answer is the failure mode we are engineering against.

This generalises a grounded-RAG engine already shipped (VoxAnima): Voyage-3
embeddings, pgvector, a `match_chunks` RPC, Claude for extraction and synthesis,
adversarial grounding, hard-stop on fabrication.

## 2. Phase 1 scope — the spine

A thin but actually working slice that proves the thesis end to end.

In scope:

- Auth (Supabase Auth), single workspace, RLS on every table.
- Object model + schema: sources, chunks, people, companies, projects, meetings,
  tasks, decisions, commitments.
- Ingestion of sample sources (seed corpus + upload + paste): emails (.eml/text),
  a Granola-style transcript, a doc/deck. Extract → chunk → Voyage embed →
  Claude extraction → entity resolution → store with provenance + confidence.
- Review Queue for low-confidence items (approve / reject / correct in one
  action; the correction improves future filing).
- Grounded Ask Rob OS: hybrid retrieval (full-text + vector via `match_chunks`) →
  Claude synthesis with inline citations, `fact`/`inference` labels, abstain path.
- Today / Daily Brief: commitments due, waiting-on, projects at risk, meetings,
  one observation — generated from the model, each line linking to its source.
- Object pages: Person, Company, Project — always-visible left detail panel,
  tabs, a living summary, a source-cited activity feed.
- Command palette (⌘K) returning real objects grouped by type.

Out of scope (design for, don't build): live Gmail/Calendar/Granola/Slack/CRM
sync, outbound actions, weekly review, personal-life domains, native mobile,
knowledge-graph viz, multi-user. Leave clean seams (a `services/` connector
interface per source) so these drop in later.

## 3. Stack (adds to the global file)

- Responsive PWA; desktop-first exploration, mobile-first capture.
- Supabase for everything server-side: Postgres + pgvector, Auth, RLS on every
  table (no public policy; all access via service role in server code), Storage,
  `pg_cron` (daily brief), server actions for ingestion jobs.
- Embeddings: Voyage-3 (1024-dim), retrieval via a `match_chunks` RPC.
- Generation: Claude with model routing — `fast` (`claude-haiku-4-5`) for
  classify/extract/resolve, `strong` (`claude-opus-5`) for living summaries and
  Ask synthesis. Never one giant prompt. Deterministic code for trivial
  extraction (dates, emails). See `src/shared/services/llm/models.ts`.
- Icons: HugeIcons via `src/shared/components/Icon.tsx`. No other icon set, no
  emoji, and no feature imports HugeIcons directly.
- Env: zod-validated, defensive — a missing var warns and falls back, it does not
  crash the build. Server secrets are never read in the browser (`server-only`).

## 4. Layout

```
src/
  features/
    capture/       # quick capture + upload + inbox intake
    ingestion/     # extract → chunk → embed → extract entities → resolve (server)
    ask/           # grounded Q&A: retrieval + synthesis contract
    today/         # daily brief
    people/ companies/ projects/ meetings/   # object features
    review/        # review queue
    search/        # command palette
  shared/
    design/_tokens.scss   # tokens pulled from robos-v2.html
    interfaces/ domain/ components/ hooks/ state/ services/ navigation/ config/
    services/
      llm/         # claude client + model routing
      embeddings/  # voyage client
      supabase/    # browser / server (user, RLS) / admin (service role)
app/**             # thin route shells rendering one feature screen
```

UI is pure (props in, JSX out); logic in `application` hooks
(`useXScreen → {state, handlers}`); I/O in `services` (degrade gracefully, fail
closed on security checks). Cross-feature imports only through each `index.ts`.

Aliases: `@features/*`, `@shared/*`, `@/*` → `src/*`, `@app/*` → `app/*`.

## 5. Design system

Tokens live in `src/shared/design/_tokens.scss` and are auto-injected into every
stylesheet by `next.config.ts` (`sassOptions.additionalData`). They are emitted
once as CSS custom properties in `:root` by `src/shared/styles/global.scss`;
everything after that reads `var(--ro-*)`. Class prefix is `ro`.

Rules:

- Near-monochrome. 95% of the UI is canvas + surface + ink + gray. Primary
  buttons are black (`--ro-ink`), never coloured.
- Colour appears only as (a) small rounded object-tile icons — person=slate,
  project=indigo, company=teal, deal=amber, meeting=rose — and (b) pastel status
  badges.
- `fact`/`inference` are quiet uppercase text tags, not loud chips.
- The source chip is the signature element: `[icon] Source · <title>`; it repeats
  on every summary, feed item and answer.
- Hairline borders, subtle shadows, generous whitespace, medium radii.
  Mobile-first; verify 360/390/768/1024+.
- No AI clichés: no purple/blue gradients, no glassmorphism, no glowing orb, no
  centred chat box with suggestion pills, no stock glyphs.

Surfaces to build: Today, Object page (Person/Company/Project), Ask, Review
Queue, Command palette, Inbox (capture intake), Meetings.

## 6. Object model

Each is a first-class table, not a note.

- **source** — kind (email/meeting/doc/note/upload), original_ref, storage_path,
  ingested_at, status.
- **chunk** — source_id, text, embedding `vector(1024)`, token_span, fts tsvector.
- **person** — name, aliases[], company_id, role, relationship_type,
  relationship_strength, last_interaction, current_context (living summary),
  next_action.
- **company** — name, type, industry, summary, risk_level, opportunity_level.
- **project** — outcome, status, owner, deadline, next_action, blockers, summary,
  summary_confidence.
- **meeting** — title, date, participants[], company_id, project_id,
  transcript_source_id, summary, decisions[], commitments[], sentiment,
  follow_up_status.
- **task** — description, owner, source_id, project_id, due_date, priority,
  status, commitment_type (explicit/implied/suggested/delegated/waiting),
  confidence.
- **decision** — statement, date, decision_maker, rationale, alternatives,
  reversible, review_date, outcome.
- **commitment** — who, what, to_whom, deadline, source_id, status.
- **provenance** (on every extracted field/row) — `fact_type` ∈
  {direct_source_fact, user_stated, extracted, inference, recommendation},
  `confidence` (0–1), `source_ids[]`.
- **audit_log** — what/why/model/confidence/prev_value/new_value/approved_by/
  timestamp; all AI changes reversible.

Relationship tables link people↔companies↔projects↔meetings↔tasks↔decisions
(Postgres join tables; no graph DB in Phase 1).

## 7. Ingestion pipeline

Server, background job, idempotent, retry-safe. For each incoming source:

1. Store the original immediately; acknowledge capture (<1s).
2. Extract text (PDF/docx/eml/txt/OCR for images).
3. Chunk; Voyage-3 embed each chunk → pgvector.
4. Claude extraction (fast tier, structured JSON output): entities, tasks,
   decisions, commitments, dates, sentiment, questions, risks — each with a
   `fact_type` and `confidence`.
5. Entity resolution: match extracted entities to canonical rows by name +
   aliases + context; create or merge. This is the spine — get it right or every
   summary drifts. Low-confidence matches → Review Queue.
6. Write rows with provenance. Never store an inference as a confirmed fact.
7. Update affected living summaries (person/project/company) with a fresh Claude
   pass, keeping citations.
8. Low-confidence / ambiguous items → Review Queue; the user's correction is
   persisted and feeds future resolution.

## 8. Grounded Ask engine — the contract

`ask(question)`:

1. Query-plan (which object types / time range).
2. Hybrid retrieval: full-text + vector via `match_chunks`, plus structured
   lookups on the object tables. Rank by relevance + recency + source authority.
3. Synthesis (strong tier) under a strict contract:
   - Answer only from retrieved context. Every claim carries a citation to a real
     `source`/`chunk`.
   - Label claims `fact` vs `inference`.
   - If retrieval returns nothing supporting part of the question, abstain on
     that part: "I don't have a source for that. I won't guess." Never fabricate.
   - Return: answer (inline citation refs), the source objects, and
     `grounded: true/false` + `abstained: []`.
4. Render per the reference Ask screen.

Acceptance test for grounding: adversarial questions whose answers are *not* in
the corpus must abstain; in-corpus claims must each resolve to a real source.

## 9. Guardrails / acceptance criteria

- `typecheck` + `build` stay green (no test framework).
- RLS enforced on every table; no public policy; server-only service-role access.
- No claim renders without a source; abstain path verified; `fact` vs `inference`
  never conflated.
- Auditable + reversible AI writes.
- Every screen matches `robos-v2.html`; mobile-first; reduced-motion respected.
- Conventional Commits; no AI co-author lines; commit/push only when asked.

## 10. Seed corpus

`seed/` holds ~8–12 fictional-but-realistic sources for one founder
("Rob / Aisle3"): 3–4 emails (including one where Rob promises something and one
that has gone quiet), a Granola-style transcript, a sales deck, a CRM export,
and a couple of notes. Designed so "what did I promise X", "what's slipping",
and one abstain case all have correct answers.

## 11. Env

```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   # server only
ANTHROPIC_API_KEY           # server only
VOYAGE_API_KEY              # server only
```
