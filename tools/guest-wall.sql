-- Guest wall: a shared r/place-style pixel canvas on the library page (guest-wall.js).
-- Run once in the Supabase SQL editor (same project as the leaderboard).
-- Visitors can read every pixel but can only place one through place_pixel(),
-- which enforces a per-visitor cooldown (keyed by IP address).
-- To wipe the wall:            delete from public.guest_pixels;
-- To erase an area (x 10–20):  delete from public.guest_pixels where x between 10 and 20;

create table if not exists public.guest_pixels (
  x smallint not null check (x between 0 and 63),
  y smallint not null check (y between 0 and 23),
  color smallint not null check (color between 0 and 15),
  placed_at timestamptz not null default now(),
  primary key (x, y)
);
create index if not exists guest_pixels_placed_at on public.guest_pixels (placed_at);
alter table public.guest_pixels enable row level security;
drop policy if exists "guest pixels read" on public.guest_pixels;
create policy "guest pixels read" on public.guest_pixels for select to anon using (true);
grant select on public.guest_pixels to anon;

-- Last placement per visitor. RLS on with no policies: only place_pixel() can touch it.
create table if not exists public.guest_cooldowns (
  visitor text primary key,
  last_at timestamptz not null
);
alter table public.guest_cooldowns enable row level security;

-- Places a pixel and returns the cooldown in seconds; raises 'cooldown N' if the
-- visitor has to wait N more seconds.
create or replace function public.place_pixel(px int, py int, pcolor int)
returns int
language plpgsql security definer set search_path = public as $$
declare
  wait_s constant int := 15;
  hdrs json := coalesce(nullif(current_setting('request.headers', true), '')::json, '{}'::json);
  who text := coalesce(nullif(hdrs->>'cf-connecting-ip', ''), nullif(trim(split_part(hdrs->>'x-forwarded-for', ',', 1)), ''), 'unknown');
  prev timestamptz;
begin
  if px is null or py is null or pcolor is null or px not between 0 and 63 or py not between 0 and 23 or pcolor not between 0 and 15 then
    raise exception 'bad pixel' using errcode = '22023';
  end if;
  select last_at into prev from guest_cooldowns where visitor = who for update;
  if prev is not null and prev > now() - make_interval(secs => wait_s) then
    raise exception 'cooldown %', ceil(extract(epoch from prev + make_interval(secs => wait_s) - now()))::int;
  end if;
  insert into guest_pixels (x, y, color, placed_at) values (px, py, pcolor, clock_timestamp())
    on conflict (x, y) do update set color = excluded.color, placed_at = excluded.placed_at;
  insert into guest_cooldowns (visitor, last_at) values (who, now())
    on conflict (visitor) do update set last_at = excluded.last_at;
  return wait_s;
end $$;

revoke all on function public.place_pixel(int, int, int) from public;
grant execute on function public.place_pixel(int, int, int) to anon;
