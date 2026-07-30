# Rob OS

A private, AI-native operating system for one person's work. It ingests email,
meeting transcripts, documents and CRM exports, turns them into a structured model
of people, companies, projects, meetings, decisions, tasks and commitments, and
answers questions using only that model.

The whole product rests on one promise:

- **Every answer links to the source it came from.**
- **Every stored conclusion is labelled `fact` or `inference`, with a confidence.**
- **When nothing supports an answer, the system says so and refuses to guess.**

A confident wrong answer is the failure mode this is engineered against. Most of the
design decisions below only make sense in that light.

---

## Status

Phase 1 — the spine — is built and running against a live database.

| | |
|---|---|
| Screens | Today, Person, Company, Project, Meeting, Ask, Review Queue, Inbox, ⌘K palette |
| Sources ingested | 15 (fictional seed corpus) |
| Gates | `typecheck`, `build`, 19 grounding assertions, 25 engine invariants |

**Not done:** live end-to-end grounding test (needs an Anthropic key), OCR for
uploaded images, multi-user. See [Known gaps](#known-gaps).

---

## Running it

Needs Node 20.9+, Docker, and the Supabase CLI.

```bash
npm install
```

```bash
supabase start && supabase db reset
```

Copy `.env.example` to `.env.local` and fill in the Supabase values that
`supabase start` prints. Then load the corpus:

```bash
npm run seed:ingest -- --fixtures
```

```bash
npm run dev
```

Sign in at `/login` as `rob@aisle3.io`. Sign-in is email and password only —
set the password in Supabase under Authentication → Users. Sign-in links were
removed: they are useless to anyone who does not control the mailbox they arrive
at, and the built-in mailer silently drops messages past its hourly limit, so the
failure is indistinguishable from a broken login.

`--fixtures` replaces the two model calls with recorded output so the pipeline runs
without API keys. Everything else — chunking, embedding writes, entity resolution,
provenance, the review queue, the audit log — runs for real. Drop
`ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` into `.env.local` and omit the flag for a
live run.

For a hosted deployment, see [DEPLOYMENT.md](DEPLOYMENT.md).

---

## How the grounding actually works

Three mechanisms, in order of how much weight they carry.

**1. Nothing is stored without a quote.** Extraction must return a verbatim span
for every item, and `validateExtraction` drops anything whose quote cannot be found
in the source. A claim that cannot be pointed at is a fabrication however plausible
it reads, so it dies before it reaches the database rather than being stored at low
confidence.

**2. An uncited claim cannot reach the user.** The Ask prompt asks the model to cite
everything; `validateAnswer` makes it structurally impossible not to. A claim with no
valid citation becomes an abstention, hallucinated citation indices are stripped and
reported, and hedges that concede there is no source ("it's unclear whether…") are
converted into honest refusals. A model that ignores the contract therefore produces
a *thin* answer, never a confident uncited one. That asymmetry is the design — the
prompt is persuasion, the validator is the guarantee.

**3. Ambiguity goes to a human.** Entity resolution refuses to pick between two
close candidates. "Sarah" matching both Sarah Lin and Sarah Chen is a coin toss, and
guessing quietly corrupts the graph, so it lands in the Review Queue instead. The
user's correction is stored as a `resolution_hint` and honoured on every later run —
a rejection is remembered too.

Retrieval is hybrid: pgvector cosine and Postgres full text, fused with Reciprocal
Rank Fusion. RRF rather than a weighted blend because cosine distance and
`ts_rank_cd` are not on the same scale, so adding the raw numbers would let whichever
happens to be larger dominate.

---

## Architecture

Feature-sliced, dependencies pointing inward: `ui → application → domain`, with
`services` doing all I/O.

```
app/                    thin route shells, one feature screen each
src/features/
  ingestion/            extract → chunk → embed → extract entities → resolve
  ask/                  query plan → retrieval → synthesis → citation validation
  today/                the daily brief, built by rule
  review/               approve / reject / correct, with write-back
  capture/              paste and upload
  people/ companies/ projects/ meetings/ search/
src/shared/
  design/_tokens.scss   one source of truth for the visual system
  interfaces/           types generated from the schema
  services/             supabase, llm, embeddings, storage, audit
supabase/migrations/    nine SQL migrations
seed/                   the corpus, fixtures, and the acceptance-test spec
```

**UI is render-only.** Screens take finished view state and return JSX — no
formatting logic, no queries. Cross-feature imports go through each slice's
`index.ts`.

**The daily brief is built by rule, not by a model.** Every line has to link to
something openable, so every line is derived from a row that already carries its own
sources. A model writing the brief would produce better prose and worse receipts, and
on that screen the receipts *are* the product.

**Access model.** Every table has RLS enabled *and forced* with **zero policies** —
with RLS on and no policy Postgres denies every row, so `anon` and `authenticated`
can read nothing. All data access is server-side under the service role, and the
migration asserts that coverage rather than trusting it.

---

## Verification

```bash
npm run typecheck && npm run build
```

```bash
npm run ask:test      # 19 assertions
```

```bash
npm run verify        # 25 invariants, against the live database
```

`ask:test` checks that the answer-bearing source is retrieved for each demo
question, and that the citation contract holds against a **deliberately misbehaving
model** — uncited claims, invented citation indices, hedged non-answers, bad labels.

`verify` asserts the engine invariants: transcripts become meeting objects,
relationship edges exist and carry sources, the correction loop survives a
re-ingest, the audit trail covers every claim kind, reverts refuse rather than
silently detaching records, and **no commitment, task or decision exists without a
source**.

`seed/README.md` is the specification for both: eight questions with their required
citations, and five that must abstain. Two of the abstain cases are *partial* — the
corpus answers half — so the engine has to split the question rather than let a
supported half carry an unsupported one.

---

## Known gaps

Stated plainly, because a demo that hides these is worse than one that names them.

- **The live grounding test has not been run.** No Anthropic key has been available
  during the build, so no answer has ever been synthesised. The guarantee is proven
  structurally; the *behaviour* on the five abstain questions is not. This is the
  first thing to run once a key exists.
- **OCR is not wired.** Uploaded images are stored and flagged `needsOcr` rather
  than transcribed. A wrong OCR read would become a *cited* claim the user is invited
  to trust, so a visible gap beat a confident error.
- **Single workspace.** Every table carries `workspace_id` and the lookup is
  user-scoped, so multi-user is a `workspace_member` table plus policies — but it is
  not built.
- **No rate limiting** on Ask. Each question costs a model call.
- **Living summaries in fixture mode are hand-written** demo data, documented in
  `seed/README.md`. A live run replaces them with real output.

---

## Notes

The seed corpus is entirely fictional. Any resemblance to a real company is
coincidence.
