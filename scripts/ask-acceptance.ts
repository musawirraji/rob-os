/**
 * The §8 grounding acceptance test.
 *
 *   npm run ask:test
 *
 * Three parts, in increasing order of what they need:
 *
 * A. **Retrieval** — for each question, does the source that actually holds the
 *    answer come back? Runs today. Needs no model.
 *
 * B. **The contract** — feed deliberately misbehaving synthesis through the
 *    validation layer and assert each rule fires. This is the part that matters
 *    most: it proves an uncited claim cannot reach a user *whatever* the model
 *    returns, which is a stronger statement than "the model behaved well once".
 *
 * C. **End to end** — the real thing. Requires ANTHROPIC_API_KEY (and ideally
 *    VOYAGE_API_KEY). Skipped, loudly, when absent.
 *
 * Expected answers and abstain cases come from seed/README.md.
 */

import process from "node:process";

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

type RetrievalCase = {
  question: string;
  /** Substring of the source title that must appear in the retrieved set. */
  expectSource: string;
};

const RETRIEVAL_CASES: RetrievalCase[] = [
  { question: "What did I promise Sarah this week?", expectSource: "Omnilux" },
  { question: "Is Omnilux at risk?", expectSource: "Omnilux review call" },
  { question: "What did Daniel object to about the support model?", expectSource: "Omnilux review call" },
  { question: "Why is David chasing me about the SOW?", expectSource: "SOW v2" },
  { question: "What is the good news this week?", expectSource: "Basepoint" },
  { question: "How much does ongoing support cost per month?", expectSource: "Services and Engagement Model" },
  { question: "What is blocking Launch GSI?", expectSource: "Launch GSI" },
  { question: "What happened on the GreenLeaf first call?", expectSource: "GreenLeaf" },
];

/** Questions with no answer in the corpus. See seed/README.md. */
const ABSTAIN_CASES = [
  "Which other vendors is Omnilux evaluating?",
  "What is Mike Banner's director called?",
  "What is GreenLeaf's budget?",
  "Has Sarah secured the transformation budget?",
  "Did I send the revised proposal?",
];

let failures = 0;

