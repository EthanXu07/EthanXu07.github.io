#!/usr/bin/env node
// Builds the multi-page site from src/ into the repo root (which GitHub Pages serves).
// No dependencies:   node tools/build.mjs
//
//   src/layout.html           shared nav, footer, résumé pop-up (game pages)
//   src/pages/*.html          page bodies
//   src/data/experience.json  experience (jobs + research) ┐ one source of truth for
//   src/data/projects.json    projects + trophies          │ experience, projects and the skill tree
//   src/data/skills.json      skill tree branches        │
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
  { key: 'experience', label: 'Experience', href: '/experience/' },
  { key: 'projects', label: 'Projects', href: '/projects/' },
  { key: 'skills', label: 'Skills', href: '/skills/' },
  { key: 'interests', label: 'Interests', href: '/interests/' },
  { key: 'contact', label: 'Contact', href: '#contact' },
];

// 10×10 pixel icons for the nav ('#' = filled). Rendered as crisp SVG in currentColor.
// 16×16 nav icons. '#' = icon colour, '+' = shaded icon colour, '*' = highlight.
// They use currentColor, so they still turn gold on hover / for the current page.
const ICONS = {
  home: [
    '................',
    '.......##...++..',
    '......####..++..',
    '.....######.++..',
    '....##########..',
    '...############.',
    '..##############',
    '...#++++++++++#.',
    '...#+**++++##+#.',
    '...#+**++++##+#.',
    '...#+++++++##+#.',
    '...#+++++++##+#.',
    '...#+++++++##+#.',
    '...############.',
    '................',
    '................',
  ],
  experience: [
    '................',
    '................',
    '.....######.....',
    '.....#....#.....',
    '.##############.',
    '.#*+++++++++++#.',
    '.#++++++++++++#.',
    '.#++++####++++#.',
    '.######**######.',
    '.#+++++##+++++#.',
    '.#++++++++++++#.',
    '.#++++++++++++#.',
    '.##############.',
    '................',
    '................',
    '................',
  ],
  projects: [
    '................',
    '................',
    '...##########...',
    '..#++++++++++#..',
    '.#++++++++++++#.',
    '.#*+++++++++++#.',
    '.##############.',
    '.#+++++##+++++#.',
    '.#++++#**#++++#.',
    '.#++++#**#++++#.',
    '.#+++++##+++++#.',
    '.#++++++++++++#.',
    '.##############.',
    '................',
    '................',
    '................',
  ],
  skills: [
    '.......##.......',
    '.......##.......',
    '......##++......',
    '......##++......',
    '.....#*#+++.....',
    '########++++++++',
    '.#######+++++++.',
    '..######++++++..',
    '...#####+++++...',
    '...#####+++++...',
    '..######++++++..',
    '..####....++++..',
    '.####......++++.',
    '.##..........++.',
    '................',
    '................',
  ],
  interests: [
    '................',
    '................',
    '..####....####..',
    '.######..######.',
    '##**##########++',
    '##*###########++',
    '##############++',
    '.############++.',
    '..##########++..',
    '...########++...',
    '....######++....',
    '.....####++.....',
    '......##++......',
    '.......++.......',
    '................',
    '................',
  ],
  contact: [
    '................',
    '................',
    '................',
    '.##############.',
    '.##++++++++++##.',
    '.#+#++++++++#+#.',
    '.#++#++++++#++#.',
    '.#+++#++++#+++#.',
    '.#++++#++#++++#.',
    '.#+++++##+++++#.',
    '.#++++++++++++#.',
    '.#++++++++++++#.',
    '.##############.',
    '................',
    '................',
    '................',
  ],
};
for (const [k, rows] of Object.entries(ICONS)) {
  if (rows.length !== 16 || rows.some((r) => r.length !== 16)) throw new Error(`nav icon "${k}" must be 16×16`);
}
const pixelIcon = (rows) => {
  const paths = { '#': '', '+': '', '*': '' };
  rows.forEach((row, y) => {
    // Merge horizontal runs of the same shade into one rect each
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (!(ch in paths)) continue;
      let w = 1;
      while (row[x + w] === ch) w++;
      paths[ch] += `M${x} ${y}h${w}v1h-${w}z`;
      x += w - 1;
    }
  });
  return `<svg class="nav-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">` +
    `<path d="${paths['#']}"/><path d="${paths['+']}" fill-opacity=".55"/><path d="${paths['*']}" fill="#fff8e8" fill-opacity=".9"/></svg>`;
};


