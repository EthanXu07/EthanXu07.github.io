// =====================================================================
//  Title screen: a side-scrolling explorer level.
//  Walk right from the Campanile past warp pipes (one per page; stand on
//  one and press ↓ to enter), bump "?" blocks for facts, collect coins,
//  and reach the castle flag for the Save Point. When play starts, the
//  name + bio card slides into the corner.
//  Uses drawSprite / SPRITE from script.js.
// =====================================================================
(() => {
  const canvas = document.getElementById('scene');
  const section = document.getElementById('titleScreen');
  if (!canvas || !section) return;
  const ctx = canvas.getContext('2d');
  const { pipes: pipeData, facts } = JSON.parse(document.getElementById('homeLevel').textContent);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const prompt = {
    el: document.getElementById('explorePrompt'),
    label: document.getElementById('exploreLabel'),
    title: document.getElementById('exploreTitle'),
    desc: document.getElementById('exploreDesc'),
    go: document.getElementById('exploreGo'),
  };

  const PW = 10;
  const PH = 16;
  const JUMP_V = -4.9;
  const GRAVITY = 0.28;

  // ---------- Viewport (logical pixels are scaled up; ground sits near the bottom) ----------
  let W = 320, H = 200, G = 176, scale = 4;
  function resize() {
    const cw = section.clientWidth, ch = section.clientHeight;
    scale = Math.max(2, Math.min(6, Math.round(Math.min(cw / 260, ch / 200))));
    W = Math.ceil(cw / scale);
    H = Math.ceil(ch / scale);
    G = H - Math.ceil(24 / scale) - 2; // stand just above the dirt strip
    canvas.width = W;
    canvas.height = H;
  }

  // ---------- World (x in logical px; y relative to the ground line G) ----------
  const START_X = 70;
  const PIPE_GAP = 190;
  const FIRST_PIPE = 330;
  const pipeHeights = [22, 28, 34];
  const pipes = pipeData.map((d, i) => ({ ...d, x: FIRST_PIPE + i * PIPE_GAP, w: 22, h: pipeHeights[i % 3] }));
  const FLAG_X = FIRST_PIPE + pipes.length * PIPE_GAP + 40;
  const CASTLE_X = FLAG_X + 70;
  const WORLD_W = CASTLE_X + 110;

  // A brick row with a "?" in the middle between each pair of landmarks
  const rowXs = [170, ...pipes.map((pp) => pp.x + 88)];
  const blocks = [];
  const bricks = [];
  rowXs.forEach((x, i) => {
    bricks.push({ x, dy: 40 });
    blocks.push({ x: x + 12, dy: 40, used: false, bump: 0, fact: facts[i % facts.length] });
    bricks.push({ x: x + 24, dy: 40 });
  });
  const coins = [];
  rowXs.forEach((x) => {
    for (let k = 0; k < 3; k++) coins.push({ x: x + 6 + k * 12, dy: 54, taken: false });        // above the row
    for (let k = 0; k < 2; k++) coins.push({ x: x - 34 + k * 12, dy: 12, taken: false });       // on the ground
  });

  // Solids in world space (computed each frame because G depends on the viewport)
  const rect = (x, dy, w, h) => ({ x, y: G - dy, w, h });
  const solidList = () => [
    ...bricks.map((b) => ({ ...rect(b.x, b.dy, 12, 12), kind: 'brick' })),
    ...blocks.map((b) => ({ ...rect(b.x, b.dy, 12, 12), kind: 'block', ref: b })),
    ...pipes.map((pp) => ({ ...rect(pp.x, pp.h, pp.w, pp.h), kind: 'pipe', ref: pp })),
  ];

  // ---------- State ----------
  const keys = { left: false, right: false, jump: false, down: false };
  const p = { x: START_X, y: 0, vx: 0, vy: 0, dir: 1, onGround: true, jumpHeld: false };
  let cam = 0, t = 0, playing = false, entering = null, finished = false, finishT = 0, popups = [], particles = [], stars = [], clouds = [];
  let near = null;
  let coinsTaken = 0;

  function seedSky() {
    stars = Array.from({ length: 60 }, (_, i) => ({ x: (i * 97) % 900, y: 6 + ((i * 53) % 70), p: i * 0.7 }));
    clouds = Array.from({ length: 9 }, (_, i) => ({ x: i * 160 + ((i * 37) % 60), y: 24 + ((i * 29) % 50), w: 14 + ((i * 11) % 16) }));
  }

  // ---------- Start / corner card ----------
  function start() {
    if (playing) return;
    playing = true;
    // Slide the name + bio card from the center into the corner (FLIP animation)
    const card = section.querySelector('.title-inner');
    const from = card.getBoundingClientRect();
    section.classList.add('playing');
    const to = card.getBoundingClientRect();
    if (!reduceMotion && card.animate && to.width) {
      card.animate([
        { transformOrigin: 'top left', transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})` },
        { transformOrigin: 'top left', transform: 'none' },
      ], { duration: 480, easing: 'steps(8, end)' });
    }
  }
  document.getElementById('pressStart')?.addEventListener('click', (e) => {
    e.preventDefault();
    start();
    canvas.focus?.();
  });

  // ---------- Input ----------
  const KEYMAP = {
    ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
    ' ': 'jump', ArrowUp: 'jump', w: 'jump', W: 'jump', ArrowDown: 'down', s: 'down', S: 'down',
  };
  const inView = () => { const r = section.getBoundingClientRect(); return r.bottom > window.innerHeight * 0.35 && r.top < window.innerHeight * 0.5; };
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select, dialog')) return;
    const k = KEYMAP[e.key];
    if (!k || !inView()) return;
    if (e.target.closest?.('a, button') && (e.key === ' ' || e.key === 'Enter')) return; // let focused links/buttons work
    e.preventDefault();
    keys[k] = true;
    if (k !== 'down') start();
  });
  window.addEventListener('keyup', (e) => { const k = KEYMAP[e.key]; if (k) keys[k] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); start(); keys.jump = true; });
  canvas.addEventListener('pointerup', () => { keys.jump = false; });
  canvas.addEventListener('pointerleave', () => { keys.jump = false; });
  section.querySelectorAll('.explore-pad button').forEach((b) => {
    const k = b.dataset.key;
    const on = (e) => { e.preventDefault(); start(); keys[k] = true; };
    const off = (e) => { e.preventDefault(); keys[k] = false; };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('pointercancel', off);
  });

  const popup = (x, y, text, life = 80, big = false) => popups.push({ x, y, text, life, big });
  const burst = (x, y, color, n = 8) => {
    for (let i = 0; i < n; i++) particles.push({ x, y, vx: Math.cos((i / n) * 6.283) * 1.1, vy: Math.sin((i / n) * 6.283) * 1.1 - 1, life: 22, color });
  };
  const overlaps = (a, b) => a.x < b.x + b.w && a.x + PW > b.x && a.y < b.y + b.h && a.y + PH > b.y;

  // ---------- Prompt (pipe or castle) ----------
  function showPrompt(target) {
    if (target === near) return;
    near = target;
    if (!target) { prompt.el.hidden = true; return; }
    if (target === 'castle') {
      prompt.label.textContent = 'Save point';
      prompt.title.textContent = 'You made it!';
      prompt.desc.textContent = 'Thanks for exploring. Want to get in touch?';
      prompt.go.href = '#contact';
      prompt.go.firstChild.textContent = 'Contact ';
    } else {
      prompt.label.textContent = 'Warp pipe · press ↓ on top';
      prompt.title.textContent = target.label;
      prompt.desc.textContent = target.desc;
      prompt.go.href = target.href;
      prompt.go.firstChild.textContent = 'Enter ';
    }
    prompt.el.hidden = false;
  }

  // ---------- Update ----------
  function step() {
    t++;
    particles.forEach((q) => { q.x += q.vx; q.y += q.vy; q.vy += 0.1; q.life--; });
    particles = particles.filter((q) => q.life > 0);
    popups.forEach((pp) => { pp.life--; pp.y -= 0.3; });
    popups = popups.filter((pp) => pp.life > 0);
    blocks.forEach((b) => { if (b.bump > 0) b.bump--; });
    clouds.forEach((c) => { c.x += 0.05; });

    // Sinking into a pipe → go to that page
    if (entering) {
      p.y += 0.8;
      if (--entering.frames <= 0) { window.location.href = entering.href; entering.frames = Infinity; }
      return;
    }

    if (!playing) {
      // Idle: breathe on the spot until someone presses start
      p.y = G - PH;
      return;
    }

    const accel = p.onGround ? 0.22 : 0.15;
    if (keys.left && !keys.right) { p.vx -= accel; p.dir = -1; }
    else if (keys.right && !keys.left) { p.vx += accel; p.dir = 1; }
    else p.vx *= p.onGround ? 0.75 : 0.95;
    p.vx = Math.max(-2, Math.min(2, p.vx));
    if (Math.abs(p.vx) < 0.02) p.vx = 0;

    const solids = solidList();
    p.x += p.vx;
    for (const s of solids) if (overlaps(p, s)) { p.x = p.vx > 0 ? s.x - PW : s.x + s.w; p.vx = 0; }
    p.x = Math.max(0, Math.min(WORLD_W - PW, p.x));

    if (keys.jump && p.onGround && !p.jumpHeld) { p.vy = JUMP_V; p.onGround = false; }
    p.jumpHeld = keys.jump;
    if (!keys.jump && p.vy < -1.8) p.vy = -1.8;
    p.vy = Math.min(p.vy + GRAVITY, 6);

    p.y += p.vy;
    p.onGround = false;
    let standingOn = null;
    for (const s of solids) {
      if (!overlaps(p, s)) continue;
      if (p.vy > 0) {
        p.y = s.y - PH; p.onGround = true; standingOn = s;
      } else {
        p.y = s.y + s.h;
        if (s.kind === 'block' && !s.ref.used) {
          s.ref.used = true;
          s.ref.bump = 8;
          burst(s.x + 6, s.y, '#f3c969', 10);
          popup(s.x + 6, s.y - 8, `★ ${s.ref.fact}`, 170, true);
        } else if (s.kind !== 'pipe') {
          if (s.kind === 'brick') burst(s.x + 6, s.y, '#b5835a', 4);
        }
      }
      p.vy = 0;
    }
    if (p.y + PH >= G) { p.y = G - PH; p.vy = 0; p.onGround = true; }

    for (const c of coins) {
      if (c.taken) continue;
      if (Math.abs(p.x + PW / 2 - c.x) < 8 && Math.abs(p.y + PH / 2 - (G - c.dy)) < 11) {
        c.taken = true;
        coinsTaken++;
        popup(c.x, G - c.dy - 6, '+1', 40);
      }
    }

    // Near a pipe? Near the flag?
    const pipeNear = pipes.find((pp) => p.x + PW > pp.x - 16 && p.x < pp.x + pp.w + 16);
    const atFlag = p.x + PW >= FLAG_X - 6;
    showPrompt(atFlag ? 'castle' : pipeNear || null);
    if (atFlag && !finished) {
      finished = true;
      finishT = t;
      burst(FLAG_X, G - 60, '#e8a93a', 16);
      popup(FLAG_X, G - 70, 'Save point!', 120, true);
    }

    // ↓ on top of a pipe: sink in and warp
    if (keys.down && standingOn?.kind === 'pipe') {
      const pp = standingOn.ref;
      p.x = pp.x + pp.w / 2 - PW / 2;
      p.vx = 0;
      entering = { href: pp.href, frames: reduceMotion ? 1 : 26 };
    }
  }

  // ---------- Drawing ----------
  // "Press Start 2P" is drawn at its native 8px so sign text stays crisp when scaled
  const SIGN_FONT = '8px "Press Start 2P", monospace';
  const SKY = ['#22303f', '#2b3f50', '#3b5263', '#5d6670', '#96766c', '#c98b6b', '#e6ad74'];
  const hill = (x, amp, base, f, seed) => base - amp * (0.55 + 0.45 * Math.sin(x * f + seed) * Math.sin(x * f * 2.3 + seed * 1.7));

  function drawBrick(x, y) {
    ctx.fillStyle = '#9c5a3c'; ctx.fillRect(x, y, 12, 12);
    ctx.fillStyle = '#6b3a24';
    ctx.fillRect(x, y + 5, 12, 1); ctx.fillRect(x, y + 11, 12, 1);
    ctx.fillRect(x + 5, y, 1, 5); ctx.fillRect(x + 2, y + 6, 1, 5); ctx.fillRect(x + 9, y + 6, 1, 5);
    ctx.fillStyle = '#c47a52'; ctx.fillRect(x, y, 12, 1);
  }

  function drawPipe(pp) {
    const y = G - pp.h;
    ctx.fillStyle = '#1f3a2d'; ctx.fillRect(pp.x - 1, y + 5, pp.w + 2, pp.h - 5);       // outline
    ctx.fillStyle = '#3f7a5a'; ctx.fillRect(pp.x + 1, y + 6, pp.w - 2, pp.h - 6);       // body
    ctx.fillStyle = '#7aa35a'; ctx.fillRect(pp.x + 4, y + 6, 3, pp.h - 6);              // shine
    ctx.fillStyle = '#1f3a2d'; ctx.fillRect(pp.x - 3, y - 1, pp.w + 6, 7);              // lip outline
    ctx.fillStyle = '#4f9a6f'; ctx.fillRect(pp.x - 2, y, pp.w + 4, 5);                  // lip
    ctx.fillStyle = '#8fd19a'; ctx.fillRect(pp.x + 1, y + 1, 3, 3);
    // Signboard above
    const label = pp.label.toUpperCase();
    ctx.font = SIGN_FONT;
    const tw = Math.ceil(ctx.measureText(label).width) + 8;
    const sx = Math.round(pp.x + pp.w / 2 - tw / 2);
    const sy = y - 26;
    const lit = near === pp;
    ctx.fillStyle = '#6b4630'; ctx.fillRect(pp.x + pp.w / 2 - 1, sy + 10, 2, 14);
    ctx.fillStyle = '#0f1714'; ctx.fillRect(sx - 1, sy - 1, tw + 2, 12);
    ctx.fillStyle = lit ? '#e8a93a' : '#f1e6cc'; ctx.fillRect(sx, sy, tw, 10);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#2a1f1a'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(label, Math.round(pp.x + pp.w / 2), sy + 1);
    ctx.textBaseline = 'alphabetic';
  }

  function drawCampanile(x) {
    const tH = 78, base = G;
    ctx.fillStyle = '#d9cbb0'; ctx.fillRect(x, base - tH, 11, tH);
    ctx.fillStyle = '#b3a488'; ctx.fillRect(x + 8, base - tH, 3, tH);
    ctx.fillStyle = '#2a1f1a'; ctx.fillRect(x + 3, base - tH + 5, 5, 7);
    ctx.fillStyle = '#e8a93a'; ctx.fillRect(x + 5, base - tH + 17, 2, 2);
    ctx.fillStyle = '#6f9a8a';
    for (let i = 0; i < 8; i++) ctx.fillRect(x + Math.floor(i / 2), base - tH - 1 - i, 11 - Math.floor(i / 2) * 2, 1);
    ctx.fillRect(x + 5, base - tH - 12, 1, 4);
  }

  function drawCastle(x) {
    ctx.fillStyle = '#8b949c'; ctx.fillRect(x, G - 46, 60, 46);
    ctx.fillStyle = '#6b737a';
    for (let yy = G - 42; yy < G; yy += 6) ctx.fillRect(x, yy, 60, 1);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = '#8b949c'; ctx.fillRect(x + i * 11, G - 52, 6, 6); }
    ctx.fillStyle = '#8b949c'; ctx.fillRect(x + 18, G - 70, 24, 24);
    for (let i = 0; i < 3; i++) ctx.fillRect(x + 18 + i * 9, G - 75, 6, 5);
    ctx.fillStyle = '#1c2a25'; ctx.fillRect(x + 24, G - 20, 12, 20); ctx.fillRect(x + 26, G - 62, 8, 8);
    ctx.fillStyle = '#d4553a'; ctx.fillRect(x + 30, G - 88, 1, 13); ctx.fillRect(x + 31, G - 88, 7, 5);
  }

  function drawFlag() {
    ctx.fillStyle = '#e2d2ac'; ctx.fillRect(FLAG_X, G - 80, 2, 80);
    ctx.fillStyle = '#e8a93a'; ctx.fillRect(FLAG_X - 1, G - 83, 4, 4);
    const drop = finished ? Math.min(58, Math.round((t - finishT) * 1.5)) : 0; // flag slides down
    ctx.fillStyle = '#d4553a'; ctx.fillRect(FLAG_X - 14, G - 78 + drop, 14, 10 - (Math.floor(t / 10) % 2));
  }

  function draw() {
    const target = Math.max(0, Math.min(WORLD_W - W, p.x - W * 0.4));
    cam += (target - cam) * (playing ? 0.15 : 1);
    const cx = Math.round(cam);

    // Sky bands with a dithered edge
    const skyH = G - 20;
    const band = skyH / SKY.length;
    SKY.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, Math.floor(i * band), W, Math.ceil(band) + 1); });
    for (const s of stars) {
      if (s.y > skyH * 0.45) continue;
      if (reduceMotion || Math.sin(t * 0.03 + s.p) > 0.2) { ctx.fillStyle = '#f1e6cc'; ctx.fillRect(((s.x - cx * 0.05) % W + W) % W, s.y, 1, 1); }
    }
    // Sun
    ctx.fillStyle = '#f3c969';
    const sunX = W * 0.74 - cx * 0.03, sunY = skyH - 18;
    for (let yy = -13; yy <= 13; yy++) { const half = Math.floor(Math.sqrt(169 - yy * yy)); ctx.fillRect(Math.round(sunX - half), sunY + yy, half * 2, 1); }
    // Clouds
    for (const c of clouds) {
      const x = Math.round(((c.x - cx * 0.2) % (W + 200) + W + 200) % (W + 200) - 100);
      ctx.fillStyle = '#e9c9a8'; ctx.fillRect(x, c.y + 2, c.w, 3); ctx.fillRect(x + 2, c.y, Math.round(c.w * 0.45), 2); ctx.fillRect(x + Math.round(c.w * 0.4), c.y - 1, Math.round(c.w * 0.35), 3);
      ctx.fillStyle = '#c99f86'; ctx.fillRect(x + 1, c.y + 4, c.w - 2, 1);
    }
    // Parallax hills + pines
    const layer = (color, amp, base, f, seed, speed) => {
      ctx.fillStyle = color;
      for (let sx = 0; sx < W; sx++) { const top = Math.round(hill(sx + cx * speed, amp, base, f, seed)); ctx.fillRect(sx, top, 1, G - top); }
    };
    layer('#5a6269', 34, G - 30, 0.018, 1.3, 0.15);
    layer('#3d5a4c', 22, G - 12, 0.03, 4.1, 0.35);
    ctx.fillStyle = '#1f3a2d';
    for (let i = 0; i < 40; i++) {
      const wx = i * 53 + ((i * 17) % 23);
      const x = Math.round(wx - cx * 0.6);
      if (x < -10 || x > W + 10) continue;
      const h = 12 + ((i * 7) % 8);
      for (let r = 0; r < h; r++) { const half = Math.floor(r / 2.2); ctx.fillRect(x - half, G - h + r, half * 2 + 1, 1); }
    }

    ctx.save();
    ctx.translate(-cx, 0);

    drawCampanile(26);
    // Ground
    ctx.fillStyle = '#7aa35a'; ctx.fillRect(cx - 2, G, W + 4, 2);
    ctx.fillStyle = '#5c8a44'; ctx.fillRect(cx - 2, G + 2, W + 4, 2);
    ctx.fillStyle = '#8a5a3c'; ctx.fillRect(cx - 2, G + 4, W + 4, H - G);

    for (const b of bricks) drawBrick(b.x, G - b.dy);
    for (const b of blocks) {
      const y = G - b.dy - (b.bump > 4 ? 8 - b.bump : b.bump);
      ctx.fillStyle = '#0f1714'; ctx.fillRect(b.x - 1, y - 1, 14, 14);
      ctx.fillStyle = b.used ? '#8a5a3c' : '#e8a93a'; ctx.fillRect(b.x, y, 12, 12);
      ctx.fillStyle = b.used ? '#6b4630' : '#b57a1c'; ctx.fillRect(b.x, y + 10, 12, 2);
      if (!b.used) {
        ctx.fillStyle = Math.floor(t / 20) % 2 ? '#fff3c4' : '#1c2a25';
        ctx.fillRect(b.x + 4, y + 2, 4, 1); ctx.fillRect(b.x + 8, y + 3, 1, 2); ctx.fillRect(b.x + 6, y + 5, 2, 1);
        ctx.fillRect(b.x + 6, y + 6, 1, 1); ctx.fillRect(b.x + 6, y + 8, 1, 1);
      }
    }
    for (const c of coins) {
      if (c.taken) continue;
      const y = G - c.dy + Math.round(Math.sin((t + c.x) * 0.08) * 1.5);
      ctx.fillStyle = '#b57a1c'; ctx.fillRect(c.x - 3, y - 4, 6, 8);
      ctx.fillStyle = '#f3c969'; ctx.fillRect(c.x - 2, y - 4, 4, 8); ctx.fillRect(c.x - 3, y - 3, 6, 6);
      ctx.fillStyle = '#fff3c4'; ctx.fillRect(c.x - 1, y - 2, 1, 3);
    }
    pipes.forEach(drawPipe);
    drawFlag();
    drawCastle(CASTLE_X);

    // Player: draw pipes' fronts over the sinking player so they disappear into it
    const moving = Math.abs(p.vx) > 0.3 && p.onGround;
    const breathe = !playing && !reduceMotion && Math.floor(t / 40) % 2 ? 1 : 0;
    const frame = !p.onGround || (moving && Math.floor(t / 7) % 2) ? SPRITE.walk : SPRITE.stand;
    drawSprite(ctx, frame, Math.round(p.x - 1), Math.round(p.y) + breathe, p.dir < 0);
    if (entering) pipes.forEach((pp) => { if (Math.abs(pp.x + pp.w / 2 - (p.x + PW / 2)) < 4) drawPipe(pp); });

    for (const q of particles) { ctx.fillStyle = q.color; ctx.fillRect(Math.round(q.x), Math.round(q.y), 1, 1); }
    ctx.textAlign = 'center';
    for (const pp of popups) {
      ctx.font = pp.big ? 'bold 8px monospace' : '7px monospace';
      ctx.globalAlpha = Math.min(1, pp.life / 20);
      const px = Math.max(cx + 70, Math.min(cx + W - 70, pp.x));
      ctx.fillStyle = '#0f1714'; ctx.fillText(pp.text, px + 1, pp.y + 1);
      ctx.fillStyle = pp.big ? '#fff3c4' : '#f3c969'; ctx.fillText(pp.text, px, pp.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Coin counter: top-center on desktop, top-right (compact) on phones, below the site HUD
    if (playing) {
      const narrow = window.innerWidth <= 832;
      const top = Math.ceil((narrow ? 138 : 92) / scale);
      const label = `${coinsTaken}/${coins.length}`;
      ctx.font = SIGN_FONT; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      const tw = Math.ceil(ctx.measureText(label).width);
      const x = narrow ? W - tw - 12 : Math.round(W / 2 - (tw + 10) / 2);
      // pixel coin icon
      ctx.fillStyle = '#0f1714'; ctx.fillRect(x - 1, top - 1, 8, 10);
      ctx.fillStyle = '#f3c969'; ctx.fillRect(x, top, 6, 8);
      ctx.fillStyle = '#b57a1c'; ctx.fillRect(x + 4, top + 1, 1, 6);
      ctx.fillStyle = '#0f1714'; ctx.fillText(label, x + 10, top + 1);
      ctx.fillStyle = '#f3c969'; ctx.fillText(label, x + 9, top);
      ctx.textBaseline = 'alphabetic';
    }
  }

  // ---------- Loop (paused while the title screen is off-screen) ----------
  let running = true;
  let last = performance.now();
  let acc = 0;
  function loop(now) {
    if (!running) return;
    acc = Math.min(acc + (now - last), 250);
    last = now;
    while (acc >= 1000 / 60) { step(); acc -= 1000 / 60; }
    draw();
    requestAnimationFrame(loop);
  }
  new IntersectionObserver(([e]) => {
    const was = running;
    running = e.isIntersecting;
    if (running && !was) { last = performance.now(); requestAnimationFrame(loop); }
  }).observe(section);

  // Returning via the back button after warping: don't stay mid-sink
  window.addEventListener('pageshow', () => { entering = null; p.y = G - PH; });

  // Test hook: ?debug exposes state for automated play-testing
  if (new URLSearchParams(location.search).has('debug')) window.__explorer = () => ({ p, pipes, blocks, coins, G, FLAG_X, playing, entering });

  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { resize(); p.y = Math.min(p.y, G - PH); }, 100); });
  resize();
  seedSky();
  p.y = G - PH;
  requestAnimationFrame(loop);
})();
