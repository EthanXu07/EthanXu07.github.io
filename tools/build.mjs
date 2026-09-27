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
  { key: 'contact', label: 'Contact', href: '/contact/' },
];

function nav(active) {
  return WORLDS.map((w, i) => {
    const current = w.key === active;
    return `        <a href="${w.href}"${current ? ' class="active" aria-current="page"' : ''}><span class="key" aria-hidden="true">${i + 1}</span>${w.label}</a>`;
  }).join('\n');
}

function track(active) {
  const idx = WORLDS.findIndex((w) => w.key === active);
  const pct = (i) => ((i / (WORLDS.length - 1)) * 100).toFixed(2);
  const flags = WORLDS.map((w, i) =>
    `    <a class="track-flag${i <= idx ? ' reached' : ''}" href="${w.href}" style="top:${pct(i)}%" title="${w.label}" aria-label="${w.label}"${i === idx ? ' aria-current="page"' : ''}></a>`);
  flags.push(`    <canvas class="track-hero" id="trackHero" width="12" height="16" style="top:${pct(idx)}%" aria-hidden="true"></canvas>`);
  return flags.join('\n');
}

function page({ out, path, page, title, description, content, sub = true }) {
  const html = fill(layout, {
    title: esc(title),
    description: esc(description),
    path,
    page,
    nav: nav(page),
    track: track(page),
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
page({ out: 'contact/index.html', path: '/contact/', page: 'contact', title: 'Save point · Ethan Xu', description: 'Get in touch with Ethan Xu.', content: src('pages/contact.html') });

// ---------- Interests hub + one page per interest ----------
const cards = interests.map((it, i) => `        <li>
          <a class="interest px-box" href="/interests/${it.slug}/">
            <img class="interest-photo" src="${esc(it.photo)}" alt="${esc(it.title)}" loading="lazy" width="400" height="300">
            <p class="interest-tag">Side quest ${i + 1}</p>
            <h3>${esc(it.title)}</h3>
            <p>${esc(it.tagline)}</p>
            <span class="interest-enter">Enter ▸</span>
          </a>
        </li>`).join('\n');

page({
  out: 'interests/index.html', path: '/interests/', page: 'interests',
  title: 'Side quests · Ethan Xu', description: 'What Ethan Xu does when he is not coding.',
  content: fill(src('pages/interests.html'), { cards }),
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
      prevHref: `/interests/${prev.slug}/`, prevTitle: esc(prev.title),
      nextHref: `/interests/${next.slug}/`, nextTitle: esc(next.title),
    }),
  });
});

console.log('Done.');