// ---------------------------------------------------------------- Contact logos
// 16×16 pixel-art app logos. Each letter maps to a colour; a function colour
// is evaluated per pixel (used for Instagram's gradient).
const igGradient = (x, y) => ['#feda75', '#fa7e1e', '#d62976', '#962fbf', '#4f5bd5'][Math.min(4, Math.floor((x - y + 15) / 6.2))];
const LOGOS = {
  email: { label: 'Email', pal: { D: '#d4553a', P: '#fffaf0' }, rows: [
    '................', '................', 'DDDDDDDDDDDDDDDD', 'DDPPPPPPPPPPPPDD', 'DPDPPPPPPPPPPDPD', 'DPPDPPPPPPPPDPPD',
    'DPPPDPPPPPPDPPPD', 'DPPPPDPPPPDPPPPD', 'DPPPPPDDDDPPPPPD', 'DPPPPPPPPPPPPPPD', 'DPPPPPPPPPPPPPPD', 'DPPPPPPPPPPPPPPD',
    'DPPPPPPPPPPPPPPD', 'DDDDDDDDDDDDDDDD', '................', '................'] },
  linkedin: { label: 'LinkedIn', pal: { B: '#0a66c2', W: '#ffffff' }, rows: [
    '.BBBBBBBBBBBBBB.', 'BBBBBBBBBBBBBBBB', 'BBBBBBBBBBBBBBBB', 'BBBWWBBBBBBBBBBB', 'BBBWWBBBBBBBBBBB', 'BBBBBBBBBBBBBBBB',
    'BBBWWBBWWBWWWBBB', 'BBBWWBBWWWWWWWBB', 'BBBWWBBWWWBBWWBB', 'BBBWWBBWWBBBWWBB', 'BBBWWBBWWBBBWWBB', 'BBBWWBBWWBBBWWBB',
    'BBBWWBBWWBBBWWBB', 'BBBBBBBBBBBBBBBB', 'BBBBBBBBBBBBBBBB', '.BBBBBBBBBBBBBB.'] },
  instagram: { label: 'Instagram', pal: { G: igGradient, W: '#ffffff' }, rows: [
    '..GGGGGGGGGGGG..', '.GGGGGGGGGGGGGG.', 'GGGWWWWWWWWWWGGG', 'GGWGGGGGGGGGGWGG', 'GGWGGGGGGGGWGWGG', 'GGWGGGGWWGGGGWGG',
    'GGWGGGWGGWGGGWGG', 'GGWGGWGGGGWGGWGG', 'GGWGGWGGGGWGGWGG', 'GGWGGGWGGWGGGWGG', 'GGWGGGGWWGGGGWGG', 'GGWGGGGGGGGGGWGG',
    'GGWGGGGGGGGGGWGG', 'GGGWWWWWWWWWWGGG', '.GGGGGGGGGGGGGG.', '..GGGGGGGGGGGG..'] },
  github: { label: 'GitHub', pal: { K: '#181717', W: '#ffffff' }, rows: [
    '.....KKKKKK.....', '...KKKKKKKKKK...', '..KKWKKKKKKWKK..', '.KKKWWKKKKWWKKK.', '.KKKWWWWWWWWKKK.', 'KKKWWWWWWWWWWKKK',
    'KKKWWWWWWWWWWKKK', 'KKKWWWWWWWWWWKKK', 'KKKWWWWWWWWWWKKK', 'KKKKWWWWWWWWKKKK', '.KKKKKWWWWKKKKK.', '.KWKKKWWWWKKKKK.',
    '..KWWWWWWWKKKK..', '...KKKWWWWKKK...', '.....KWWWWK.....', '.....KKKKKK.....'] },
  resume: { label: 'Résumé', pal: { D: '#0f1714', P: '#fffaf0', L: '#d4553a' }, rows: [
    '................', '..DDDDDDDDD.....', '..DPPPPPPPDD....', '..DPPPPPPPDPD...', '..DPPPPPPPDDDD..', '..DPPPPPPPPPPD..',
    '..DPLLLLLLLPPD..', '..DPPPPPPPPPPD..', '..DPLLLLLLLLPD..', '..DPPPPPPPPPPD..', '..DPLLLLLLLLPD..', '..DPPPPPPPPPPD..',
    '..DPLLLLLPPPPD..', '..DPPPPPPPPPPD..', '..DDDDDDDDDDDD..', '................'] },
};
for (const [k, { rows }] of Object.entries(LOGOS)) {
  if (rows.length !== 16 || rows.some((r) => r.length !== 16)) throw new Error(`logo "${k}" must be 16×16`);
}
const logoSvg = (key) => {
  const { pal, rows } = LOGOS[key];
  let rects = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const colour = (c, cx) => (typeof pal[c] === 'function' ? pal[c](cx, y) : pal[c]);
      let w = 1;
      while (row[x + w] === ch && colour(ch, x + w) === colour(ch, x)) w++;
      rects += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${colour(ch, x)}"/>`;
      x += w - 1;
    }
  });
  return `<svg class="contact-logo" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${rects}</svg>`;
};
const contactHtml = fill(src('pages/contact.html'), Object.fromEntries(Object.keys(LOGOS).map((k) => [`logo_${k}`, logoSvg(k)])));

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
    contact: contactHtml,
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
  usedIn[id].push({ label: q.title, sub: `${q.org} · ${q.when}`, href: `/experience/#exp-${q.id}`, kind: 'Experience' });
}
for (const p of projects) for (const id of p.skills) {
  if (!usedIn[id]) throw new Error(`projects.json "${p.id}" uses unknown skill "${id}"`);
  usedIn[id].push({ label: p.title, sub: p.type.replace(/^Project · /, ""), href: `/projects/#project-${p.id}`, kind: 'Project' });
}
const usedBadge = (n) => (n ? `Used ×${n}` : 'On résumé');
const skillName = (id) => skillIndex[id].name;

