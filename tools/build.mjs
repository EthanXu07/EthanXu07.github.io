#!/usr/bin/env node
// Builds the multi-page site from src/ into the repo root (which GitHub Pages serves).
// No dependencies:   node tools/build.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, 'src', p), 'utf8');
const layout = src('layout.html');
const interests = JSON.parse(src('interests.json'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fill = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
  if (!(k in vars)) throw new Error(`Missing template variable {{${k}}}`);
  return vars[k];
});

// The five "worlds" in the HUD, in order. Keys 1–5 jump between them.
const WORLDS = [
  { key: 'home', label: 'Home', href: '/' },
  { key: 'quests', label: 'Quests', href: '/quests/' },
  { key: 'loot', label: 'Loot', href: '/loot/' },
  { key: 'interests', label: 'Interests', href: '/interests/' },
  // Contact isn't a page: it's the Save Point at the bottom of every page
  { key: 'contact', label: 'Contact', href: '#contact' },
];

function nav(active) {
  return WORLDS.map((w, i) => {
    const current = w.key === active;
    return `        <a href="${w.href}"${current ? ' class="active" aria-current="page"' : ''}><span class="key" aria-hidden="true">${i + 1}</span>${w.label}</a>`;
  }).join('\n');
}

function page({ out, path, page, title, description, content, sub = true }) {
  const html = fill(layout, {
    title: esc(title),
    description: esc(description),
    path,
    page,
    nav: nav(page),
    contact: src('pages/contact.html'),
    mainClass: sub ? 'subpage' : 'home',
    content,
    resumeModal: src('pages/_resume-modal.html'),
  });
  const file = join(ROOT, out);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  console.log(`  ${out}`);
}

const DESC = 'Ethan Xu: Computer Science at UC Berkeley. ML research, data pipelines, and projects.';

console.log('Building site:');

page({
  out: 'index.html', path: '/', page: 'home', sub: false,
  title: 'Ethan Xu', description: DESC,
  content: src('pages/home-title.html') + src('pages/home-player.html') + src('pages/home-levels.html'),
});

page({ out: 'quests/index.html', path: '/quests/', page: 'quests', title: 'Quest log · Ethan Xu', description: 'Experience and research: Ethan Xu.', content: src('pages/quests.html') });
page({ out: 'loot/index.html', path: '/loot/', page: 'loot', title: 'Loot & trophies · Ethan Xu', description: 'Projects, publications and awards: Ethan Xu.', content: src('pages/loot.html') });
// Old /contact/ URL → the Save Point section
mkdirSync(join(ROOT, 'contact'), { recursive: true });
writeFileSync(join(ROOT, 'contact/index.html'), `<!doctype html><meta charset="utf-8"><title>Contact · Ethan Xu</title>
<meta http-equiv="refresh" content="0; url=/#contact"><link rel="canonical" href="https://ethanxu.dev/#contact">
<a href="/#contact">Contact Ethan Xu</a>
`);
console.log('  contact/index.html (redirect)');

// ---------- Interests hub + one page per interest ----------
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const objectivesList = (it) => it.objectives.map((o) => `              <li>${esc(o)}</li>`).join('\n');

const cards = interests.map((it, i) => `        <li class="quest side-quest px-box paper" data-type="${slugify(it.type)}">
          <a class="side-quest-photo" href="/interests/${it.slug}/" tabindex="-1" aria-hidden="true">
            <img src="${esc(it.photo)}" alt="" loading="lazy" width="400" height="300">
          </a>
          <div class="side-quest-body">
            <div class="quest-top">
              <span class="badge badge-active">● Ongoing</span>
              <span class="quest-when">Side quest ${i + 1} · ${esc(it.type)}</span>
            </div>
            <h3><a href="/interests/${it.slug}/">${esc(it.title)}</a></h3>
            <p class="quest-org">${esc(it.tagline)}</p>
            <p class="objectives-label">Objectives</p>
            <ul class="quest-list">
${objectivesList(it)}
            </ul>
            <div class="side-quest-foot">
              <p class="reward"><span>Rewards</span> ${esc(it.rewards)}</p>
              <a class="btn btn-tomato btn-sm" href="/interests/${it.slug}/">View quest <span class="tri" aria-hidden="true"></span></a>
            </div>
          </div>
        </li>`).join('\n');

const chips = [...new Set(interests.map((it) => it.type))]
  .map((t) => `        <button class="chip" data-filter="${slugify(t)}" aria-pressed="false">${esc(t)}</button>`).join('\n');

page({
  out: 'interests/index.html', path: '/interests/', page: 'interests',
  title: 'Side quests · Ethan Xu', description: 'What Ethan Xu does when he is not coding.',
  content: fill(src('pages/interests.html'), { cards, chips }),
});

const interestTpl = src('pages/interest.html');
interests.forEach((it, i) => {
  const prev = interests[(i - 1 + interests.length) % interests.length];
  const next = interests[(i + 1) % interests.length];
  const sections = it.sections.map((s) => `        <section class="interest-section px-box">
          <h2>${esc(s.heading)}</h2>
          ${s.body ? `<p>${esc(s.body)}</p>` : `<p class="placeholder-note">✎ ${esc(s.placeholder)}</p>`}
        </section>`).join('\n');
  const gallery = it.gallery.map((g, n) =>
    `        <img src="${esc(g)}" alt="${esc(it.title)} photo ${n + 1}" loading="lazy" width="400" height="300">`).join('\n');
  page({
    out: `interests/${it.slug}/index.html`, path: `/interests/${it.slug}/`, page: 'interests',
    title: `${it.title} · Side quests · Ethan Xu`, description: `${it.title}: ${it.tagline}`,
    content: fill(interestTpl, {
      num: String(i + 1), total: String(interests.length),
      title: esc(it.title), tagline: esc(it.tagline), photo: esc(it.photo),
      sections, gallery,
      type: esc(it.type), rewards: esc(it.rewards), objectives: objectivesList(it),
      prevHref: `/interests/${prev.slug}/`, prevTitle: esc(prev.title),
      nextHref: `/interests/${next.slug}/`, nextTitle: esc(next.title),
    }),
  });
});

console.log('Done.');