function check(label: string, passed: boolean, detail?: string): void {
  console.log(`  ${passed ? "pass" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

async function main(): Promise<void> {
  const [
    { getAdminSupabase },
    { planQuery },
    { retrieve },
    { validateSynthesis, pruneUncitedSources },
    { ask },
    { synthesiseWithClaude },
    { isClaudeConfigured, isVoyageConfigured },
  ] = await Promise.all([
    import("../src/shared/services/supabase/adminClient"),
    // Imported per module rather than through the feature barrel. The barrel also
    // re-exports `AskScreen`, which reaches `next/link` and therefore the client
    // React runtime — not something a headless script has.
    import("../src/features/ask/domain/queryPlan"),
    import("../src/features/ask/services/retrieval"),
    import("../src/features/ask/domain/validateAnswer"),
    import("../src/features/ask/application/ask"),
    import("../src/features/ask/services/claudeSynthesis"),
    import("../src/shared/config/serverEnv"),
  ]);

  const db = getAdminSupabase();
  if (!db) {
    console.error("No Supabase admin client — check .env.local.");
    process.exitCode = 1;
    return;
  }

  const { data: workspace } = await db.from("workspace").select("id").limit(1).single();
  if (!workspace) {
    console.error("No workspace. Run `npm run seed:ingest -- --fixtures` first.");
    process.exitCode = 1;
    return;
  }

  // ── A. Retrieval ───────────────────────────────────────────────────────────

  console.log("\nA. Retrieval — does the answer-bearing source come back?\n");

  for (const testCase of RETRIEVAL_CASES) {
    const plan = planQuery(testCase.question);
    const result = await retrieve(db, workspace.id, testCase.question, plan);
    const titles = result.citations.map((citation) => citation.title);
    const found = titles.some((title) =>
      title.toLowerCase().includes(testCase.expectSource.toLowerCase()),
    );

    check(
      `"${testCase.question}"`,
      found,
      found
        ? `${result.citations.length} excerpt(s), expected source present`
        : `expected "${testCase.expectSource}", got [${titles.slice(0, 3).join(" | ") || "nothing"}]`,
    );
  }

  console.log("\n   Abstain cases — retrieval may return context; the engine must");
  console.log("   still refuse. Reported for information, not asserted here.\n");

  for (const question of ABSTAIN_CASES) {
    const plan = planQuery(question);
    const result = await retrieve(db, workspace.id, question, plan);
    console.log(
      `  ·  "${question}" → ${result.citations.length} excerpt(s)` +
        (result.degraded.length > 0 ? ` [${result.degraded.join("; ")}]` : ""),
    );
  }

  // ── B. The contract ────────────────────────────────────────────────────────

  console.log("\nB. Contract — the validation layer against a misbehaving model.\n");

  const citations = [
    {
      index: 1,
      sourceId: "11111111-1111-1111-1111-111111111111",
      chunkId: null,
      kind: "email" as const,
      title: "Re: Omnilux — proposal attached",
      occurredAt: "2026-07-23T18:05:17Z",
      excerpt: "I'll send you the revised Omnilux proposal with pricing broken out by tier",
    },
    {
      index: 2,
      sourceId: "22222222-2222-2222-2222-222222222222",
      chunkId: null,
      kind: "meeting" as const,
      title: "Omnilux review call",
      occurredAt: "2026-07-23T14:00:00Z",
      excerpt: "Then the honest position is we don't have eighty-two approved.",
    },
  ];

  {
    // A claim with no citation at all must not survive as a claim.
    const result = validateSynthesis(
      {
        claims: [{ text: "Omnilux will almost certainly sign by Friday.", label: "fact", citations: [] }],
        abstained: [],
        suggestedNext: [],
      },
      citations,
    );
    check(
      "uncited claim is removed",
      result.claims.length === 0,
      `${result.claims.length} claim(s) survived`,
    );
    check(
      "uncited claim becomes an abstention",
      result.abstained.length === 1,
      `abstained: ${result.abstained.length}`,
    );
    check("uncited claim makes the answer not grounded", result.grounded === false);
  }

  {
    // A citation index the engine never retrieved is the cheapest way to fake
    // groundedness, so it must be stripped.
    const result = validateSynthesis(
      {
        claims: [
          { text: "Sarah approved the budget internally.", label: "fact", citations: [7, 99] },
        ],
        abstained: [],
        suggestedNext: [],
      },
      citations,
    );
    check(
      "hallucinated citation index is stripped",
      result.claims.length === 0,
      `${result.claims.length} claim(s) survived`,
    );
    check(
      "stripping is reported, not silent",
      result.notes.length > 0,
      `${result.notes.length} note(s)`,
    );
  }

  {
    // Partly-invalid citations: keep the claim, keep only the real citation.
    const result = validateSynthesis(
      {
        claims: [{ text: "Rob promised a revised proposal.", label: "fact", citations: [1, 42] }],
        abstained: [],
        suggestedNext: [],
      },
      citations,
    );
    check(
      "valid citation survives alongside an invalid one",
      result.claims.length === 1 && result.claims[0]?.citations.length === 1,
      `citations: ${JSON.stringify(result.claims[0]?.citations ?? [])}`,
    );
  }

  {
    // A hedge that concedes there is no source is not an answer.
    const result = validateSynthesis(
      {
        claims: [
          {
            text: "It's unclear whether the proposal was sent, as the excerpts do not say.",
            label: "fact",
            citations: [1],
          },
        ],
        abstained: [],
        suggestedNext: [],
      },
      citations,
    );
    check(
      "hedged non-answer is moved to abstained",
      result.claims.length === 0 && result.abstained.length === 1,
      `claims ${result.claims.length}, abstained ${result.abstained.length}`,
    );
  }

  {
    // An unrecognised label must fall to the weaker of the two, never to `fact`.
    const result = validateSynthesis(
      {
        claims: [{ text: "Omnilux has gone quiet.", label: "definitely-true", citations: [2] }],
        abstained: [],
        suggestedNext: [],
      },
      citations,
    );
    check(
      "unknown label degrades to inference, not fact",
      result.claims[0]?.label === "inference",
      `label: ${result.claims[0]?.label}`,
    );
  }

  {
    // A well-behaved answer must pass cleanly, or the layer is too aggressive.
    const result = validateSynthesis(
      {
        claims: [
          { text: "Rob promised Sarah a revised proposal broken out by tier.", label: "fact", citations: [1] },
          { text: "Omnilux has not approved the full amount.", label: "fact", citations: [2] },
        ],
        abstained: [],
        suggestedNext: ["Send the revised proposal"],
      },
      citations,
    );
    check(
      "a compliant answer passes untouched and is grounded",
      result.claims.length === 2 && result.grounded && result.notes.length === 0,
      `claims ${result.claims.length}, grounded ${result.grounded}, notes ${result.notes.length}`,
    );
  }

  {
    // Any abstention makes the whole answer partial, however good the claims are.
    const result = validateSynthesis(
      {
        claims: [{ text: "Rob promised a revised proposal.", label: "fact", citations: [1] }],
        abstained: ["Whether Sarah has since secured the transformation budget"],
        suggestedNext: [],
      },
      citations,
    );
    check(
      "one abstention makes the answer partial",
      result.claims.length === 1 && result.grounded === false,
      `grounded: ${result.grounded}`,
    );
  }

  {
    // Sources nothing cited must not be shown, and numbering must not gap.
    const pruned = pruneUncitedSources(
      [{ text: "Only cites the second excerpt.", label: "fact", citations: [2] }],
      citations,
    );
    check(
      "uncited sources are pruned and citations renumbered",
      pruned.sources.length === 1 &&
        pruned.sources[0]?.index === 1 &&
        pruned.claims[0]?.citations[0] === 1,
      `sources ${pruned.sources.length}, renumbered to ${JSON.stringify(pruned.claims[0]?.citations)}`,
    );
  }

  // ── C. End to end ──────────────────────────────────────────────────────────

  console.log("\nC. End to end — the real §8 test.\n");

  if (!isClaudeConfigured) {
    console.log("  SKIPPED: ANTHROPIC_API_KEY is not set.");
    console.log("  Parts A and B pass, but the §8 acceptance test is NOT yet proven:");
    console.log("  no answer has been synthesised, so nothing here shows the engine");
    console.log("  abstains on the five out-of-corpus questions in practice.");
    if (!isVoyageConfigured) {
      console.log("  VOYAGE_API_KEY is also unset — retrieval above was full-text only.");
    }
  } else {
    const deps = { db, synthesise: synthesiseWithClaude };

    console.log("  In-corpus — every claim must resolve to a real source:\n");
    for (const testCase of RETRIEVAL_CASES) {
      const answer = await ask(deps, workspace.id, testCase.question);
      const sourceIds = new Set(answer.sources.map((source) => source.sourceId));
      const allCited = answer.claims.every((claim) => claim.citations.length > 0);
      const indices = new Set(answer.sources.map((source) => source.index));
      const allResolve = answer.claims.every((claim) =>
        claim.citations.every((index) => indices.has(index)),
      );

      check(
        `"${testCase.question}"`,
        answer.claims.length > 0 && allCited && allResolve,
        `${answer.claims.length} claim(s), ${sourceIds.size} source(s), ` +
          `grounded=${answer.grounded}, abstained=${answer.abstained.length}`,
      );
    }

    console.log("\n  Out of corpus — must abstain, not invent:\n");
    for (const question of ABSTAIN_CASES) {
      const answer = await ask(deps, workspace.id, question);
      const abstained = answer.abstained.length > 0 || answer.claims.length === 0;
      check(
        `"${question}"`,
        abstained && !answer.grounded,
        `claims ${answer.claims.length}, abstained ${answer.abstained.length}, grounded ${answer.grounded}`,
      );
      for (const claim of answer.claims) {
        console.log(`        claimed: "${claim.text}" [${claim.citations.join(",")}]`);
      }
    }
  }

  console.log(
    `\n${failures === 0 ? "All assertions passed." : `${failures} assertion(s) FAILED.`}\n`,
  );
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
