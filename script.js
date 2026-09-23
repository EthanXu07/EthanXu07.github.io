const SITE = window.SITE || {};
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

// =====================================================================
//  Apply site-config.js (headshot + links)
// =====================================================================
if (SITE.headshot) $('#headshot').src = SITE.headshot;
const links = { github: SITE.github, linkedin: SITE.linkedin };
$$('[data-link]').forEach((a) => {
  const url = links[a.dataset.link];
  if (url && a.dataset.link !== 'resume') a.href = url;
});
$('#resumeDownload').href = SITE.resumeFile || 'assets/resume.pdf';
if (SITE.resumeDownloadName) $('#resumeDownload').download = SITE.resumeDownloadName;
if (SITE.email) {
  $('#copyEmail').dataset.email = SITE.email;
  $('#emailLabel').textContent = SITE.email;
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
//  Scroll: XP bar, active nav, side-track sprite
// =====================================================================
(() => {
  const fill = $('#xpFill');
  const sections = ['player', 'quests', 'loot', 'save'].map((id) => document.getElementById(id));
  const navLinks = $$('.hud-nav a');
  const track = $('.track');
  const flags = $$('.track-flag');
  const heroCanvas = $('#trackHero');
  const hctx = heroCanvas.getContext('2d');
  let walkFrame = 0;
  let lastY = window.scrollY;
  let idleTimer;

  function maxScroll() { return Math.max(1, document.documentElement.scrollHeight - window.innerHeight); }
  function sectionProgress(s) { return Math.min(1, Math.max(0, (s.offsetTop - window.innerHeight * 0.3) / maxScroll())); }

  function drawTrackHero(frame) {
    hctx.clearRect(0, 0, 12, 16);
    drawSprite(hctx, frame ? SPRITE.walk : SPRITE.stand, 0, 0);
  }

  function update() {
    const p = Math.min(1, window.scrollY / maxScroll());
    fill.style.width = `${p * 100}%`;

    // Active section = last one whose top has passed 40% of the viewport
    let current = null;
    for (const s of sections) if (s.getBoundingClientRect().top < window.innerHeight * 0.4) current = s.id;
    navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${current}`));

    if (track && getComputedStyle(track).display !== 'none') {
      const h = track.clientHeight;
      heroCanvas.style.top = `${p * h}px`;
      flags.forEach((f) => {
        const fp = sectionProgress(document.getElementById(f.dataset.for));
        f.style.top = `${fp * h}px`;
        f.classList.toggle('reached', p >= fp - 0.001);
      });
      if (Math.abs(window.scrollY - lastY) > 24) {
        walkFrame ^= 1;
        lastY = window.scrollY;
        drawTrackHero(walkFrame);
      }
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => drawTrackHero(0), 180);
    }
  }

  drawTrackHero(0);
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  window.addEventListener('load', update);
  update();
})();

// =====================================================================
//  Stepped reveal on scroll
// =====================================================================
(() => {
  const targets = $$('.world-head, .portrait, .player-info, .quest, .item, .trophies, .save-box');
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
//  Quest filter
// =====================================================================
$$('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const f = chip.dataset.filter;
    $$('.chip').forEach((c) => { c.classList.toggle('is-on', c === chip); c.setAttribute('aria-pressed', c === chip); });
    $$('.quest').forEach((q) => { q.hidden = f !== 'all' && q.dataset.status !== f; });
  });
});

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

$('#copyEmail').addEventListener('click', async (e) => {
  const email = e.currentTarget.dataset.email;
  try {
    await navigator.clipboard.writeText(email);
    $('#copyTag').textContent = 'copied';
    toast('★ Email copied!');
    setTimeout(() => { $('#copyTag').textContent = 'copy'; }, 1800);
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
  if (!resumeModal.showModal) { location.href = 'resume/'; return; }
  resumeModal.showModal();
  document.body.style.overflow = 'hidden';
  if (!resumeRendered) {
    resumeRendered = true;
    window.ResumeViewer.render($('#resumePages'), SITE.resumeFile || 'assets/resume.pdf');
  }
}
$$('[data-link="resume"]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); openResume(); }));
$('#resumeClose').addEventListener('click', () => resumeModal.close());
resumeModal.addEventListener('close', () => { document.body.style.overflow = ''; });
resumeModal.addEventListener('click', (e) => { if (e.target === resumeModal) resumeModal.close(); });

// =====================================================================
//  Keyboard shortcuts: 1–4 warp to sections, R opens the résumé
// =====================================================================
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || resumeModal.open || e.target.matches('input, textarea, select')) return;
  const ids = { 1: 'player', 2: 'quests', 3: 'loot', 4: 'save' };
  if (ids[e.key]) {
    document.getElementById(ids[e.key]).scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  } else if (e.key.toLowerCase() === 'r') {
    openResume();
  }
});

// =====================================================================
//  Title scene: dusk over the Berkeley hills
// =====================================================================
(() => {
  const canvas = $('#scene');
  const ctx = canvas.getContext('2d');
  const section = $('.title-screen');
  let W, H, groundY, horizonY, bg, clouds, stars, flies;
  let hero = { x: 0, y: 0, vy: 0, dir: 1, frame: 0, pause: 0 };
  let t = 0;
  let running = true;

  const SKY = ['#22303f', '#2b3f50', '#3b5263', '#5d6670', '#96766c', '#c98b6b', '#e6ad74'];

  function hills(x, amp, base, f1, f2, seed) {
    return base - amp * (0.6 + 0.4 * Math.sin(x * f1 + seed) * Math.sin(x * f2 + seed * 2.3) + 0.25 * Math.sin(x * f1 * 3.1 + seed));
  }

  function buildBackground() {
    bg = document.createElement('canvas');
    bg.width = W; bg.height = H;
    const g = bg.getContext('2d');

    // Banded sky with 2-row dithering between bands
    const band = horizonY / SKY.length;
    for (let y = 0; y < horizonY; y++) {
      const i = Math.min(SKY.length - 1, Math.floor(y / band));
      const edge = (i + 1) * band - y;
      for (let x = 0; x < W; x++) {
        const next = SKY[Math.min(SKY.length - 1, i + 1)];
        g.fillStyle = edge < 2 && (x + y) % 2 === 0 ? next : SKY[i];
        g.fillRect(x, y, 1, 1);
      }
    }

    // Pixel sun
    const sx = Math.round(W * 0.74), sy = Math.round(horizonY - H * 0.06), sr = Math.max(8, Math.round(Math.min(W, H) * 0.08));
    for (let y = -sr; y <= sr; y++) for (let x = -sr; x <= sr; x++) {
      if (x * x + y * y <= sr * sr) {
        g.fillStyle = (y > sr * 0.35 && (y % 3 === 0)) ? '#e6ad74' : '#f3c969';
        g.fillRect(sx + x, sy + y, 1, 1);
      }
    }

    // Far mountains, mid hills, near hills
    const layers = [
      { c: '#5a6269', amp: H * 0.18, base: horizonY + 4, f1: 0.021, f2: 0.047, s: 1.3 },
      { c: '#3d5a4c', amp: H * 0.11, base: horizonY + 14, f1: 0.034, f2: 0.061, s: 4.1 },
      { c: '#2c4638', amp: H * 0.07, base: groundY, f1: 0.05, f2: 0.083, s: 7.7 },
    ];
    const tops = [];
    layers.forEach((L, li) => {
      tops[li] = [];
      g.fillStyle = L.c;
      for (let x = 0; x < W; x++) {
        const top = Math.round(hills(x, L.amp, L.base, L.f1, L.f2, L.s));
        tops[li][x] = top;
        g.fillRect(x, top, 1, groundY - top + 1);
      }
      // Snowless highlight on far ridge
      if (li === 0) {
        g.fillStyle = '#6d747a';
        for (let x = 0; x < W; x++) g.fillRect(x, tops[0][x], 1, 1);
      }
    });

    // Sather Tower (the Campanile) on the mid hills
    const tx = Math.round(W * 0.18);
    const tBase = tops[1][tx + 3];
    const tH = Math.round(Math.min(H * 0.28, 60));
    g.fillStyle = '#d9cbb0'; g.fillRect(tx, tBase - tH, 7, tH);
    g.fillStyle = '#b3a488'; g.fillRect(tx + 5, tBase - tH, 2, tH);
    g.fillStyle = '#2a1f1a'; g.fillRect(tx + 2, tBase - tH + 3, 3, 4);           // belfry opening
    g.fillStyle = '#e8a93a'; g.fillRect(tx + 3, tBase - tH + 10, 1, 1);          // clock
    g.fillStyle = '#6f9a8a';                                                       // copper roof
    for (let i = 0; i < 6; i++) g.fillRect(tx + Math.floor(i / 2), tBase - tH - 1 - i, 7 - Math.floor(i / 2) * 2, 1);
    g.fillRect(tx + 3, tBase - tH - 8, 1, 2);

    // Pines on near hills
    g.fillStyle = '#1f3a2d';
    for (let x = 6; x < W; x += 9 + ((x * 7) % 11)) {
      if (Math.abs(x - W * 0.5) < W * 0.12) continue;
      const base = tops[2][x];
      const h = 8 + (x * 13) % 7;
      for (let i = 0; i < h; i++) {
        const half = Math.floor(i / 2.2);
        g.fillRect(x - half, base - h + i, half * 2 + 1, 1);
      }
      g.fillStyle = '#4a2f20'; g.fillRect(x, base, 1, 2); g.fillStyle = '#1f3a2d';
    }

    // Ground: grass lip + dirt with pebbles
    g.fillStyle = '#7aa35a'; g.fillRect(0, groundY, W, 2);
    g.fillStyle = '#5c8a44'; g.fillRect(0, groundY + 2, W, 2);
    for (let x = 0; x < W; x += 3) { g.fillStyle = '#7aa35a'; g.fillRect(x, groundY + 4, 1, (x * 5) % 3 === 0 ? 2 : 1); }
    g.fillStyle = '#8a5a3c'; g.fillRect(0, groundY + 4, W, H - groundY);
    g.fillStyle = '#6b4630';
    for (let i = 0; i < W / 3; i++) g.fillRect((i * 37) % W, groundY + 6 + ((i * 17) % Math.max(1, H - groundY - 6)), 2, 1);
  }

  function resize() {
    const cssW = section.clientWidth, cssH = section.clientHeight;
    const scale = Math.max(3, Math.round(cssW / 280));
    W = Math.ceil(cssW / scale); H = Math.ceil(cssH / scale);
    canvas.width = W; canvas.height = H;
    groundY = H - Math.max(12, Math.round(H * 0.1));
    horizonY = Math.round(H * 0.72);
    buildBackground();
    clouds = Array.from({ length: Math.ceil(W / 70) }, (_, i) => ({ x: (i * 97) % W, y: 8 + ((i * 29) % Math.round(H * 0.35)), w: 12 + ((i * 11) % 14), v: 0.03 + (i % 3) * 0.015 }));
    stars = Array.from({ length: Math.ceil(W / 6) }, (_, i) => ({ x: (i * 53) % W, y: (i * 31) % Math.round(horizonY * 0.4), p: i * 0.7 }));
    flies = Array.from({ length: 10 }, (_, i) => ({ x: (i * 41) % W, y: groundY - 4 - (i * 7) % 18, p: i }));
    hero.x = Math.round(W * 0.2); hero.y = groundY - 16;
  }

  function drawCloud(c) {
    const x = Math.round(c.x), y = Math.round(c.y), w = c.w;
    ctx.fillStyle = '#e9c9a8';
    ctx.fillRect(x, y + 2, w, 3);
    ctx.fillRect(x + 2, y, Math.round(w * 0.45), 2);
    ctx.fillRect(x + Math.round(w * 0.4), y - 1, Math.round(w * 0.35), 3);
    ctx.fillStyle = '#c99f86';
    ctx.fillRect(x + 1, y + 4, w - 2, 1);
  }

  function frame() {
    t++;
    ctx.drawImage(bg, 0, 0);

    for (const s of stars) {
      if (Math.sin(t * 0.03 + s.p) > 0.2) { ctx.fillStyle = '#f1e6cc'; ctx.fillRect(s.x, s.y, 1, 1); }
    }
    for (const c of clouds) {
      c.x += c.v;
      if (c.x > W + 4) c.x = -c.w - 4;
      drawCloud(c);
    }
    for (const f of flies) {
      const on = Math.sin(t * 0.05 + f.p) > 0.3;
      if (!on) continue;
      ctx.fillStyle = '#f3c969';
      ctx.fillRect(Math.round(f.x + Math.sin(t * 0.01 + f.p) * 6), Math.round(f.y + Math.cos(t * 0.013 + f.p) * 3), 1, 1);
    }

    // Hero wanders the ground, pausing now and then; click to jump
    const floor = groundY - 16;
    if (hero.pause > 0) hero.pause--;
    else {
      hero.x += 0.25 * hero.dir;
      if (hero.x < 4 || hero.x > W - 16) { hero.dir *= -1; hero.pause = 60; }
      if (t % 400 === 0) hero.pause = 90;
    }
    hero.vy += 0.12;
    hero.y = Math.min(floor, hero.y + hero.vy);
    if (hero.y >= floor) hero.vy = 0;
    const walking = hero.pause === 0 && hero.y >= floor;
    const f = walking && Math.floor(t / 10) % 2 ? SPRITE.walk : SPRITE.stand;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(Math.round(hero.x) + 2, groundY, 8, 1);
    drawSprite(ctx, f, hero.x, hero.y, hero.dir < 0);

    if (running && !reduceMotion) requestAnimationFrame(frame);
  }

  canvas.addEventListener('click', () => { if (hero.y >= groundY - 16) hero.vy = -2.4; });

  new IntersectionObserver(([e]) => {
    const was = running;
    running = e.isIntersecting;
    if (running && !was && !reduceMotion) requestAnimationFrame(frame);
  }).observe(section);

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resize(); if (reduceMotion) frame(); }, 120);
  });

  resize();
  frame();
})();

// =====================================================================
//  Headshot "materializes" from big pixels the first time it's seen
// =====================================================================
(() => {
  const img = $('#headshot');
  const box = $('.portrait-bg');
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
//  Save-point campfire
// =====================================================================
(() => {
  const c = $('#fire');
  const g = c.getContext('2d');
  const FLAME = ['#f3c969', '#e8a93a', '#d4553a', '#9c3423'];
  function draw() {
    g.clearRect(0, 0, 16, 16);
    // Logs
    g.fillStyle = '#6b4630'; g.fillRect(3, 13, 10, 2);
    g.fillStyle = '#4a2f20'; g.fillRect(2, 14, 3, 2); g.fillRect(11, 14, 3, 2);
    // Flames: taller in the middle, randomly flickering
    for (let x = 4; x < 12; x++) {
      const mid = 4 - Math.abs(x - 7.5);
      const h = Math.max(1, Math.round(mid * 2.2 + Math.random() * 3));
      for (let y = 0; y < h; y++) {
        const k = Math.min(FLAME.length - 1, Math.floor((y / h) * FLAME.length));
        g.fillStyle = FLAME[k];
        g.fillRect(x, 12 - y, 1, 1);
      }
    }
    // Sparks
    if (Math.random() > 0.5) { g.fillStyle = '#f3c969'; g.fillRect(5 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 3), 1, 1); }
  }
  draw();
  if (!reduceMotion) setInterval(draw, 140);
})();
