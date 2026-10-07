const SITE = window.SITE || {};
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

// =====================================================================
//  Apply site-config.js (headshot + links)
// =====================================================================
if (SITE.headshot && $('#headshot')) $('#headshot').src = SITE.headshot;
const links = { github: SITE.github, linkedin: SITE.linkedin, instagram: SITE.instagram };
$$('[data-link]').forEach((a) => {
  const url = links[a.dataset.link];
  if (url && a.dataset.link !== 'resume') a.href = url;
  if (a.dataset.link === 'instagram') (a.closest('li') || a).hidden = !url;
  // Show the handle under each contact row, e.g. "@ethan_xu__"
  const handle = a.querySelector('[data-handle]');
  if (handle && url) {
    const tail = url.replace(/\/+$/, '').split('/').pop();
    handle.textContent = { linkedin: `in/${tail}`, instagram: `@${tail}` }[a.dataset.link] || tail;
  }
});
$('#resumeDownload').href = SITE.resumeFile || '/assets/resume.pdf';
if (SITE.resumeDownloadName) $('#resumeDownload').download = SITE.resumeDownloadName;
if (SITE.email && $('#copyEmail')) {
  $('#copyEmail').dataset.email = SITE.email;
  $('#emailLabel').replaceChildren(...SITE.email.split('@').flatMap((part, i) => (i ? [document.createElement('wbr'), '@' + part] : [part])));
}
$('#year').textContent = new Date().getFullYear();

// =====================================================================
//  Pixel sprite helpers
// =====================================================================
const PALETTE = {
  h: '#1a1414', // hair
  s: '#f0c8a0', // skin
  e: '#1a1414', // eyes
  m: '#c77a5a', // mouth
  b: '#3b5a8c', // Berkeley-blue hoodie
  g: '#e8a93a', // gold stripe
  p: '#2a2a35', // pants
  k: '#0f1714', // shoes
};
const HEAD = [
  '...hhhhh....',
  '..hhhhhhhh..',
  '..hhhhhhhhh.',
  '..hssssshh..',
  '..sesssess..',
  '..ssssssss..',
  '...ssmmss...',
  '....ssss....',
  '..bbbbbbbb..',
  '.bbbbggbbbb.',
  '.sbbbggbbbs.',
  '.sbbbbbbbbs.',
  '..bbbbbbbb..',
];
const SPRITE = {
  stand: [...HEAD, '..ppp..ppp..', '..ppp..ppp..', '.kkkk..kkkk.'],
  walk: [...HEAD, '..ppp.ppp...', '.ppp...ppp..', '.kkk....kkk.'],
};

function drawSprite(ctx, rows, x, y, flip = false) {
  const w = rows[0].length;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < w; c++) {
      const ch = rows[r][flip ? w - 1 - c : c];
      if (ch === '.') continue;
      ctx.fillStyle = PALETTE[ch];
      ctx.fillRect(Math.round(x) + c, Math.round(y) + r, 1, 1);
    }
  }
}

// =====================================================================
//  Title-screen dialog (typewriter)
// =====================================================================
(() => {
  const el = $('#dialogText');
  if (!el) return;
  const text = "Hey, I'm Ethan. I study CS at Berkeley, build ML models, scrape messy data, and write research papers about what I find.";
  if (reduceMotion) { el.textContent = text; return; }
  let i = 0;
  const tick = () => {
    el.textContent = text.slice(0, ++i);
    if (i < text.length) timer = setTimeout(tick, text[i - 1] === '.' ? 260 : 26);
  };
  let timer = setTimeout(tick, 600);
  $('.dialog').addEventListener('click', () => { clearTimeout(timer); el.textContent = text; });
})();

