-- Replace the row-by-row bulk recorder with one set-based upsert. Repeated book
-- loads that contain no new source or record id no longer rewrite queue rows.
create or replace function public.record_unclassified_themes(
  p_items jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  with input as (
    select *
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(
      raw_expression text,
      normalized_expression text,
      source text,
      record_ids text[]
    )
    where coalesce(normalized_expression, '') <> ''
  ), grouped as (
    select
      normalized_expression,
      (array_agg(raw_expression order by raw_expression))[1] as raw_expression,
      array_agg(distinct source) filter (where coalesce(source, '') <> '') as sources
    from input
    group by normalized_expression
  ), prepared as (
    select
      grouped.normalized_expression,
      grouped.raw_expression,
      coalesce(grouped.sources, '{}'::text[]) as sources,
      coalesce(array(
        select distinct record_id
        from input item
        cross join lateral unnest(coalesce(item.record_ids, '{}'::text[])) as record_id
        where item.normalized_expression = grouped.normalized_expression
          and record_id <> ''
      ), '{}'::text[]) as record_ids
    from grouped
  )
  insert into public.unclassified_theme_logs (
    normalized_expression,
    raw_expression,
    occurrence_count,
    sources,
    record_ids
  )
  select
    normalized_expression,
    raw_expression,
    greatest(coalesce(cardinality(record_ids), 0), 1),
    sources,
    record_ids
  from prepared
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
  where public.unclassified_theme_logs.status in ('pending', 'deferred')
    and (
      coalesce(cardinality(excluded.record_ids), 0) = 0
      or not public.unclassified_theme_logs.sources @> excluded.sources
      or not public.unclassified_theme_logs.record_ids @> excluded.record_ids
    );
end;
$$;

revoke all on function public.record_unclassified_themes(jsonb) from public, anon, authenticated;
grant execute on function public.record_unclassified_themes(jsonb) to service_role;
