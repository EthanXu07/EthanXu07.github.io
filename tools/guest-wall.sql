-- Guest wall: a shared r/place-style pixel canvas on the library page (guest-wall.js).
-- Run once in the Supabase SQL editor (same project as the leaderboard).
-- 160 x 60 squares, 16 colours. No cooldown: visitors paint freely, in batches,
-- through paint_pixels(). They can read every square but can't write the table directly.
-- Erasing stores colour -1 (blank) instead of deleting, so other visitors' live
-- updates pick it up.
-- To wipe the wall:            delete from public.guest_pixels;
-- To erase an area:            delete from public.guest_pixels where x between 10 and 40 and y between 0 and 20;

create table if not exists public.guest_pixels (
  x smallint not null,
  y smallint not null,
  color smallint not null,
  placed_at timestamptz not null default now(),
  primary key (x, y)
);
alter table public.guest_pixels drop constraint if exists guest_pixels_x_check, drop constraint if exists guest_pixels_y_check, drop constraint if exists guest_pixels_color_check;
alter table public.guest_pixels
  add constraint guest_pixels_x_check check (x between 0 and 159),
  add constraint guest_pixels_y_check check (y between 0 and 59),
  add constraint guest_pixels_color_check check (color between -1 and 15);
create index if not exists guest_pixels_placed_at on public.guest_pixels (placed_at);
alter table public.guest_pixels enable row level security;
drop policy if exists "guest pixels read" on public.guest_pixels;
create policy "guest pixels read" on public.guest_pixels for select to anon using (true);
grant select on public.guest_pixels to anon;

-- Paints up to 2000 squares in one call (xs[i], ys[i]) := cs[i]; cs[i] = -1 erases.
-- If a batch paints the same square twice, the later one wins.
create or replace function public.paint_pixels(xs int[], ys int[], cs int[])
returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := coalesce(array_length(xs, 1), 0);
begin
  if n = 0 or n > 2000 or array_length(ys, 1) is distinct from n or array_length(cs, 1) is distinct from n then
    raise exception 'bad batch' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(xs, ys, cs) as t(x, y, c)
             where x is null or y is null or c is null or x not between 0 and 159 or y not between 0 and 59 or c not between -1 and 15) then
    raise exception 'bad pixel' using errcode = '22023';
  end if;
  insert into guest_pixels (x, y, color, placed_at)
  select distinct on (x, y) x, y, c, clock_timestamp()
  from unnest(xs, ys, cs) with ordinality as t(x, y, c, i)
  order by x, y, i desc
  on conflict (x, y) do update set color = excluded.color, placed_at = excluded.placed_at;
  return n;
end $$;
revoke all on function public.paint_pixels(int[], int[], int[]) from public;
grant execute on function public.paint_pixels(int[], int[], int[]) to anon;

-- Clean up the earlier one-pixel-every-15-seconds version
drop function if exists public.place_pixel(int, int, int);
drop table if exists public.guest_cooldowns;
