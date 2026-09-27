# Personal website: pixel edition


## Editing

Pages are built from `src/` by a small script (no dependencies):

```sh
node tools/build.mjs
```

- `src/layout.html`: nav bar, footer and résumé pop-up shared by every page
- `src/pages/*.html`: page content (home, quests, loot, contact, interests)
- `src/interests.json`: one entry per interest → its card and its own page, including photos and text

Edit, rebuild, then commit the generated `index.html` files along with `src/`.