// =====================================================================
//  XP bar + level map: the sprite walks down the track as you scroll,
//  raising a flag at each checkpoint (every [data-checkpoint] section)
// =====================================================================
(() => {
  const fill = $('#xpFill');
  const track = $('.track');
  const heroCanvas = $('#trackHero');
  const hctx = heroCanvas?.getContext('2d');
  const checkpoints = $$('[data-checkpoint]');
  const flags = checkpoints.map((section) => {
    const flag = document.createElement('a');
    flag.className = 'track-flag';
    flag.title = section.dataset.checkpoint;
    flag.tabIndex = -1;
    flag.addEventListener('click', () => section.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }));
    track?.insertBefore(flag, heroCanvas);
    return flag;
  });
  let walkFrame = 0;
  let lastY = window.scrollY;
  let idleTimer;

  const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const drawHero = (frame) => {
    if (!hctx) return;
    hctx.clearRect(0, 0, 12, 16);
    drawSprite(hctx, frame ? SPRITE.walk : SPRITE.stand, 0, 0);
  };

  function update() {
    const p = Math.min(1, window.scrollY / maxScroll());
    fill.style.width = `${p * 100}%`;
    if (!track || getComputedStyle(track).display === 'none') return;

    const h = track.clientHeight;
    heroCanvas.style.top = `${p * h}px`;
    checkpoints.forEach((section, i) => {
      const at = Math.min(1, Math.max(0, (section.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.3) / maxScroll()));
      flags[i].style.top = `${at * h}px`;
      flags[i].classList.toggle('reached', p >= at - 0.001);
    });
    // Alternate legs while scrolling; stand still when you stop
    if (Math.abs(window.scrollY - lastY) > 24) {
      walkFrame ^= 1;
      lastY = window.scrollY;
      drawHero(walkFrame);
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => drawHero(0), 180);
  }

  drawHero(0);
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  window.addEventListener('load', update);
  update();
})();

// =====================================================================
//  Stepped reveal on scroll
// =====================================================================
(() => {
  const targets = $$('.world-head, .portrait, .player-info, .overview-card, .quest, .item, .trophies, .interest, .interest-hero, .interest-section, .gallery, .bookcase, .toc-page, .save-box');
  if (reduceMotion || !('IntersectionObserver' in window)) return;
  targets.forEach((el) => el.classList.add('reveal'));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }
  }, { threshold: 0.12 });
  targets.forEach((el) => io.observe(el));
})();

// =====================================================================
//  Experience / library filters
// =====================================================================
$$('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const f = chip.dataset.filter;
    $$('.chip').forEach((c) => { c.classList.toggle('is-on', c === chip); c.setAttribute('aria-pressed', c === chip); });
    $$('.quest, .book').forEach((q) => { q.hidden = f !== 'all' && q.dataset.status !== f && q.dataset.type !== f; });
    // an open book whose spine was just filtered off the shelf goes back
    const out = $('.book.is-out');
    if (out && out.hidden) out.querySelector('[data-book]').click();
  });
});

// =====================================================================
//  Library: clicking a spine pulls the book off the shelf and opens it
//  below. Without JS the spines are plain links to each volume's page.
// =====================================================================
(() => {
  const spines = $$('[data-book]');
  if (!spines.length) return;
  const hint = $('#shelfHint');
  let openSlug = null;

  function close(focusSpine) {
    if (!openSlug) return;
    const spine = $(`[data-book="${openSlug}"]`);
    $(`#book-${openSlug}`).hidden = true;
    spine.setAttribute('aria-expanded', 'false');
    spine.closest('.book').classList.remove('is-out');
    if (focusSpine) spine.focus();
    openSlug = null;
    if (hint) hint.hidden = false;
  }

  function open(slug) {
    close(false);
    const spine = $(`[data-book="${slug}"]`);
    const book = $(`#book-${slug}`);
    book.hidden = false;
    spine.setAttribute('aria-expanded', 'true');
    spine.closest('.book').classList.add('is-out');
    openSlug = slug;
    if (hint) hint.hidden = true;
    book.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  }

  spines.forEach((spine) => spine.addEventListener('click', (e) => {
    e.preventDefault();
    if (openSlug === spine.dataset.book) close(false);
    else open(spine.dataset.book);
  }));
  $$('[data-close-book]').forEach((btn) => btn.addEventListener('click', () => close(true)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openSlug) close(true); });
})();

