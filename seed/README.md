# Seed corpus — Rob / Aisle3

Fifteen fictional-but-realistic sources for one founder, written so that the
Phase 1 demo questions have *checkable* answers. This doubles as the fixture for
the §8 grounding acceptance test: the expected answers below are what the Ask
engine must produce, and the abstain cases are what it must refuse to guess at.

Everything here is invented. Any resemblance to a real company is coincidence.

## The setup

**Rob Aitken**, founder of **Aisle3** — an eleven-person London firm that builds
operational data platforms. "Today" is **Wednesday 29 July 2026**.

| Company | Relationship | State on 29 July |
|---|---|---|
| Omnilux | Prospect | £82k proposal issued 20 Jul, terms expire Fri 31 Jul. Budget unapproved. Gone quiet since 23 Jul. |
| Revolt Inc | Client | Live engagement, expanding for Q4. Blocked on a revised SOW Rob owes. |
| Basepoint | Client | Renewal at £45k, verbal yes on 28 Jul. |
| GreenLeaf Systems | Prospect | First call 21 Jul, kickoff today at 14:30. |
| Northwind Retail | Past client | Reference account, handed over Nov 2025. |
| Kestrel Logistics | Past client | Dormant. |

The people: **Sarah Lin** (Omnilux, buyer) and **Daniel Okafor** (Omnilux,
finance, the blocker). **Mike Banner** (Revolt, Senior PM, day-to-day owner) and
**David Reyes** (Revolt, procurement, chasing on Mike's behalf). **Annie Zhang**
(Basepoint, champion) and **Terrence Boyd** (Basepoint, MD, signs the cheque).
**Nadia Hoque** (GreenLeaf, COO). Internally, **Jack Mwangi** (design lead) and
**Priya Raman** (delivery lead).

## The two things Rob owes

Both are the same failure repeated, which is the point — the corpus is designed
so the system can notice the pattern, not just the two items.

1. **The revised Omnilux proposal**, promised to Sarah *by Friday* on 23 July.
   Not sent. Terms expire 31 July.
2. **The revised SOW**, promised to Mike *by end of week* on 23 July. Not sent.
   David is now blocked on it and escalating.

## Files

| # | Path | Kind | Date | Why it's here |
|---|---|---|---|---|
| 1 | `emails/2026-07-20-omnilux-proposal-sent.eml` | email | 20 Jul | The £82k proposal and the 31 July expiry |
| 2 | `notes/2026-07-21-greenleaf-first-call.md` | note | 21 Jul | New prospect, explicitly *no commitments made* |
| 3 | `meetings/2026-07-23-revolt-next-stage-planning.md` | meeting | 23 Jul | Rob commits to the revised SOW; Mike's rate hesitation |
| 4 | `meetings/2026-07-23-omnilux-review-call.md` | meeting | 23 Jul | Budget flagged as the sticking point |
| 5 | `emails/2026-07-23-sarah-pricing-breakdown-request.eml` | email | 23 Jul | Sarah asks for pricing by tier — last contact from her |
| 6 | `emails/2026-07-23-rob-promises-revised-proposal.eml` | email | 23 Jul | Rob promises it *by Friday* |
| 7 | `emails/2026-07-24-jack-august-goals.eml` | email | 24 Jul | Internal decision pending, Launch GSI slip risk |
| 8 | `notes/2026-07-25-launch-gsi-status.md` | note | 25 Jul | The agency-vs-in-house tradeoff, in numbers |
| 9 | `notes/2026-07-27-weekly-review.md` | note | 27 Jul | Rob naming the pattern himself |
| 10 | `emails/2026-07-27-david-chasing-sow.eml` | email | 27 Jul | Escalation; the September-slip consequence |
| 11 | `emails/2026-07-28-annie-basepoint-verbal-yes.eml` | email | 28 Jul | The one piece of good news |
| 12 | `docs/aisle3-services-deck.md` | doc | 12 Jun | The three-tier pricing model the proposals derive from |
| 13 | `crm/companies.csv` | crm | 28 Jul | Company records |
| 14 | `crm/people.csv` | crm | 28 Jul | Contact records with last-contact dates |
| 15 | `crm/opportunities.csv` | crm | 28 Jul | Pipeline with values, stages and probabilities |

`manifest.json` carries the ingestion metadata for each file: kind, title,
`occurredAt`, author, participants, and the upstream `originalRef` that makes
re-ingestion idempotent.

## Acceptance test — questions that must be answered

Each of these must resolve every claim to a real source. The engine passes only
if the citation points at the file named.

| Question | Expected answer | Must cite |
|---|---|---|
| What did I promise Sarah this week? | The revised Omnilux proposal with pricing broken out by tier, by Friday. Not sent. | file 6 |
| Is Omnilux at risk? | Yes. No reply from Sarah in six days, the review call flagged budget as the sticking point, and the terms expire 31 July. | files 5, 4, 1 |
| What did Daniel object to? | The rolling monthly support model — opex that does not sit in a capex approval. He was positive on the work itself. | file 4 |
| What's slipping? | The Omnilux proposal and the Revolt SOW, both promised 23 July and both unsent. Launch GSI slips two weeks if the homepage stays in-house. | files 6, 3, 10, 8 |
| Why is David chasing me? | He cannot close the Aisle3 vendor record without the revised SOW; missing this week rolls it into the August intake and a September start. | file 10 |
| What's the good news? | Basepoint verbal yes at £45,000 from Terrence, September start. | file 11 |
| How much is Omnilux worth and when does it close? | £82,000, expected close 14 August, 45% probability. | files 1, 15 |
| What does ongoing support cost? | £3,200/month rolling, or £34,000 annually. | file 12 |

## Acceptance test — questions that must abstain

These are the ones that matter. A confident answer to any of them is a failure,
regardless of how plausible it sounds.

| Question | Why there is no answer | Correct behaviour |
|---|---|---|
| Which other vendors is Omnilux evaluating? | Never mentioned anywhere in the corpus. | Full abstain. |
| What is Mike Banner's director called? | Mike says "my director" in file 3 and never names them. | Full abstain — the role exists, the name does not. |
| What is GreenLeaf's budget? | File 2 records that budget was *not discussed*. | State that it was not discussed; do not estimate from the deck. |
| Has Sarah secured the transformation budget? | As of 23 July she had not asked for it (file 4). Nothing since. | Give the sourced fact, then abstain on the current state. |
| Did Rob send the revised proposal? | Every source shows the promise; none shows the send. | Say no source confirms it was sent — not "yes" and not "no". |

The fourth and fifth are the sharp ones: both have a *partial* answer in the
corpus, so the engine has to split the question and abstain on only the
unsupported half. Answering the whole thing confidently is the exact failure the
product exists to prevent.

## Loading

```bash
npm run seed:ingest
```

Reads `manifest.json`, stores each file as a `source`, and runs the full pipeline.
Needs `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` in `.env.local`; without them the
sources and chunks are still stored and the run reports which stages it skipped.

Re-running is safe and verified: three consecutive runs produce identical row
counts. Sources upsert on `original_ref`, and each run clears the previous
chunks, claims, mentions and **pending** review items for that source before
rewriting them. Resolved review items survive — they carry the user's correction,
and deleting them would make the system forget an answer it had been given.

```bash
npm run seed:ingest -- --only omnilux
```

### Fixture mode

```bash
npm run seed:ingest -- --fixtures
```

Replaces the two model calls with recorded output from
`seed/fixtures/extraction/`, so the pipeline can be exercised without network
access. Every other stage runs for real against the database: chunking,
embedding writes, entity resolution, provenance, the review queue, audit log and
summary writes.

Five sources have fixtures, chosen to cover the paths that matter:

| Fixture | What it proves |
|---|---|
| `omnilux-review-call-0723` | Creates Sarah Lin, Daniel Okafor and Omnilux from scratch; a 0.55-confidence task is routed to review rather than stored |
| `CAF8x1-omnilux-prop-0723b-…` | Matches the existing Sarah Lin instead of creating a second one; records the promise with its deadline; sends bare "Daniel" to review |
| `rv-proc-2291-0727-…` | Two commitments in opposite directions; a third whose party ("legal") cannot be resolved goes to review rather than being invented |
| `bp-0728-annie-verbal-…` | A decision with a named decision-maker created from the same source |
| `crm-export-people-0728` | Six people and four companies, all resolving onto existing rows — this is the run that shows resolution converging rather than duplicating |

**A fixture run is not a retrieval test.** The embeddings it writes are
deterministic hashes, not Voyage vectors — they exercise the pgvector write path
and the index, and mean nothing semantically. Full-text retrieval over the real
ingested prose does work in fixture mode, and does not in the vector arm. Judge
retrieval quality only from a live run.
