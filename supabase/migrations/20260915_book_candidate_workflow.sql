alter table public.books
  add column if not exists audience text not null default 'wooram',
  add column if not exists candidate_status text,
  add column if not exists candidate_note text,
  add column if not exists candidate_review_at date,
  add column if not exists candidate_updated_at timestamptz;

update public.books
set audience = 'wooram'
where audience is null or audience not in ('wooram', 'boram');

update public.books
set candidate_status = 'interested',
    candidate_updated_at = coalesce(candidate_updated_at, now())
where interested is true
  and candidate_status is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'books_audience_check'
  ) then
    alter table public.books
      add constraint books_audience_check check (audience in ('wooram', 'boram'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'books_candidate_status_check'
  ) then
    alter table public.books
      add constraint books_candidate_status_check
      check (candidate_status is null or candidate_status in ('review', 'interested', 'purchase', 'owned', 'dismissed'));
  end if;
end $$;

create index if not exists books_candidate_status_idx on public.books(candidate_status);
create index if not exists books_audience_idx on public.books(audience);
create index if not exists books_candidate_review_at_idx on public.books(candidate_review_at)
where candidate_review_at is not null;
