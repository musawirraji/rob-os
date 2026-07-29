-- ─────────────────────────────────────────────────────────────────────────────
-- Rob OS — hybrid retrieval
--
-- `match_chunks` is the retrieval half of the grounding contract. Vector search
-- alone misses exact tokens (a price, a date, a product name); full-text alone
-- misses paraphrase. Both matter here — "what did I promise Sarah" needs the
-- paraphrase, "the £48k tier" needs the literal.
--
-- Fusion is Reciprocal Rank Fusion rather than a weighted score blend: cosine
-- distance and ts_rank are not on the same scale, so combining the raw numbers
-- would let whichever happens to be larger dominate. RRF only uses each result's
-- rank within its own list, which is scale-free.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.match_chunks(
  p_workspace_id uuid,
  p_query_embedding extensions.vector(1024) default null,
  p_query_text text default null,
  p_match_count int default 12,
  -- Nudge these per query plan: a "find the exact wording" question wants more
  -- full text, a "what's the situation with X" question wants more semantic.
  p_semantic_weight double precision default 1.0,
  p_full_text_weight double precision default 1.0,
  -- RRF smoothing constant. 50 is the usual default; higher flattens the
  -- advantage of being rank 1.
  p_rrf_k int default 50,
  -- Restrict to sources that happened on or after this instant.
  p_since timestamptz default null,
  -- Restrict to particular kinds of source, e.g. only meetings.
  p_source_kinds public.source_kind[] default null
)
returns table (
  chunk_id uuid,
  source_id uuid,
  source_kind public.source_kind,
  source_title text,
  occurred_at timestamptz,
  content text,
  token_start int,
  token_end int,
  semantic_rank int,
  full_text_rank int,
  score double precision
)
language sql
stable
security definer
-- Pinned so the function cannot be hijacked by a caller's search_path.
set search_path = public, extensions, pg_temp
as $$
  with
  -- Over-fetch from each arm so the fusion has something to work with; a chunk
  -- ranked 30th semantically can still win once full text agrees with it.
  candidate_pool as (
    select greatest(p_match_count * 4, 40) as n
  ),
  scoped as (
    select c.id, c.embedding, c.fts
    from public.chunk c
    join public.source s on s.id = c.source_id
    where c.workspace_id = p_workspace_id
      and (p_since is null or s.occurred_at >= p_since)
      and (p_source_kinds is null or s.kind = any (p_source_kinds))
  ),
  semantic as (
    select
      scoped.id,
      row_number() over (order by scoped.embedding <=> p_query_embedding) as rank
    from scoped, candidate_pool
    where p_query_embedding is not null
      and scoped.embedding is not null
    order by scoped.embedding <=> p_query_embedding
    limit (select n from candidate_pool)
  ),
  -- `websearch_to_tsquery` and `plainto_tsquery` both AND every term together,
  -- which is wrong for a natural-language question: "What did I promise Sarah this
  -- week?" would only match a chunk containing *all* of those words, and matches
  -- nothing. So the query text is lexed with `to_tsvector` — which drops
  -- stopwords and stems — and the surviving lexemes are OR-ed. `ts_rank_cd` then
  -- does the discriminating, rewarding chunks that match more terms, closer
  -- together. Lexemes are quoted because a stemmed token can contain characters
  -- that are operators in tsquery syntax.
  parsed_query as (
    select case
      when p_query_text is null or btrim(p_query_text) = '' then null
      else (
        select nullif(string_agg(quote_literal(l.lexeme), ' | '), '')::tsquery
        from unnest(to_tsvector('english', p_query_text)) as l(lexeme, positions, weights)
      )
    end as tsq
  ),
  full_text as (
    select
      scoped.id,
      row_number() over (
        order by ts_rank_cd(scoped.fts, parsed_query.tsq) desc
      ) as rank
    from scoped, parsed_query, candidate_pool
    where parsed_query.tsq is not null
      and scoped.fts @@ parsed_query.tsq
    order by ts_rank_cd(scoped.fts, parsed_query.tsq) desc
    limit (select n from candidate_pool)
  ),
  fused as (
    select
      coalesce(semantic.id, full_text.id) as id,
      semantic.rank as semantic_rank,
      full_text.rank as full_text_rank,
      coalesce(1.0 / (p_rrf_k + semantic.rank), 0.0) * p_semantic_weight
        + coalesce(1.0 / (p_rrf_k + full_text.rank), 0.0) * p_full_text_weight
        as score
    from semantic
    full outer join full_text on semantic.id = full_text.id
  )
  select
    c.id,
    c.source_id,
    s.kind,
    s.title,
    s.occurred_at,
    c.content,
    c.token_start,
    c.token_end,
    fused.semantic_rank::int,
    fused.full_text_rank::int,
    fused.score
  from fused
  join public.chunk c on c.id = fused.id
  join public.source s on s.id = c.source_id
  order by fused.score desc, s.occurred_at desc nulls last
  limit p_match_count;
$$;

comment on function public.match_chunks is
  'Hybrid retrieval over chunk: pgvector cosine + Postgres full text, fused with '
  'Reciprocal Rank Fusion. Server-side only; never exposed to anon.';

-- Server code only. The Ask engine runs under the service role.
revoke all on function public.match_chunks(
  uuid, extensions.vector(1024), text, int, double precision, double precision,
  int, timestamptz, public.source_kind[]
) from public, anon, authenticated;

grant execute on function public.match_chunks(
  uuid, extensions.vector(1024), text, int, double precision, double precision,
  int, timestamptz, public.source_kind[]
) to service_role;
