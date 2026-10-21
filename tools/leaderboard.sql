-- Global leaderboard for the title-screen platformer (leaderboard.js).
-- Run once in the Supabase SQL editor, then put the project URL and the
-- anon (public) key in site-config.js → SITE.leaderboard.
-- Anyone can read and add rows; nobody can edit or delete them with the anon key.
-- The checks reject obviously impossible runs (the fastest possible clear is
-- ~9.7 s and the maximum score is 9,600).

create table if not exists public.leaderboard (
  id bigint generated always as identity primary key,
  mode text not null check (mode in ('speed', 'score')),
  name text not null check (char_length(name) between 1 and 12),
  value integer not null check (
    (mode = 'speed' and value between 9000 and 3600000) or
    (mode = 'score' and value between 0 and 10000)
  ),
  created_at timestamptz not null default now()
);

create index if not exists leaderboard_mode_value on public.leaderboard (mode, value);

alter table public.leaderboard enable row level security;

drop policy if exists "leaderboard read" on public.leaderboard;
create policy "leaderboard read" on public.leaderboard for select to anon using (true);

drop policy if exists "leaderboard insert" on public.leaderboard;
create policy "leaderboard insert" on public.leaderboard for insert to anon with check (true);

grant select, insert on public.leaderboard to anon;
