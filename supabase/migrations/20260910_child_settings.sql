create table if not exists public.child_settings (
  user_key text primary key,
  child_profile jsonb not null default '{}'::jsonb,
  selected_interests text[] not null default '{}'::text[],
  updated_at timestamptz not null default now()
);

comment on table public.child_settings is
  '아이 프로필과 직접 선택한 관심사를 기기와 무관하게 보존한다.';

alter table public.child_settings enable row level security;

revoke all on table public.child_settings from anon, authenticated;