// =====================================================================
//  Skill tree: pick a node to see where the skill was used
// =====================================================================
(() => {
  const dataEl = $('#skillData');
  if (!dataEl) return;
  const skills = JSON.parse(dataEl.textContent);
  const nodes = $$('.skill-node');
  const panel = $('#skillPanel');

  function select(id, scroll) {
    const s = skills[id];
    if (!s) return;
    nodes.forEach((n) => n.setAttribute('aria-pressed', String(n.dataset.skill === id)));
    $('#skillName').textContent = s.name;
    $('#skillLevel').textContent = s.branch;
    $('#skillHint').textContent = s.used.length
      ? `Used in ${s.used.length} ${s.used.length === 1 ? 'role or project' : 'roles and projects'}:`
      : 'Listed on my résumé. Not tied to a role or project on this site yet.';
    const list = $('#skillUsed');
    list.replaceChildren(...s.used.map((u) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = u.href;
      a.textContent = u.label;
      const small = document.createElement('small');
      small.textContent = ` ${u.kind} · ${u.sub}`;
      li.append(a, small);
      return li;
    }));
    // On narrow screens the panel sits below the tree: bring it into view
    if (scroll && panel.getBoundingClientRect().top > window.innerHeight * 0.6) {
      panel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
    }
  }

  nodes.forEach((n) => n.addEventListener('click', () => select(n.dataset.skill, true)));
  // Start on the most-used skill
  const top = Object.entries(skills).sort((a, b) => b[1].used.length - a[1].used.length)[0];
  if (top) select(top[0], false);
})();

// =====================================================================
//  Toast + copy email
// =====================================================================
const toastEl = $('#toast');
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

$('#copyEmail')?.addEventListener('click', async (e) => {
  const email = e.currentTarget.dataset.email;
  try {
    await navigator.clipboard.writeText(email);
    $('#copyTag').textContent = 'Copied';
    toast('★ Email copied!');
    setTimeout(() => { $('#copyTag').textContent = 'Copy'; }, 1800);
  } catch (err) {
    window.location.href = `mailto:${email}`;
  }
});

// =====================================================================
//  Résumé preview pop-up: preview first, download only if they choose
// =====================================================================
const resumeModal = $('#resumeModal');
let resumeRendered = false;
function openResume() {
  if (!resumeModal.showModal) { location.href = '/resume/'; return; }
  resumeModal.showModal();
  document.body.style.overflow = 'hidden';
  if (!resumeRendered) {
    resumeRendered = true;
    window.ResumeViewer.render($('#resumePages'), SITE.resumeFile || '/assets/resume.pdf');
  }
}
$$('[data-link="resume"]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); openResume(); }));
$('#resumeClose').addEventListener('click', () => resumeModal.close());
resumeModal.addEventListener('close', () => { document.body.style.overflow = ''; });
resumeModal.addEventListener('click', (e) => { if (e.target === resumeModal) resumeModal.close(); });

// =====================================================================
//  Keyboard shortcuts: 1–5 switch pages, 6 jumps to contact, R opens the résumé
// =====================================================================
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || resumeModal.open || e.target.closest?.('input, textarea, select')) return;
  const link = $$('.hud-nav a')[Number(e.key) - 1];
  if (/^[1-6]$/.test(e.key) && link) {
    location.href = link.href;
  } else if (e.key.toLowerCase() === 'r') {
    openResume();
  }
});

