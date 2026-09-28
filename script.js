const SITE = window.SITE || {};
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

// =====================================================================
//  Apply site-config.js (headshot + links)
// =====================================================================
if (SITE.headshot && $('#headshot')) $('#headshot').src = SITE.headshot;
const links = { github: SITE.github, linkedin: SITE.linkedin };
$$('[data-link]').forEach((a) => {
  const url = links[a.dataset.link];
  if (url && a.dataset.link !== 'resume') a.href = url;
});
$('#resumeDownload').href = SITE.resumeFile || '/assets/resume.pdf';
if (SITE.resumeDownloadName) $('#resumeDownload').download = SITE.resumeDownloadName;
if (SITE.email && $('#copyEmail')) {
  $('#copyEmail').dataset.email = SITE.email;
  $('#emailLabel').textContent = SITE.email;
}
$('#year').textContent = new Date().getFullYear();

// Finish the warp-pipe iris opening (the class is added in <head> before first paint)
if (document.documentElement.classList.contains('warp-in')) {
  try { sessionStorage.removeItem('warpIn'); } catch { /* ignore */ }
  setTimeout(() => document.documentElement.classList.remove('warp-in'), 1000);
}

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
  const targets = $$('.world-head, .portrait, .player-info, .level, .quest, .item, .trophies, .interest, .interest-hero, .interest-section, .gallery, .save-box');
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
    $$('.quest').forEach((q) => { q.hidden = f !== 'all' && q.dataset.status !== f && q.dataset.type !== f; });
  });
});

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
    $('#skillLevel').textContent = `${s.branch} · Level ${s.level} / 5 ${'■'.repeat(s.level)}${'□'.repeat(5 - s.level)}`;
    $('#skillHint').textContent = s.used.length
      ? `Used in ${s.used.length} ${s.used.length === 1 ? 'quest or project' : 'quests and projects'}:`
      : 'Not used on a quest yet.';
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
  const top = Object.entries(skills).sort((a, b) => b[1].level - a[1].level)[0];
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
  } else if (e.key.toLowerCase() === 'r' && document.body.dataset.page !== 'play') {
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
//  Save-point campfire
// =====================================================================
(() => {
  const c = $('#fire');
  if (!c) return;
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
