-- Preserve multi-axis and book-scoped outcomes from the 1,490-expression review.
alter table public.unclassified_theme_logs
  add column if not exists mapped_themes text[] not null default '{}',
  add column if not exists resolution_scope text,
  add column if not exists resolution_v2 jsonb;

alter table public.unclassified_theme_logs
  drop constraint if exists unclassified_theme_logs_status_check;
alter table public.unclassified_theme_logs
  add constraint unclassified_theme_logs_status_check
  check (status in ('pending', 'mapped', 'excluded', 'deferred', 'resolved_v2'));

alter table public.unclassified_theme_logs
  drop constraint if exists unclassified_theme_logs_resolution_scope_check;
alter table public.unclassified_theme_logs
  add constraint unclassified_theme_logs_resolution_scope_check
  check (resolution_scope is null or resolution_scope in ('global', 'book'));

create table if not exists public.taxonomy_review_residuals_v2 (
  book_id uuid primary key references public.books(id) on delete cascade,
  title text not null,
  residual_expressions text[] not null default '{}',
  residual_additions jsonb not null default '{}'::jsonb,
  reason text not null,
  taxonomy_version text not null,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.taxonomy_review_residuals_v2 enable row level security;
revoke all on public.taxonomy_review_residuals_v2 from anon, authenticated;
grant select, insert, update, delete on public.taxonomy_review_residuals_v2 to service_role;

create or replace function public.apply_taxonomy_expression_resolutions_v2(
  p_items jsonb,
  p_residuals jsonb,
  p_approval_id text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  updated_count integer := 0;
  residual_count integer := 0;
begin
  if p_approval_id <> 'taxonomy-expression-sync-v2-20260914' then
    raise exception 'Approval id mismatch';
  end if;

  with input as (
    select *
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(
      normalized_expression text,
      status text,
      mapped_theme text,
      mapped_themes text[],
      resolution_scope text,
      resolution_v2 jsonb
    )
  )
  update public.unclassified_theme_logs logs
  set status = input.status,
      mapped_theme = input.mapped_theme,
      mapped_themes = coalesce(input.mapped_themes, '{}'::text[]),
      resolution_scope = input.resolution_scope,
      resolution_v2 = input.resolution_v2,
      resolved_at = case when input.status in ('mapped', 'excluded', 'resolved_v2') then now() else null end
  from input
  where logs.normalized_expression = input.normalized_expression;

  get diagnostics updated_count = row_count;
  if updated_count <> jsonb_array_length(coalesce(p_items, '[]'::jsonb)) then
    raise exception 'Resolution update count mismatch: %', updated_count;
  end if;

  insert into public.taxonomy_review_residuals_v2(
    book_id,
    title,
    residual_expressions,
    residual_additions,
    reason,
    taxonomy_version,
    status
  )
  select
    book_id,
    title,
    coalesce(residual_expressions, '{}'::text[]),
    coalesce(residual_additions, '{}'::jsonb),
    reason,
    taxonomy_version,
    'pending'
  from jsonb_to_recordset(coalesce(p_residuals, '[]'::jsonb)) as x(
    book_id uuid,
    title text,
    residual_expressions text[],
    residual_additions jsonb,
    reason text,
    taxonomy_version text
  )
  on conflict (book_id) do update set
    title = excluded.title,
    residual_expressions = excluded.residual_expressions,
    residual_additions = excluded.residual_additions,
    reason = excluded.reason,
    taxonomy_version = excluded.taxonomy_version,
    status = 'pending',
    resolved_at = null;

  get diagnostics residual_count = row_count;
  return jsonb_build_object('updated', updated_count, 'residuals', residual_count);
end;
$$;

revoke all on function public.apply_taxonomy_expression_resolutions_v2(jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.apply_taxonomy_expression_resolutions_v2(jsonb, jsonb, text) to service_role;
