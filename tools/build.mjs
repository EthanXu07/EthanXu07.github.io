#!/usr/bin/env node
// Builds the multi-page site from src/ into the repo root (which GitHub Pages serves).
// No dependencies:   node tools/build.mjs
//
//   src/layout.html           shared nav, footer, résumé pop-up (game pages)
//   src/pages/*.html          page bodies
//   src/data/experience.json  quests (jobs + research)   ┐ one source of truth for the
//   src/data/projects.json    loot (projects + trophies) │ quest log, loot, skill tree,
//   src/data/skills.json      skill tree branches        │ and bonus level
//   src/interests.json        side quests                ┘
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, 'src', p), 'utf8');
const json = (p) => JSON.parse(src(p));
const layout = src('layout.html');
const interests = json('interests.json');
const experience = json('data/experience.json');
const { projects, trophies } = json('data/projects.json');
const { branches } = json('data/skills.json');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// JSON embedded in <script type="application/json">: keep "</script>" from ending the tag
const inlineJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
const fill = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
  if (!(k in vars)) throw new Error(`Missing template variable {{${k}}}`);
  return vars[k];
});
const TRI = '<span class="tri" aria-hidden="true"></span>';
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// ---------------------------------------------------------------- Navigation
// Keys 1–6 follow this order. Contact is the Save Point at the bottom of every page.
const WORLDS = [
  { key: 'home', label: 'Home', href: '/' },
  { key: 'quests', label: 'Quests', href: '/quests/' },
  { key: 'loot', label: 'Loot', href: '/loot/' },
  { key: 'skills', label: 'Skills', href: '/skills/' },
  { key: 'interests', label: 'Interests', href: '/interests/' },
  { key: 'contact', label: 'Contact', href: '#contact' },
];

// 10×10 pixel icons for the nav ('#' = filled). Rendered as crisp SVG in currentColor.
const ICONS = {
  home: ['....##....', '...####...', '..######..', '.########.', '##########', '.########.', '.###..###.', '.##....##.', '.##....##.', '.##....##.'],
  quests: ['.########.', '##......##', '.#.####.#.', '.#......#.', '.#.####.#.', '.#......#.', '.#.###..#.', '.#......#.', '##......##', '.########.'],
  loot: ['..........', '.########.', '#........#', '#........#', '##########', '#...##...#', '#...##...#', '#........#', '##########', '..........'],
  skills: ['....##....', '....##....', '...####...', '##########', '.########.', '..######..', '..######..', '.###..###.', '.##....##.', '##......##'],
  interests: ['..........', '.##....##.', '####..####', '##########', '##########', '.########.', '..######..', '...####...', '....##....', '..........'],
  contact: ['..........', '##########', '##......##', '#.#....#.#', '#..#..#..#', '#...##...#', '#........#', '#........#', '##########', '..........'],
};
const pixelIcon = (rows) => {
  let d = '';
  rows.forEach((row, y) => {
    // Merge horizontal runs into one rect each
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '#') continue;
      let w = 1;
      while (row[x + w] === '#') w++;
      d += `M${x} ${y}h${w}v1h-${w}z`;
      x += w - 1;
    }
  });
  return `<svg class="nav-icon" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
};

const nav = (active) => WORLDS.map((w) => {
  const current = w.key === active;
  return `        <a href="${w.href}" title="${w.label}"${current ? ' class="active" aria-current="page"' : ''}>${pixelIcon(ICONS[w.key])}<span class="nav-label">${w.label}</span></a>`;
}).join('\n');

function page({ out, path, page, title, description, content, sub = true, scripts = '' }) {
  const html = fill(layout, {
    title: esc(title), description: esc(description), path, page,
    nav: nav(page),
    mainClass: sub ? 'subpage' : 'home',
    content,
    contact: src('pages/contact.html'),
    resumeModal: src('pages/_resume-modal.html'),
    scripts,
  });
  write(out, html);
}

function write(out, html) {
  const file = join(ROOT, out);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  console.log(`  ${out}`);
}

// ---------------------------------------------------------------- Skills index
const skillIndex = {};
for (const b of branches) for (const s of b.skills) skillIndex[s.id] = { ...s, branch: b };
const usedIn = Object.fromEntries(Object.keys(skillIndex).map((id) => [id, []]));
for (const q of experience) for (const id of q.skills) {
  if (!usedIn[id]) throw new Error(`experience.json "${q.id}" uses unknown skill "${id}"`);
  usedIn[id].push({ label: q.title, sub: `${q.org} · ${q.when}`, href: `/quests/#quest-${q.id}`, kind: 'Quest' });
}
for (const p of projects) for (const id of p.skills) {
  if (!usedIn[id]) throw new Error(`projects.json "${p.id}" uses unknown skill "${id}"`);
  usedIn[id].push({ label: p.title, sub: p.type, href: `/loot/#loot-${p.id}`, kind: 'Loot' });
}
const level = (id) => Math.min(5, usedIn[id].length);
const skillName = (id) => skillIndex[id].name;

// ---------------------------------------------------------------- Renderers
const renderQuest = (q) => `        <li class="quest px-box paper" id="quest-${q.id}" data-status="${q.status}">
          <div class="quest-top">
            ${q.status === 'active' ? '<span class="badge badge-active">● Active</span>' : '<span class="badge badge-done">★ Complete</span>'}
            <span class="quest-when">${esc(q.when)}</span>
          </div>
          <h3>${esc(q.title)}</h3>
          <p class="quest-org">${esc(q.org)}</p>
          <ul class="quest-list">
${q.bullets.map((b) => `            <li>${b}</li>`).join('\n')}
          </ul>
          <p class="reward"><span>Rewards</span> ${esc(q.rewards)}</p>
        </li>`;

