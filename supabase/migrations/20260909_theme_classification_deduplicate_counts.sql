-- Existing queue rows were observed through several API paths. Normalize their
-- count to the number of distinct related books before using the idempotent RPC.
update public.unclassified_theme_logs
set occurrence_count = greatest(coalesce(cardinality(record_ids), 0), 1)
where status in ('pending', 'deferred');

create or replace function public.record_unclassified_theme(
  p_raw_expression text,
  p_normalized_expression text,
  p_source text,
  p_record_ids text[] default '{}'
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.unclassified_theme_logs (
    normalized_expression,
    raw_expression,
    occurrence_count,
    sources,
    record_ids
  ) values (
    p_normalized_expression,
    p_raw_expression,
    greatest(coalesce(cardinality(p_record_ids), 0), 1),
    array[p_source],
    coalesce(p_record_ids, '{}'::text[])
  )
  on conflict (normalized_expression) do update set
    raw_expression = excluded.raw_expression,
    occurrence_count = case
      when coalesce(cardinality(excluded.record_ids), 0) > 0 then greatest(
        public.unclassified_theme_logs.occurrence_count,
        coalesce(cardinality((
          select array_agg(distinct value)
          from unnest(public.unclassified_theme_logs.record_ids || excluded.record_ids) as value
          where value <> ''
        )), 1)
      )
      else public.unclassified_theme_logs.occurrence_count + 1
    end,
    sources = coalesce((
      select array_agg(distinct value)
      from unnest(public.unclassified_theme_logs.sources || excluded.sources) as value
    ), '{}'::text[]),
    record_ids = coalesce((
      select array_agg(distinct value)
      from unnest(public.unclassified_theme_logs.record_ids || excluded.record_ids) as value
      where value <> ''
    ), '{}'::text[]),
    last_seen_at = now()
  where public.unclassified_theme_logs.status in ('pending', 'deferred');
end;
$$;
