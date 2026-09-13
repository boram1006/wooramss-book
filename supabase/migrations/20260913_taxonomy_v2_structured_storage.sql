-- Structured, additive storage for the approved taxonomy v2 rollout.
create table if not exists public.taxonomy_categories_v2 (
  axis text not null check (axis in ('subject','interest','form','context','metadata')),
  target text not null,
  sort_order integer not null default 0,
  introduced_in text not null,
  created_at timestamptz not null default now(),
  primary key (axis, target)
);

create table if not exists public.book_taxonomy_v2 (
  book_id uuid not null references public.books(id) on delete cascade,
  axis text not null,
  target text not null,
  taxonomy_version text not null,
  approval_source text not null,
  approved_at timestamptz not null default now(),
  primary key (book_id, axis, target),
  foreign key (axis, target) references public.taxonomy_categories_v2(axis, target)
);

create index if not exists book_taxonomy_v2_axis_target_idx
  on public.book_taxonomy_v2(axis, target);

alter table public.taxonomy_categories_v2 enable row level security;
alter table public.book_taxonomy_v2 enable row level security;
revoke all on public.taxonomy_categories_v2 from anon, authenticated;
revoke all on public.book_taxonomy_v2 from anon, authenticated;
grant select, insert, update, delete on public.taxonomy_categories_v2 to service_role;
grant select, insert, update, delete on public.book_taxonomy_v2 to service_role;
