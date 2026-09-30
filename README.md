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
| `src/interests.json` | Side quests: one card + one page each, with photos and text |
| `src/pages/*.html` | Page bodies (home, contact, templates) |
| `src/layout.html` | Nav bar, footer and résumé pop-up shared by every game page |
| `card/index.html` | 🔥 Secret business card (hand-written, not generated). Reached by clearing the title-screen level and walking past the castle to the campfire, or directly at `/card/`. Links come from `site-config.js` |

Edit, rebuild, then commit the generated `index.html` files along with `src/`.

