-- =====================================================================
--  Pixel wall (ethanxu.dev/guestbook): a shared r/place-style canvas.
--  Paste this whole file into Supabase → SQL Editor → Run. Safe to re-run.
--
--  Security model
--   * Anyone (anon key, no login) can READ the pixels.
--   * Nobody can write to the tables directly (RLS on, no write policies).
--   * The only way to paint is place_pixel(), which checks bounds + palette
--     and enforces a per-visitor cooldown on the server.
-- =====================================================================

create table if not exists public.pixels (
  x          smallint not null check (x between 0 and 63),
  y          smallint not null check (y between 0 and 63),
  color      smallint not null check (color between 0 and 15),
  updated_at timestamptz not null default now(),
  primary key (x, y)
);
create index if not exists pixels_updated_at_idx on public.pixels (updated_at);

create table if not exists public.pixel_cooldowns (
  visitor text primary key,
  last_at timestamptz not null
);

alter table public.pixels enable row level security;
alter table public.pixel_cooldowns enable row level security;

drop policy if exists "Anyone can view the wall" on public.pixels;
create policy "Anyone can view the wall" on public.pixels for select using (true);
-- (no insert/update/delete policies, and none at all on pixel_cooldowns)

revoke insert, update, delete, truncate on public.pixels from anon, authenticated;
revoke all on public.pixel_cooldowns from anon, authenticated;

create or replace function public.place_pixel(px int, py int, pc int)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  headers json := coalesce(current_setting('request.headers', true), '{}')::json;
  visitor_id text := coalesce(
    headers->>'cf-connecting-ip',
    headers->>'x-real-ip',
    split_part(headers->>'x-forwarded-for', ',', 1),
    'unknown');
  last_time timestamptz;
  placed_at timestamptz := now();
begin
  if px not between 0 and 63 or py not between 0 and 63 then
    raise exception 'out_of_bounds';
  end if;
  if pc not between 0 and 15 then
    raise exception 'bad_color';
  end if;

  select last_at into last_time from pixel_cooldowns where visitor = visitor_id for update;
  if last_time is not null and placed_at - last_time < interval '5 seconds' then
    raise exception 'cooldown';
  end if;

  insert into pixel_cooldowns (visitor, last_at) values (visitor_id, placed_at)
    on conflict (visitor) do update set last_at = excluded.last_at;

  insert into pixels (x, y, color, updated_at) values (px, py, pc, placed_at)
    on conflict (x, y) do update set color = excluded.color, updated_at = excluded.updated_at;

  return placed_at;
end;
$$;

revoke all on function public.place_pixel(int, int, int) from public;
grant execute on function public.place_pixel(int, int, int) to anon, authenticated;

-- Optional housekeeping: forget old cooldown rows
-- delete from public.pixel_cooldowns where last_at < now() - interval '1 day';