// ---------------------------------------------------------------- Renderers
const renderQuest = (q) => `        <li class="quest px-box paper" id="exp-${q.id}" data-status="${q.status}">
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

const renderProject = (p) => `        <article class="item px-box" id="project-${p.id}">
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
  const n = usedIn[s.id].length;
  return `              <li class="${s.requires ? 'child' : 'root'}">
                <button class="skill-node${n ? ' used' : ''}" data-skill="${s.id}" aria-pressed="false">
                  <span class="slot-icon" style="--c:${b.color}">${esc(s.code)}</span>
                  <span class="skill-name">${esc(s.name)}</span>
                  <span class="pips">${usedBadge(n)}</span>
                </button>
              </li>`;
}).join('\n')}
            </ol>
          </section>`;

// ---------------------------------------------------------------- Home overview cards
// Each card previews a section with real content, so it stays current as the data changes.
function exploreCards() {
  const shortOrg = (org) => org.split(' · ')[0];
  const allSkills = Object.keys(skillIndex);
  const topSkills = allSkills
    .filter((id) => usedIn[id].length)
    .sort((a, b) => usedIn[b].length - usedIn[a].length || skillName(a).localeCompare(skillName(b)))
    .slice(0, 6);
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const list = (items) => `<ul class="overview-list">${items.map((i) => `<li><strong>${esc(i.title)}</strong><span>${esc(i.sub)}</span>${i.badge ? `<em class="overview-badge">${esc(i.badge)}</em>` : ''}</li>`).join('')}</ul>`;
  const chips = (names) => `<ul class="overview-chips">${names.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
  const more = (shown, total, noun) => (total > shown ? `<p class="overview-more">+ ${plural(total - shown, noun)}</p>` : '');

  const expShown = experience.slice(0, 3);
  const cards = [
    {
      key: 'experience', href: '/experience/', title: 'Experience', count: plural(experience.length, 'role'),
      summary: 'Software engineering, data science and research roles.',
      body: list(expShown.map((q) => ({ title: q.title.split(',')[0], sub: shortOrg(q.org), badge: q.status === 'active' ? 'Current' : '' })))
        + more(expShown.length, experience.length, 'role'),
      link: 'View all experience',
    },
    {
      key: 'projects', href: '/projects/', title: 'Projects', count: plural(projects.length, 'project'),
      summary: 'Research, ML and data projects, plus publications and awards.',
      body: list(projects.map((p) => ({ title: p.title, sub: p.type.replace(/^Project · /, '') }))),
      link: 'View projects',
    },
    {
      key: 'skills', href: '/skills/', title: 'Skills', count: plural(allSkills.length, 'skill'),
      summary: `Grouped into ${plural(branches.length, 'area')} and linked to the work where I used them. Most used:`,
      body: chips(topSkills.map(skillName)),
      link: 'View skills',
    },
    {
      key: 'interests', href: '/interests/', title: 'Interests', count: plural(interests.length, 'interest'),
      summary: 'What I do when I’m not at a keyboard.',
      body: chips(interests.map((i) => i.title)),
      link: 'View interests',
    },
  ];
  return cards.map((c) => `        <li>
          <a class="overview-card px-box" href="${c.href}">
            <span class="overview-head"><span class="overview-icon">${pixelIcon(ICONS[c.key])}</span><strong class="overview-title">${c.title}</strong><span class="overview-count">${c.count}</span></span>
            <span class="overview-summary">${esc(c.summary)}</span>
            ${c.body}
            <span class="overview-link">${c.link} <span aria-hidden="true">→</span></span>
          </a>
        </li>`).join('\n');
}