// =====================================================================
//  Headshot "materializes" from big pixels the first time it's seen
// =====================================================================
(() => {
  const img = $('#headshot');
  const box = $('.portrait-bg');
  if (!img || !box) return;
  if (reduceMotion || !('IntersectionObserver' in window)) return;

  function play() {
    const cw = box.clientWidth, ch = box.clientHeight;
    if (!img.naturalWidth || !cw) return;
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    // Reproduce object-fit: cover; object-position: center top
    const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    const dx = (cw - dw) / 2;
    const small = document.createElement('canvas');
    const sg = small.getContext('2d');
    box.appendChild(c);
    img.style.visibility = 'hidden';
    const steps = [32, 20, 12, 7, 4, 2];
    let i = 0;
    const step = () => {
      if (i >= steps.length) { c.remove(); img.style.visibility = ''; return; }
      const b = steps[i++];
      small.width = Math.ceil(cw / b); small.height = Math.ceil(ch / b);
      sg.clearRect(0, 0, small.width, small.height);
      sg.drawImage(img, dx / b, 0, dw / b, dh / b);
      g.clearRect(0, 0, cw, ch);
      g.drawImage(small, 0, 0, small.width * b, small.height * b);
      setTimeout(step, 110);
    };
    step();
  }

  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    if (img.complete) play(); else img.addEventListener('load', play, { once: true });
  }, { threshold: 0.4 });
  io.observe(box);
})();

