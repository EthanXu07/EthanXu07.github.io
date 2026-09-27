# Personal website: pixel edition


## Editing

Pages are built from `src/` by a small script (no dependencies):

```sh
node tools/build.mjs
```

| File | What it controls |
|---|---|
| `src/data/experience.json` | Quest log entries → also the Bonus level, skill tree links and Quick view |
| `src/data/projects.json` | Loot (projects, publications) and trophies |
| `src/data/skills.json` | Skill tree branches. A skill's level = how many quests/projects list it in their `skills` |
| `src/interests.json` | Side quests: one card + one page each, with photos and text |
| `src/pages/*.html` | Page bodies (home, contact, templates) |
| `src/layout.html` | Nav bar, footer and résumé pop-up shared by every game page |
| `src/quick.html` | The plain Quick view page |

Edit, rebuild, then commit the generated `index.html` files along with `src/`.

The guestbook uses [giscus](https://giscus.app): entries are GitHub Discussions on this repo (Announcements → "Guestbook").