const renderProject = (p) => `        <article class="item px-box" id="loot-${p.id}">
          <div class="item-icon" aria-hidden="true" style="--c:${p.color}">${p.icon}</div>
          <p class="item-type">${esc(p.type)}</p>
          <h3>${esc(p.title)}</h3>
          <p class="item-sub">${esc(p.sub)}</p>
          <p>${p.desc}</p>${p.links.length ? `
          <div class="item-links">
${p.links.map((l) => `            <a class="btn btn-sm ${l.style}" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('\n')}
          </div>` : ''}
        </article>`;

const renderBranch = (b) => `          <section class="branch" style="--c:${b.color}">
            <h2 class="branch-name">${esc(b.name)}</h2>
            <ol class="branch-nodes">
${b.skills.map((s) => {
  const lv = level(s.id);
  return `              <li class="${s.requires ? 'child' : 'root'}">
                <button class="skill-node${lv ? '' : ' locked'}" data-skill="${s.id}" aria-pressed="false">
                  <span class="slot-icon" style="--c:${b.color}">${esc(s.code)}</span>
                  <span class="skill-name">${esc(s.name)}</span>
                  <span class="pips" aria-label="Level ${lv} of 5">${'■'.repeat(lv)}${'□'.repeat(5 - lv)}</span>
                </button>
              </li>`;
}).join('\n')}
            </ol>
          </section>`;

// ---------------------------------------------------------------- Pages
console.log('Building site:');
const DESC = 'Ethan Xu: Computer Science at UC Berkeley. ML research, data pipelines, and projects.';

page({
  out: 'index.html', path: '/', page: 'home', sub: false, title: 'Ethan Xu', description: DESC,
  content: src('pages/home-title.html') + src('pages/home-player.html') + src('pages/home-levels.html'),
  scripts: '  <script src="/home.js"></script>\n',
});

page({
  out: 'quests/index.html', path: '/quests/', page: 'quests', title: 'Quest log · Ethan Xu', description: 'Experience and research: Ethan Xu.',
  content: fill(src('pages/quests.html'), { quests: experience.map(renderQuest).join('\n\n') }),
});

page({
  out: 'loot/index.html', path: '/loot/', page: 'loot', title: 'Loot & trophies · Ethan Xu', description: 'Projects, publications and awards: Ethan Xu.',
  content: fill(src('pages/loot.html'), {
    projects: projects.map(renderProject).join('\n\n'),
    trophies: trophies.map((t) => `        <li><span class="trophy" aria-hidden="true">${t.icon}</span>${esc(t.label)}</li>`).join('\n'),
  }),
});

const skillData = Object.fromEntries(Object.keys(skillIndex).map((id) => [id, { name: skillName(id), branch: skillIndex[id].branch.name, level: level(id), used: usedIn[id] }]));
page({
  out: 'skills/index.html', path: '/skills/', page: 'skills', title: 'Skill tree · Ethan Xu', description: 'Skills Ethan Xu has used on real projects and jobs.',
  content: fill(src('pages/skills.html'), { branches: branches.map(renderBranch).join('\n'), skillData: inlineJson(skillData) }),
});

// Bonus level: quests in chronological order become platforms; their skills become coins
// "?" blocks pop out trophies and project names as fun facts
const levelData = {
  quests: [...experience].sort((a, b) => a.start.localeCompare(b.start)).map((q) => ({
    title: q.title, org: q.org, when: q.when, skills: q.skills.map(skillName),
  })),
  facts: [...trophies.map((t) => t.label), ...projects.map((p) => `${p.title} unlocked`)],
};
page({
  out: 'play/index.html', path: '/play/', page: 'play', title: 'Bonus level · Ethan Xu', description: 'A tiny platformer through Ethan Xu\'s career.',
  content: fill(src('pages/play.html'), { levelData: inlineJson(levelData) }),
  scripts: '  <script src="/play.js"></script>\n',
});

// ---------------------------------------------------------------- Interests
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
              <a class="btn btn-tomato btn-sm" href="/interests/${it.slug}/">View quest ${TRI}</a>
            </div>
          </div>
        </li>`).join('\n');
const chips = [...new Set(interests.map((it) => it.type))]
  .map((t) => `        <button class="chip" data-filter="${slugify(t)}" aria-pressed="false">${esc(t)}</button>`).join('\n');

page({
  out: 'interests/index.html', path: '/interests/', page: 'interests', title: 'Side quests · Ethan Xu', description: 'What Ethan Xu does when he is not coding.',
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
      type: esc(it.type), rewards: esc(it.rewards), objectives: objectivesList(it),
      sections, gallery,
      prevHref: `/interests/${prev.slug}/`, prevTitle: esc(prev.title),
      nextHref: `/interests/${next.slug}/`, nextTitle: esc(next.title),
    }),
  });
});

// Old /contact/ URL → the Save Point section
write('contact/index.html', `<!doctype html><meta charset="utf-8"><title>Contact · Ethan Xu</title>
<meta http-equiv="refresh" content="0; url=/#contact"><link rel="canonical" href="https://ethanxu.dev/#contact">
<a href="/#contact">Contact Ethan Xu</a>
`);

console.log('Done.');
