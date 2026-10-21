# Personal website: pixel edition


## Editing

Pages are built from `src/` by a small script (no dependencies):

```sh
node tools/build.mjs
```

| File | What it controls |
|---|---|
| `src/data/experience.json` | Experience entries → also the skill tree links |
| `src/data/projects.json` | Projects, publications and trophies |
| `src/data/skills.json` | Skill tree branches (mirrors the résumé's Technical Skills + a Specialties branch). "Used ×N" = how many experience entries/projects list it in their `skills`; the rest show "On résumé" |
| `src/interests.json` | The library: one book spine, open book and page per interest. `call` is the Dewey Decimal call number, `spine` the book colour, `description` the paragraph shown in the open book and on the page. `photo` / `gallery` currently point to generic stock photos in `assets/interests/photos/` (CC0 / public domain, see `CREDITS.md`). Swap in your own photos by replacing those files or changing the paths. An optional `favorites` list (see Webnovels & anime) shows in the open book on the library page: add a line to add a title |
| `src/data/on-hold.json` | The "Up next" pile of books on the bottom shelf of the library bookcase: one per hobby to pick up next (shown as one line under the shelf when the pile has no room). The brass plaque on the base (volumes, sections, last shelved) is computed at build time |
| `src/pages/*.html` | Page bodies (home, contact, templates) |
| `src/layout.html` | Nav bar, footer and résumé pop-up shared by every game page |
| `leaderboard.js` + `tools/leaderboard.sql` | Title-screen game leaderboard (speedrun time + high score). Until `SITE.supabase` in `site-config.js` has a Supabase URL + anon key, scores are only saved in each visitor's browser. To make it global: create a free Supabase project, run `tools/leaderboard.sql` in its SQL editor, then paste the Project URL and anon key into `site-config.js` |
| `guest-wall.js` + `tools/guest-wall.sql` | Guest wall on the library page: a shared r/place-style 160×60 pixel canvas between the bookcase and the desk. Click or drag to paint, eraser, brush sizes 1/2/4, no cooldown; live for every visitor. Wipe it with `delete from public.guest_pixels;` in the Supabase SQL editor, or an area with `... where x between 10 and 40 and y between 0 and 20` |
| `card/index.html` | 🔥 Secret business card (hand-written, not generated). Reached by clearing the title-screen level and walking past the castle to the campfire, or directly at `/card/`. Links come from `site-config.js` |

Edit, rebuild, then commit the generated `index.html` files along with `src/`.

