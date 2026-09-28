-- =====================================================================
--  Pixel wall (ethanxu.dev/guestbook): a shared 128×128 r/place-style canvas.
--  Paste this whole file into Supabase → SQL Editor → Run. Safe to re-run.
--
--  How it works
--   * Anyone (anon key, no login) can READ the pixels.
--   * Nobody can write to the tables directly (RLS on, no write policies).
--   * The only way to paint is place_pixels(), which takes a batch of pixels,
--     checks bounds + palette, and applies a generous anti-bot cap
--     (600 pixels per minute per visitor). No cooldown for normal painting.
-- =====================================================================

-- Start fresh if an older version of the wall exists (64×64 / cooldown era)
drop function if exists public.place_pixel(int, int, int);
drop table if exists public.pixel_cooldowns;
do $$ begin
  if to_regclass('public.pixels') is not null then
    alter table public.pixels drop constraint if exists pixels_x_check, drop constraint if exists pixels_y_check;
  end if;
end $$;

create table if not exists public.pixels (
  x          smallint not null,
  y          smallint not null,
  color      smallint not null check (color between 0 and 15),
  updated_at timestamptz not null default now(),
  primary key (x, y)
);
alter table public.pixels drop constraint if exists pixels_bounds;
alter table public.pixels add constraint pixels_bounds check (x between 0 and 127 and y between 0 and 127);
create index if not exists pixels_updated_at_idx on public.pixels (updated_at);

-- Per-visitor pixel counter for the anti-bot cap (one row per visitor)
create table if not exists public.pixel_rate (
  visitor      text primary key,
  window_start timestamptz not null,
  painted      int not null
);

alter table public.pixels enable row level security;
alter table public.pixel_rate enable row level security;

drop policy if exists "Anyone can view the wall" on public.pixels;
create policy "Anyone can view the wall" on public.pixels for select using (true);
-- (no insert/update/delete policies, and none at all on pixel_rate)

revoke insert, update, delete, truncate on public.pixels from anon, authenticated;
revoke all on public.pixel_rate from anon, authenticated;

-- items: JSON array of [x, y, color] triples, e.g. [[3,4,6],[3,5,6]]
create or replace function public.place_pixels(items jsonb)
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
  n int;
  rate record;
  placed_at timestamptz := clock_timestamp();
begin
  if jsonb_typeof(items) <> 'array' then raise exception 'bad_request'; end if;
  n := jsonb_array_length(items);
  if n = 0 then return placed_at; end if;
  if n > 500 then raise exception 'batch_too_large'; end if;

  -- Validate every triple before writing anything
  if exists (
    select 1 from jsonb_array_elements(items) e
    where jsonb_typeof(e) <> 'array' or jsonb_array_length(e) <> 3
       or (e->>0)::int not between 0 and 127
       or (e->>1)::int not between 0 and 127
       or (e->>2)::int not between 0 and 15
  ) then
    raise exception 'bad_pixel';
  end if;

  -- Anti-bot cap: 600 pixels per rolling minute per visitor
  select * into rate from pixel_rate where visitor = visitor_id for update;
  if not found or placed_at - rate.window_start > interval '1 minute' then
    insert into pixel_rate (visitor, window_start, painted) values (visitor_id, placed_at, n)
      on conflict (visitor) do update set window_start = excluded.window_start, painted = excluded.painted;
  elsif rate.painted + n > 600 then
    raise exception 'slow_down';
  else
    update pixel_rate set painted = painted + n where visitor = visitor_id;
  end if;

  -- Last write wins for duplicate coordinates within the batch
  insert into pixels (x, y, color, updated_at)
  select distinct on (x, y) x, y, c, placed_at
  from (
    select (e->>0)::int as x, (e->>1)::int as y, (e->>2)::int as c, ord
    from jsonb_array_elements(items) with ordinality as t(e, ord)
  ) s
  order by x, y, ord desc
  on conflict (x, y) do update set color = excluded.color, updated_at = excluded.updated_at;

  return placed_at;
end;
$$;

revoke all on function public.place_pixels(jsonb) from public;
grant execute on function public.place_pixels(jsonb) to anon, authenticated;

-- Optional housekeeping: forget old rate rows
-- delete from public.pixel_rate where window_start < now() - interval '1 day';
