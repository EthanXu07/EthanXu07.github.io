# Personal website: pixel edition

A static site styled like a small pixel-art game, written in plain HTML, CSS and JavaScript. There's no build step and nothing to install.

## Preview locally

```sh
python3 -m http.server 8000     # then visit http://localhost:8000
```

## Swap your headshot or résumé

Both live in **`site-config.js`**:

| What | How |
|---|---|
| Headshot | Put the new image in `assets/` and change `headshot:`. A transparent PNG (Photoroom) looks best. |
| Résumé | Change `resumeUrl:`. Every Résumé button **and** `yoursite.com/resume` update together. |
| Links | `email`, `github` and `linkedin` are in the same file. |

### Overleaf résumé

The site links to your Overleaf **view-only** link, so it always shows your latest version. In Overleaf, open *Share*, set link access to **anyone with the link can view** (never edit), copy the sharing link, and paste it as `resumeUrl`.

PDFs are git-ignored on purpose, because the résumé includes a phone number.

**`https://ethanxu.dev/resume`** is the link to put on LinkedIn, applications and email signatures. It never changes.

## Edit content

Everything is in `index.html`, grouped by section:
- **World 1 (Player):** stats, bio, inventory (skills)
- **World 2 (Quests):** jobs and research. Copy a `<li class="quest">` to add one; `data-status="active"` or `"done"` controls the badge and filter.
- **World 3 (Loot):** projects, publications, awards
- **World 4 (Save point):** contact

## Deploy with GitHub Pages (free)

1. Create a public repo named `EthanXu07.github.io`.
2. Push this folder:
   ```sh
   git add . && git commit -m "Initial site"
   git remote add origin https://github.com/EthanXu07/EthanXu07.github.io.git
   git push -u origin main
   ```
3. In the repo, go to **Settings → Pages** and choose *Deploy from a branch*: `main` / `/ (root)`.
4. The site goes live at `https://EthanXu07.github.io`, and your résumé at `https://EthanXu07.github.io/resume`.

### Custom domain (optional, about $10–15/yr)

Buy a domain and enter it under **Settings → Pages → Custom domain**. Then add these DNS records:

- `A` records for `@` pointing to `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and `185.199.111.153`
- a `CNAME` record for `www` pointing to `EthanXu07.github.io`

Finally, turn on **Enforce HTTPS**.
