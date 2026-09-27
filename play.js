// =====================================================================
//  Bonus level: "Career run". A tiny platformer built from the quest log.
//  Each quest (oldest → newest) is a platform with a signpost; its skills
//  are coins. Reach the flag at the end to hit the Save Point.
//  Uses drawSprite / SPRITE from script.js.
// =====================================================================
(() => {
  const canvas = document.getElementById('game');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const quests = JSON.parse(document.getElementById('levelData').textContent);
  const hud = {
    coins: document.getElementById('gameCoins'),
    quest: document.getElementById('gameQuest'),
    time: document.getElementById('gameTime'),
  };
  const signEl = document.getElementById('gameSign');
  const overEl = document.getElementById('gameOver');

  // ---------- World layout (logical pixels; the canvas is scaled up) ----------
  const H = 180;
  const GROUND = 150;
  const SEG = 210;
  const START = 150;
  const PW = 10;
  const PH = 16;

  const ground = [];
  const platforms = [];
  const coins = [];
  const signs = [];
  let x = 0;
  const addGround = (from, to) => ground.push({ x: from, y: GROUND, w: to - from, h: 40 });

  let groundStart = 0;
  quests.forEach((q, i) => {
    const sx = START + i * SEG;
    // A pit before every other quest (never before the first)
    if (i > 0 && i % 2 === 0) {
      addGround(groundStart, sx - 18);
      groundStart = sx + 18;
    }
    const py = i % 2 ? 118 : 122;
    platforms.push({ x: sx + 62, y: py, w: 90, h: 6 });
    signs.push({ x: sx + 100, y: py, quest: q, index: i });
    const n = q.skills.length;
    q.skills.forEach((skill, k) => {
      const t = (k + 0.5) / n;
      coins.push({ x: sx + 30 + t * 156, y: 128 - Math.sin(Math.PI * t) * 34, skill, taken: false });
    });
    x = sx + SEG;
  });
  const GOAL = x + 40;
  const WORLD_W = GOAL + 140;
  addGround(groundStart, WORLD_W);

  // ---------- State ----------
  const keys = { left: false, right: false, jump: false };
  let p, cam, started, finished, startTime, elapsed, falls, checkpoint, popups, activeSign, t;

  function reset() {
    p = { x: 90, y: GROUND - PH, vx: 0, vy: 0, dir: 1, onGround: true, jumpHeld: false };
    cam = 0;
    started = false;
    finished = false;
    elapsed = 0;
    falls = 0;
    checkpoint = 90;
    popups = [];
    activeSign = null;
    t = 0;
    coins.forEach((c) => (c.taken = false));
    overEl.hidden = true;
    signEl.hidden = true;
    hud.quest.textContent = 'Press → to start';
    updateHud();
  }

  function updateHud() {
    const got = coins.filter((c) => c.taken).length;
    hud.coins.textContent = `◉ ${got}/${coins.length}`;
    hud.time.textContent = `${elapsed.toFixed(1)}s`;
  }

  // ---------- Input ----------
  const KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ' ': 'jump', ArrowUp: 'jump', w: 'jump', W: 'jump' };
  const inView = () => { const r = canvas.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; };

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select, a, dialog')) return;
    if ((e.key === 'r' || e.key === 'R') && inView()) { reset(); return; }
    const k = KEYMAP[e.key];
    if (!k || !inView()) return;
    if (e.target.closest?.('button') && e.key === ' ') return; // let Space press focused buttons
    e.preventDefault();
    keys[k] = true;
  });
  window.addEventListener('keyup', (e) => { const k = KEYMAP[e.key]; if (k) keys[k] = false; });
  window.addEventListener('blur', () => { keys.left = keys.right = keys.jump = false; });

  document.querySelectorAll('.touch-pad button').forEach((b) => {
    const k = b.dataset.key;
    const on = (e) => { e.preventDefault(); keys[k] = true; };
    const off = (e) => { e.preventDefault(); keys[k] = false; };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('pointercancel', off);
  });
  document.getElementById('gameReplay').addEventListener('click', () => { reset(); canvas.focus?.(); });

  // ---------- Physics ----------
  const overlaps = (a, b) => a.x < b.x + b.w && a.x + PW > b.x && a.y < b.y + b.h && a.y + PH > b.y;

  function step() {
    t++;
    if (finished) return;
    if (!started && (keys.left || keys.right || keys.jump)) {
      started = true;
      startTime = performance.now();
    }

    // Horizontal
    const accel = p.onGround ? 0.22 : 0.14;
    if (keys.left && !keys.right) { p.vx -= accel; p.dir = -1; }
    else if (keys.right && !keys.left) { p.vx += accel; p.dir = 1; }
    else p.vx *= p.onGround ? 0.75 : 0.95;
    p.vx = Math.max(-2.1, Math.min(2.1, p.vx));
    if (Math.abs(p.vx) < 0.02) p.vx = 0;

    p.x += p.vx;
    for (const g of ground) {
      if (overlaps(p, g)) { p.x = p.vx > 0 ? g.x - PW : g.x + g.w; p.vx = 0; }
    }
    p.x = Math.max(0, Math.min(WORLD_W - PW, p.x));

    // Jump (hold for higher, tap for a hop)
    if (keys.jump && p.onGround && !p.jumpHeld) { p.vy = -4.6; p.onGround = false; }
    p.jumpHeld = keys.jump;
    if (!keys.jump && p.vy < -1.6) p.vy = -1.6;
    p.vy = Math.min(p.vy + 0.28, 6);

    // Vertical
    const prevBottom = p.y + PH;
    p.y += p.vy;
    p.onGround = false;
    for (const g of ground) {
      if (overlaps(p, g)) {
        if (p.vy > 0) { p.y = g.y - PH; p.onGround = true; } else { p.y = g.y + g.h; }
        p.vy = 0;
      }
    }
    // Platforms are one-way: land on them from above, jump up through them
    for (const pl of platforms) {
      if (p.vy >= 0 && prevBottom <= pl.y + 0.01 && p.y + PH >= pl.y && p.x + PW > pl.x && p.x < pl.x + pl.w) {
        p.y = pl.y - PH; p.vy = 0; p.onGround = true;
      }
    }

    // Fell into a pit → respawn at the last signpost
    if (p.y > H + 30) {
      falls++;
      p.x = checkpoint; p.y = GROUND - PH - 40; p.vx = 0; p.vy = 0;
      popups.push({ x: p.x, y: GROUND - 60, text: 'Oops!', life: 60 });
    }

    // Coins
    for (const c of coins) {
      if (!c.taken && Math.abs(p.x + PW / 2 - c.x) < 9 && Math.abs(p.y + PH / 2 - c.y) < 12) {
        c.taken = true;
        popups.push({ x: c.x, y: c.y - 6, text: `+${c.skill}`, life: 70 });
      }
    }

    // Signposts: show the quest while you're near one
    const near = signs.find((s) => Math.abs(p.x + PW / 2 - s.x) < 34);
    if (near !== activeSign) {
      activeSign = near || null;
      if (near) {
        checkpoint = Math.max(checkpoint, near.x - 20);
        const q = near.quest;
        signEl.innerHTML = '';
        const label = document.createElement('p');
        label.className = 'objectives-label';
        label.textContent = `Quest ${near.index + 1} / ${quests.length} · ${q.when}`;
        const h = document.createElement('h3');
        h.textContent = q.title;
        const org = document.createElement('p');
        org.className = 'quest-org';
        org.textContent = q.org;
        signEl.append(label, h, org);
        signEl.hidden = false;
        hud.quest.textContent = q.org.split(' · ')[0];
      } else {
        signEl.hidden = true;
      }
    }

    // Goal
    if (p.x + PW >= GOAL) {
      finished = true;
      keys.left = keys.right = keys.jump = false;
      const got = coins.filter((c) => c.taken).length;
      document.getElementById('gameStats').textContent =
        `Skills collected: ${got}/${coins.length} · Time: ${elapsed.toFixed(1)}s · Falls: ${falls}` +
        (got === coins.length ? ' · Perfect run!' : '');
      signEl.hidden = true;
      overEl.hidden = false;
      hud.quest.textContent = 'Save point!';
    }

    if (started) elapsed = (performance.now() - startTime) / 1000;
    popups.forEach((pp) => { pp.life--; pp.y -= 0.35; });
    popups = popups.filter((pp) => pp.life > 0);
  }

  // ---------- Rendering ----------
  let W = 320;
  const SKY = ['#22303f', '#2b3f50', '#3b5263', '#5d6670', '#96766c', '#c98b6b', '#e6ad74'];

  function resize() {
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const scale = Math.max(1, cssH / H);
    W = Math.max(160, Math.round(cssW / scale));
    canvas.width = W;
    canvas.height = H;
  }

  const hill = (xx, amp, base, f, seed) => base - amp * (0.55 + 0.45 * Math.sin(xx * f + seed) * Math.sin(xx * f * 2.3 + seed * 1.7));

  function draw() {
    // Camera follows the player
    const target = Math.max(0, Math.min(WORLD_W - W, p.x - W * 0.4));
    cam += (target - cam) * 0.15;
    const cx = Math.round(cam);

    // Sky bands
    const band = 110 / SKY.length;
    SKY.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, Math.floor(i * band), W, Math.ceil(band) + 1); });
    // Sun
    ctx.fillStyle = '#f3c969';
    for (let yy = -12; yy <= 12; yy++) {
      const half = Math.floor(Math.sqrt(144 - yy * yy));
      ctx.fillRect(W * 0.72 - half - cx * 0.02, 96 + yy, half * 2, 1);
    }
    // Parallax hills
    const layer = (color, amp, base, f, seed, speed) => {
      ctx.fillStyle = color;
      for (let sx = 0; sx < W; sx++) {
        const top = Math.round(hill(sx + cx * speed, amp, base, f, seed));
        ctx.fillRect(sx, top, 1, GROUND - top);
      }
    };
    layer('#5a6269', 28, 120, 0.02, 1.1, 0.2);
    layer('#3d5a4c', 20, 136, 0.035, 4.2, 0.4);
    layer('#2c4638', 12, 150, 0.05, 7.3, 0.6);

    ctx.save();
    ctx.translate(-cx, 0);

    // Ground: grass + dirt
    for (const g of ground) {
      ctx.fillStyle = '#8a5a3c'; ctx.fillRect(g.x, g.y, g.w, g.h);
      ctx.fillStyle = '#7aa35a'; ctx.fillRect(g.x, g.y, g.w, 3);
      ctx.fillStyle = '#5c8a44'; ctx.fillRect(g.x, g.y + 3, g.w, 2);
      ctx.fillStyle = '#6b4630';
      for (let px = g.x + 5; px < g.x + g.w; px += 13) ctx.fillRect(px, g.y + 9 + (px % 3) * 5, 2, 1);
    }
    // Platforms
    for (const pl of platforms) {
      ctx.fillStyle = '#b5835a'; ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
      ctx.fillStyle = '#6b4630'; ctx.fillRect(pl.x, pl.y + pl.h - 2, pl.w, 2);
      for (let px = pl.x + 8; px < pl.x + pl.w; px += 16) ctx.fillRect(px, pl.y, 1, pl.h);
    }
    // Signposts
    for (const s of signs) {
      const lit = s === activeSign;
      ctx.fillStyle = '#6b4630'; ctx.fillRect(s.x - 1, s.y - 14, 2, 14);
      ctx.fillStyle = lit ? '#e8a93a' : '#e2d2ac'; ctx.fillRect(s.x - 8, s.y - 22, 16, 9);
      ctx.fillStyle = '#2a1f1a'; ctx.fillRect(s.x - 5, s.y - 19, 10, 1); ctx.fillRect(s.x - 5, s.y - 16, 7, 1);
    }
    // Coins (bobbing)
    for (const c of coins) {
      if (c.taken) continue;
      const bob = Math.round(Math.sin((t + c.x) * 0.08) * 1.5);
      ctx.fillStyle = '#b57a1c'; ctx.fillRect(c.x - 3, c.y - 4 + bob, 6, 8);
      ctx.fillStyle = '#f3c969'; ctx.fillRect(c.x - 2, c.y - 4 + bob, 4, 8); ctx.fillRect(c.x - 3, c.y - 3 + bob, 6, 6);
      ctx.fillStyle = '#fff3c4'; ctx.fillRect(c.x - 1, c.y - 2 + bob, 1, 3);
    }
    // Goal: flagpole + campfire save point
    ctx.fillStyle = '#e2d2ac'; ctx.fillRect(GOAL, GROUND - 60, 2, 60);
    ctx.fillStyle = '#d4553a';
    const wave = Math.floor(t / 10) % 2;
    ctx.fillRect(GOAL + 2, GROUND - 60, 16, 10 - wave);
    ctx.fillStyle = '#6b4630'; ctx.fillRect(GOAL + 40, GROUND - 4, 14, 4);
    const flame = ['#9c3423', '#d4553a', '#e8a93a', '#f3c969'];
    for (let fx = 0; fx < 8; fx++) {
      const hgt = 4 + ((fx * 7 + Math.floor(t / 6)) % 5) - Math.abs(fx - 3.5);
      for (let fy = 0; fy < hgt; fy++) { ctx.fillStyle = flame[Math.min(3, Math.floor((fy / hgt) * 4))]; ctx.fillRect(GOAL + 43 + fx, GROUND - 5 - fy, 1, 1); }
    }

    // Player
    const moving = Math.abs(p.vx) > 0.3 && p.onGround;
    const frame = !p.onGround || (moving && Math.floor(t / 7) % 2) ? SPRITE.walk : SPRITE.stand;
    drawSprite(ctx, frame, Math.round(p.x - 1), Math.round(p.y), p.dir < 0);

    // Floating "+Skill" popups
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    for (const pp of popups) {
      ctx.globalAlpha = Math.min(1, pp.life / 20);
      ctx.fillStyle = '#0f1714'; ctx.fillText(pp.text, pp.x + 1, pp.y + 1);
      ctx.fillStyle = '#f3c969'; ctx.fillText(pp.text, pp.x, pp.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Progress bar along the top
    ctx.fillStyle = 'rgba(15,23,20,0.6)'; ctx.fillRect(0, 0, W, 3);
    ctx.fillStyle = '#e8a93a'; ctx.fillRect(0, 0, Math.round((Math.min(p.x, GOAL) / GOAL) * W), 3);
  }

  // ---------- Loop (fixed 60 Hz timestep) ----------
  let last = performance.now();
  let acc = 0;
  function loop(now) {
    acc = Math.min(acc + (now - last), 250);
    last = now;
    while (acc >= 1000 / 60) { step(); acc -= 1000 / 60; }
    draw();
    updateHud();
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  resize();
  reset();
  requestAnimationFrame(loop);
})();
