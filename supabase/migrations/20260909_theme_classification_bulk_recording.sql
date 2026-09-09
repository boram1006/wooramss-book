create or replace function public.record_unclassified_themes(
  p_items jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  item record;
begin
  for item in
    select *
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(
      raw_expression text,
      normalized_expression text,
      source text,
      record_ids text[]
    )
  loop
    perform public.record_unclassified_theme(
      item.raw_expression,
      item.normalized_expression,
      item.source,
      coalesce(item.record_ids, '{}'::text[])
    );
  end loop;
end;
$$;

revoke all on function public.record_unclassified_themes(jsonb) from public, anon, authenticated;
grant execute on function public.record_unclassified_themes(jsonb) to service_role;