// ---------------------------------------------------------------- Pages
console.log('Building site:');
const DESC = 'Ethan Xu: Computer Science at UC Berkeley. ML research, data pipelines, and projects.';

page({
  out: 'index.html', path: '/', page: 'home', sub: false, title: 'Ethan Xu', description: DESC,
  content: src('pages/home-title.html') + src('pages/home-player.html') + fill(src('pages/home-levels.html'), { exploreCards: exploreCards() }),
  scripts: '  <script src="/home.js"></script>\n',
});

page({
  out: 'experience/index.html', path: '/experience/', page: 'experience', title: 'Experience · Ethan Xu', description: 'Experience and research: Ethan Xu.',
  content: fill(src('pages/experience.html'), { experience: experience.map(renderQuest).join('\n\n') }),
});

page({
  out: 'projects/index.html', path: '/projects/', page: 'projects', title: 'Projects · Ethan Xu', description: 'Projects, publications and awards: Ethan Xu.',
  content: fill(src('pages/projects.html'), {
    projects: projects.map(renderProject).join('\n\n'),
    trophies: trophies.map((t) => `        <li><span class="trophy" aria-hidden="true">${t.icon}</span>${esc(t.label)}</li>`).join('\n'),
  }),
});

const skillData = Object.fromEntries(Object.keys(skillIndex).map((id) => [id, { name: skillName(id), branch: skillIndex[id].branch.name, used: usedIn[id] }]));
page({
  out: 'skills/index.html', path: '/skills/', page: 'skills', title: 'Skill tree · Ethan Xu', description: 'Skills Ethan Xu has used on real projects and jobs.',
  content: fill(src('pages/skills.html'), { branches: branches.map(renderBranch).join('\n'), skillData: inlineJson(skillData) }),
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

// Old URLs → new ones (old #quest-x / #loot-x anchors map to #exp-x / #project-x)
const redirect = (from, to, anchorFrom, anchorTo) => write(`${from}/index.html`, `<!doctype html><meta charset="utf-8"><title>Moved · Ethan Xu</title>
<link rel="canonical" href="https://ethanxu.dev/${to}/">
<script>location.replace('/${to}/' + location.hash.replace('#${anchorFrom}-', '#${anchorTo}-'));</script>
<noscript><meta http-equiv="refresh" content="0; url=/${to}/"></noscript>
<a href="/${to}/">This page moved to /${to}/</a>
`);
redirect('quests', 'experience', 'quest', 'exp');
redirect('loot', 'projects', 'loot', 'project');

// Old /contact/ URL → the Save Point section
write('contact/index.html', `<!doctype html><meta charset="utf-8"><title>Contact · Ethan Xu</title>
<meta http-equiv="refresh" content="0; url=/#contact"><link rel="canonical" href="https://ethanxu.dev/#contact">
<a href="/#contact">Contact Ethan Xu</a>
`);

console.log('Done.');