// =====================================================================
//  Save-point campfire: me roasting a marshmallow by the fire, a tent,
//  pines and a night sky. 72×44 canvas, scaled up with pixelated CSS.
// =====================================================================
(() => {
  const c = $('#fire');
  if (!c) return;
  const g = c.getContext('2d');
  const W = c.width, H = c.height, GROUND = 32;
  const FLAME = ['#fff1b8', '#f3c969', '#e8a93a', '#d4553a', '#9c3423'];
  const FIRE_X = 36, FIRE_Y = 35;
  const px = (x, y, col, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const line = (x0, y0, x1, y1, col, t = 1) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) px(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), col, t, t);
  };
  const STARS = [[4, 3], [11, 8], [17, 2], [24, 6], [30, 3], [38, 9], [44, 4], [49, 11], [55, 2], [66, 10], [69, 3], [8, 14], [27, 12], [41, 15]];
  const sparks = [];
  let frame = 0;

  function sky() {
    for (let y = 0; y < GROUND; y++) {
      const t = y / GROUND;
      px(0, y, `rgb(${Math.round(14 + t * 20)},${Math.round(24 + t * 26)},${Math.round(36 + t * 20)})`, W, 1);
    }
    STARS.forEach(([x, y], i) => px(x, y, (frame + i * 7) % 23 < 2 ? '#5b6f78' : '#f1e6cc'));
    // Crescent moon
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
      if (x * x + y * y <= 10 && (x - 2) ** 2 + (y + 1) ** 2 > 7) px(60 + x, 7 + y, '#f3e7c4');
    }
  }
  function pine(x, base, h) {
    px(x, base - 2, '#2a1c14', 1, 2);
    for (let i = 0; i < h; i++) { const w = Math.floor((i * 5) / h) + 1; px(x - w + 1, base - 2 - h + i, '#12201a', w * 2 - 1, 1); }
  }
  function ground() {
    px(0, GROUND, '#24382a', W, H - GROUND);
    px(0, GROUND, '#2f4a34', W, 1);
    [[3, 36], [14, 41], [23, 38], [46, 42], [52, 38], [66, 40], [8, 42], [30, 42]].forEach(([x, y]) => { px(x, y, '#3d5e3f'); px(x + 1, y - 1, '#3d5e3f'); px(x + 2, y, '#3d5e3f'); });
  }
  function tent() {
    for (let y = 22; y <= 35; y++) {
      const hw = Math.round((y - 22) * 0.85);
      px(60 - hw, y, '#b8894f', hw, 1);          // shaded side
      px(60, y, '#d9ae6c', hw + 1, 1);          // lit side
      if (y >= 27) { const dw = Math.round((y - 27) * 0.55); px(60 - dw, y, '#2b1d14', dw * 2 + 1, 1); } // door
    }
    line(60, 20, 60, 22, '#6b4630');           // pole tip
    px(59, 21, '#d4553a', 1, 1);               // pennant
    px(58, 21, '#d4553a', 1, 1);
  }
  function glow(strength) {
    const r = g.createRadialGradient(FIRE_X, FIRE_Y - 3, 1, FIRE_X, FIRE_Y - 3, 22);
    r.addColorStop(0, `rgba(243,169,58,${strength})`);
    r.addColorStop(1, 'rgba(243,169,58,0)');
    g.fillStyle = r; g.fillRect(0, 0, W, H);
  }
  function stones() {
    [[28, 36], [31, 37], [35, 38], [39, 37], [42, 36], [29, 34], [43, 34]].forEach(([x, y]) => { px(x, y, '#6f7470', 2, 2); px(x, y, '#9aa09a'); });
  }
  function logs() {
    line(30, 36, 41, 32, '#5a3a26', 2);
    line(31, 32, 42, 36, '#6b4630', 2);
    px(30, 36, '#c9a66b'); px(42, 36, '#c9a66b');
  }
  function flames() {
    for (let x = FIRE_X - 5; x <= FIRE_X + 5; x++) {
      const mid = 5.5 - Math.abs(x - FIRE_X);
      const h = Math.max(1, Math.round(mid * 1.9 + Math.random() * 3.5));
      for (let y = 0; y < h; y++) {
        const k = Math.min(FLAME.length - 1, Math.floor(((h - y) / h) * FLAME.length * 0.95));
        px(x, FIRE_Y - 2 - y, FLAME[FLAME.length - 1 - k]);
      }
    }
  }
  function camper() {
    // Seat log
    px(9, 33, '#5a3a26', 16, 3); px(9, 33, '#6b4630', 16, 1); px(9, 33, '#c9a66b', 1, 3); px(24, 33, '#c9a66b', 1, 3);
    // Me: head + hoodie from the site sprite, blinking now and then
    const blink = frame % 38 === 0;
    const rows = HEAD.map((r) => (blink ? r.replace(/e/g, 's') : r));
    drawSprite(g, rows, 11, 20);
    drawSprite(g, ['..pppppppp..', '..ppp..ppp..', '..ppp..ppp..', '.kkkk..kkkk.'], 11, 33);
    // Roasting stick + marshmallow (toasts over time)
    line(22, 30, 29, 25, '#8a5a3a');
    const toast = Math.min(3, Math.floor(frame / 40) % 4);
    px(29, 23, ['#fffaf0', '#f5dfb0', '#d9a066', '#8a5a3a'][toast], 3, 3);
    px(29, 23, '#fffaf0');
  }
  function updateSparks() {
    if (Math.random() > 0.45) sparks.push({ x: FIRE_X - 3 + Math.random() * 6, y: FIRE_Y - 8, vx: Math.random() * 0.6 - 0.3, life: 10 + Math.random() * 10 });
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx; s.y -= 0.9; s.life--;
      if (s.life <= 0 || s.y < 2) { sparks.splice(i, 1); continue; }
      px(Math.round(s.x), Math.round(s.y), s.life > 8 ? '#f3c969' : '#d4553a');
    }
  }
  function smoke() {
    for (let i = 0; i < 4; i++) {
      const y = ((frame * 0.5 + i * 5) % 20);
      const x = FIRE_X + Math.round(Math.sin((frame + i * 9) / 6) * 1.5 + y * 0.25);
      g.fillStyle = `rgba(185,179,156,${0.28 * (1 - y / 20)})`;
      g.fillRect(x, FIRE_Y - 14 - y, 2, 1);
    }
  }
  function draw() {
    frame++;
    sky();
    pine(4, GROUND + 1, 13); pine(47, GROUND + 1, 10); pine(69, GROUND + 1, 14);
    ground();
    tent();
    glow(0.2 + Math.random() * 0.08);
    stones();
    logs();
    camper();
    smoke();
    flames();
    updateSparks();
  }
  draw();
  if (!reduceMotion) setInterval(draw, 120);
})();
