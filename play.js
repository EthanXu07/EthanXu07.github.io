// =====================================================================
//  Bonus level: "Career run". A tiny platformer built from the quest log.
//  - Each quest (oldest → newest) is a platform with a signpost
//  - Its skills are coins; "?" blocks pop out trophies and fun facts
//  - Bugs patrol the ground: stomp them, or lose a heart if they touch you
//  - Reach the flag at the end to hit the Save Point
//  Uses drawSprite / SPRITE from script.js.
// =====================================================================
(() => {
  const canvas = document.getElementById('game');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const { quests, facts } = JSON.parse(document.getElementById('levelData').textContent);
  const $id = (id) => document.getElementById(id);
  const hud = { hearts: $id('gameHearts'), coins: $id('gameCoins'), quest: $id('gameQuest'), score: $id('gameScore'), time: $id('gameTime') };
  const signEl = $id('gameSign');
  const overEl = $id('gameOver');
  const muteBtn = $id('gameMute');

  // ---------- World layout (logical pixels; the canvas is scaled up) ----------
  const H = 180;
  const GROUND = 150;
  const SEG = 210;
  const START = 150;
  const PW = 10;
  const PH = 16;
  const MAX_HEARTS = 3;

  const ground = [];
  const platforms = [];
  const blocks = [];
  const coins = [];
  const signs = [];
  const bugSpawns = [];
  const addGround = (from, to) => ground.push({ x: from, y: GROUND, w: to - from, h: 40 });

  let groundStart = 0;
  let end = START;
  quests.forEach((q, i) => {
    const sx = START + i * SEG;
    // A pit before every other quest (never before the first)
    const pit = i > 0 && i % 2 === 0;
    if (pit) {
      addGround(groundStart, sx - 18);
      groundStart = sx + 18;
    }
    const py = i % 2 ? 118 : 122;
    platforms.push({ x: sx + 62, y: py, w: 90, h: 6 });
    signs.push({ x: sx + 100, y: py, quest: q, index: i });
    // "?" block above the left end of each platform (jump up from the platform to bump it)
    blocks.push({ x: sx + 70, y: py - 46, w: 12, h: 12, used: false, bump: 0, fact: facts[i % facts.length] });
    const n = q.skills.length;
    q.skills.forEach((skill, k) => {
      const t = (k + 0.5) / n;
      coins.push({ x: sx + 30 + t * 156, y: 128 - Math.sin(Math.PI * t) * 34, skill, taken: false });
    });
    // A bug patrols the ground under every quest after the first
    if (i > 0) bugSpawns.push({ minX: sx + (pit ? 26 : 8), maxX: sx + 150 });
    end = sx + SEG;
  });
  const GOAL = end + 40;
  const WORLD_W = GOAL + 140;
  addGround(groundStart, WORLD_W);

  // ---------- Sound (tiny square-wave synth; starts on the first key press) ----------
  let audio = null;
  let muted = false;
  try { muted = localStorage.getItem('careerRunMuted') === '1'; } catch { /* storage blocked */ }
  const setMuteLabel = () => {
    muteBtn.textContent = muted ? '♪ off' : '♪ on';
    muteBtn.setAttribute('aria-pressed', String(!muted));
  };
  setMuteLabel();
  muteBtn.addEventListener('click', () => {
    muted = !muted;
    try { localStorage.setItem('careerRunMuted', muted ? '1' : '0'); } catch { /* ignore */ }
    setMuteLabel();
  });
  function sfx(kind) {
    if (muted) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const notes = {
        jump: [[420, 0.06], [620, 0.06]],
        coin: [[988, 0.05], [1319, 0.12]],
        stomp: [[220, 0.05], [140, 0.08]],
        hurt: [[300, 0.08], [180, 0.14]],
        block: [[660, 0.05], [880, 0.05], [1175, 0.12]],
        win: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.25]],
      }[kind];
      let at = audio.currentTime;
      for (const [freq, dur] of notes) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.06, at);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        osc.connect(gain).connect(audio.destination);
        osc.start(at);
        osc.stop(at + dur);
        at += dur * 0.9;
      }
    } catch { /* audio unavailable */ }
  }

  // ---------- State ----------
  const keys = { left: false, right: false, jump: false };
  let p, bugs, cam, started, finished, startTime, elapsed, falls, kos, hearts, invuln, score, stomps, bumps, checkpoint, popups, particles, activeSign, t;

  function reset() {
    p = { x: 90, y: GROUND - PH, vx: 0, vy: 0, dir: 1, onGround: true, jumpHeld: false };
    bugs = bugSpawns.map((b, i) => ({ x: b.minX + ((i * 37) % (b.maxX - b.minX - 10)), y: GROUND - 8, vx: i % 2 ? 0.35 : -0.35, minX: b.minX, maxX: b.maxX, alive: true, squash: 0 }));
    cam = 0;
    started = false;
    finished = false;
    elapsed = 0;
    falls = 0;
    kos = 0;
    hearts = MAX_HEARTS;
    invuln = 0;
    score = 0;
    stomps = 0;
    bumps = 0;
    checkpoint = 90;
    popups = [];
    particles = [];
    activeSign = null;
    t = 0;
    coins.forEach((c) => (c.taken = false));
    blocks.forEach((b) => { b.used = false; b.bump = 0; });
    overEl.hidden = true;
    signEl.hidden = true;
    hud.quest.textContent = 'Press → to start';
    updateHud();
  }

  function updateHud() {
    const got = coins.filter((c) => c.taken).length;
    hud.hearts.textContent = '♥'.repeat(hearts) + '♡'.repeat(MAX_HEARTS - hearts);
    hud.coins.textContent = `◉ ${got}/${coins.length}`;
    hud.score.textContent = String(score).padStart(5, '0');
    hud.time.textContent = `${elapsed.toFixed(1)}s`;
  }

  const popup = (x, y, text, life = 70, big = false) => popups.push({ x, y, text, life, big });
  const burst = (x, y, color, n = 8) => {
    for (let i = 0; i < n; i++) particles.push({ x, y, vx: Math.cos((i / n) * Math.PI * 2) * 1.2, vy: Math.sin((i / n) * Math.PI * 2) * 1.2 - 1, life: 24, color });
  };

  // ---------- Input ----------
  const KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ' ': 'jump', ArrowUp: 'jump', w: 'jump', W: 'jump' };
  const inView = () => { const r = canvas.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; };

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select, a, dialog')) return;
    if ((e.key === 'r' || e.key === 'R') && inView()) { reset(); return; }
    if ((e.key === 'm' || e.key === 'M') && inView()) { muteBtn.click(); return; }
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
  // Tap / click the game itself to jump
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); keys.jump = true; });
  canvas.addEventListener('pointerup', () => { keys.jump = false; });
  canvas.addEventListener('pointerleave', () => { keys.jump = false; });
  $id('gameReplay').addEventListener('click', () => reset());

  // ---------- Physics ----------
  const overlaps = (a, b, aw = PW, ah = PH) => a.x < b.x + b.w && a.x + aw > b.x && a.y < b.y + b.h && a.y + ah > b.y;
  const solids = () => [...ground, ...blocks];

  function respawn() {
    hearts = MAX_HEARTS;
    p.x = checkpoint; p.y = GROUND - PH - 40; p.vx = 0; p.vy = 0;
    invuln = 90;
  }

  function hurt() {
    if (invuln > 0) return;
    hearts--;
    sfx('hurt');
    invuln = 120;
    p.vx = -p.dir * 1.4;
    p.vy = -2.4;
    if (hearts <= 0) {
      kos++;
      popup(p.x, p.y - 8, 'K.O.! Back to the last sign', 90);
      respawn();
    }
  }

  function step() {
    t++;
    particles.forEach((q) => { q.x += q.vx; q.y += q.vy; q.vy += 0.1; q.life--; });
    particles = particles.filter((q) => q.life > 0);
    popups.forEach((pp) => { pp.life--; pp.y -= 0.3; });
    popups = popups.filter((pp) => pp.life > 0);
    blocks.forEach((b) => { if (b.bump > 0) b.bump--; });
    if (finished) return;

    if (!started && (keys.left || keys.right || keys.jump)) {
      started = true;
      startTime = performance.now();
    }
    if (invuln > 0) invuln--;

    // Horizontal
    const accel = p.onGround ? 0.22 : 0.14;
    if (keys.left && !keys.right) { p.vx -= accel; p.dir = -1; }
    else if (keys.right && !keys.left) { p.vx += accel; p.dir = 1; }
    else p.vx *= p.onGround ? 0.75 : 0.95;
    p.vx = Math.max(-2.1, Math.min(2.1, p.vx));
    if (Math.abs(p.vx) < 0.02) p.vx = 0;

    p.x += p.vx;
    for (const s of solids()) {
      if (overlaps(p, s)) { p.x = p.vx > 0 ? s.x - PW : s.x + s.w; p.vx = 0; }
    }
    p.x = Math.max(0, Math.min(WORLD_W - PW, p.x));

    // Jump (hold for higher, tap for a hop)
    if (keys.jump && p.onGround && !p.jumpHeld) { p.vy = -4.6; p.onGround = false; sfx('jump'); }
    p.jumpHeld = keys.jump;
    if (!keys.jump && p.vy < -1.6) p.vy = -1.6;
    p.vy = Math.min(p.vy + 0.28, 6);

    // Vertical
    const prevBottom = p.y + PH;
    p.y += p.vy;
    p.onGround = false;
    for (const s of solids()) {
      if (!overlaps(p, s)) continue;
      if (p.vy > 0) {
        p.y = s.y - PH; p.onGround = true;
      } else {
        p.y = s.y + s.h;
        // Head-bump a "?" block
        if (blocks.includes(s) && !s.used) {
          s.used = true;
          s.bump = 8;
          bumps++;
          score += 300;
          sfx('block');
          burst(s.x + 6, s.y, '#f3c969', 10);
          popup(s.x + 6, s.y - 10, `★ ${s.fact}`, 150, true);
        }
      }
      p.vy = 0;
    }
    // Platforms are one-way: land on them from above, jump up through them
    for (const pl of platforms) {
      if (p.vy >= 0 && prevBottom <= pl.y + 0.01 && p.y + PH >= pl.y && p.x + PW > pl.x && p.x < pl.x + pl.w) {
        p.y = pl.y - PH; p.vy = 0; p.onGround = true;
      }
    }

    // Fell into a pit → lose a heart, back to the last signpost
    if (p.y > H + 30) {
      falls++;
      popup(checkpoint, GROUND - 60, 'Oops!', 60);
      const left = hearts - 1;
      respawn();
      hearts = Math.max(1, left);
      sfx('hurt');
    }

    // Bugs: walk back and forth; stomp from above, ouch from the side
    for (const b of bugs) {
      if (!b.alive) { if (b.squash > 0) b.squash--; continue; }
      b.x += b.vx;
      if (b.x < b.minX || b.x > b.maxX) b.vx *= -1;
      if (overlaps(p, { x: b.x, y: b.y, w: 10, h: 8 })) {
        if (p.vy > 0 && prevBottom <= b.y + 4) {
          b.alive = false;
          b.squash = 30;
          stomps++;
          score += 200;
          p.vy = -3.4;
          sfx('stomp');
          burst(b.x + 5, b.y + 4, '#7aa35a', 6);
          popup(b.x + 5, b.y - 6, '+200 bug squashed', 60);
        } else {
          hurt();
        }
      }
    }

    // Coins
    for (const c of coins) {
      if (!c.taken && Math.abs(p.x + PW / 2 - c.x) < 9 && Math.abs(p.y + PH / 2 - c.y) < 12) {
        c.taken = true;
        score += 100;
        sfx('coin');
        popup(c.x, c.y - 6, `+${c.skill}`, 70);
      }
    }

    // Signposts: show the quest while you're near one
    const near = signs.find((s) => Math.abs(p.x + PW / 2 - s.x) < 34);
    if (near !== activeSign) {
      activeSign = near || null;
      if (near) {
        checkpoint = Math.max(checkpoint, near.x - 20);
        const q = near.quest;
        const label = document.createElement('p');
        label.className = 'objectives-label';
        label.textContent = `Quest ${near.index + 1} / ${quests.length} · ${q.when}`;
        const h = document.createElement('h3');
        h.textContent = q.title;
        const org = document.createElement('p');
        org.className = 'quest-org';
        org.textContent = q.org;
        signEl.replaceChildren(label, h, org);
        signEl.hidden = false;
        hud.quest.textContent = q.org.split(' · ')[0];
      } else {
        signEl.hidden = true;
      }
    }

    if (p.x + PW >= GOAL) finish();
    if (started) elapsed = (performance.now() - startTime) / 1000;
  }

  function finish() {
    finished = true;
    keys.left = keys.right = keys.jump = false;
    sfx('win');
    const got = coins.filter((c) => c.taken).length;
    score += Math.max(0, Math.round((90 - elapsed) * 20)) + hearts * 500; // time + heart bonus
    let best = null;
    let newBest = false;
    try {
      best = JSON.parse(localStorage.getItem('careerRunBest') || 'null');
      if (!best || score > best.score) { best = { score, time: elapsed }; newBest = true; localStorage.setItem('careerRunBest', JSON.stringify(best)); }
    } catch { /* storage blocked */ }
    const lines = [
      `Score ${score}${newBest ? ' · New best!' : best ? ` · Best ${best.score}` : ''}`,
      `Skills ${got}/${coins.length} · Bugs squashed ${stomps} · ? blocks ${bumps}/${blocks.length}`,
      `Time ${elapsed.toFixed(1)}s · Hearts left ${hearts} · Falls ${falls}${got === coins.length && bumps === blocks.length ? ' · Perfect run!' : ''}`,
    ];
    $id('gameStats').replaceChildren(...lines.map((l) => { const s = document.createElement('span'); s.textContent = l; return s; }));
    signEl.hidden = true;
    overEl.hidden = false;
    hud.quest.textContent = 'Save point!';
    updateHud();
  }

  // ---------- Rendering ----------
  let W = 320;
  const SKY = ['#22303f', '#2b3f50', '#3b5263', '#5d6670', '#96766c', '#c98b6b', '#e6ad74'];

  function resize() {
    const scale = Math.max(1, canvas.clientHeight / H);
    W = Math.max(160, Math.round(canvas.clientWidth / scale));
    canvas.width = W;
    canvas.height = H;
  }

  const hill = (xx, amp, base, f, seed) => base - amp * (0.55 + 0.45 * Math.sin(xx * f + seed) * Math.sin(xx * f * 2.3 + seed * 1.7));

  function drawBug(b) {
    const x = Math.round(b.x);
    if (!b.alive) {
      if (b.squash > 0) { ctx.fillStyle = '#3f7a5a'; ctx.fillRect(x, GROUND - 2, 10, 2); }
      return;
    }
    const leg = Math.floor(t / 8) % 2;
    ctx.fillStyle = '#3f7a5a'; ctx.fillRect(x + 1, b.y, 8, 6);                       // shell
    ctx.fillStyle = '#7aa35a'; ctx.fillRect(x + 2, b.y + 1, 3, 2);                    // shine
    ctx.fillStyle = '#1c2a25'; ctx.fillRect(x + (b.vx > 0 ? 7 : 1), b.y + 2, 2, 2);   // eye
    ctx.fillRect(x + 1 + leg, b.y + 6, 1, 2); ctx.fillRect(x + 4 - leg, b.y + 6, 1, 2); ctx.fillRect(x + 7 + leg, b.y + 6, 1, 2); // legs
    ctx.fillStyle = '#d4553a'; ctx.fillRect(x + (b.vx > 0 ? 9 : 0), b.y + 1, 1, 1);   // antenna tip
  }

  function draw() {
    const target = Math.max(0, Math.min(WORLD_W - W, p.x - W * 0.4));
    cam += (target - cam) * 0.15;
    const cx = Math.round(cam);

    const band = 110 / SKY.length;
    SKY.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, Math.floor(i * band), W, Math.ceil(band) + 1); });
    ctx.fillStyle = '#f3c969';
    for (let yy = -12; yy <= 12; yy++) {
      const half = Math.floor(Math.sqrt(144 - yy * yy));
      ctx.fillRect(W * 0.72 - half - cx * 0.02, 96 + yy, half * 2, 1);
    }
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

    for (const g of ground) {
      ctx.fillStyle = '#8a5a3c'; ctx.fillRect(g.x, g.y, g.w, g.h);
      ctx.fillStyle = '#7aa35a'; ctx.fillRect(g.x, g.y, g.w, 3);
      ctx.fillStyle = '#5c8a44'; ctx.fillRect(g.x, g.y + 3, g.w, 2);
      ctx.fillStyle = '#6b4630';
      for (let px = g.x + 5; px < g.x + g.w; px += 13) ctx.fillRect(px, g.y + 9 + (px % 3) * 5, 2, 1);
    }
    for (const pl of platforms) {
      ctx.fillStyle = '#b5835a'; ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
      ctx.fillStyle = '#6b4630'; ctx.fillRect(pl.x, pl.y + pl.h - 2, pl.w, 2);
      for (let px = pl.x + 8; px < pl.x + pl.w; px += 16) ctx.fillRect(px, pl.y, 1, pl.h);
    }
    // "?" blocks (hop up when bumped)
    for (const b of blocks) {
      const y = b.y - (b.bump > 4 ? 8 - b.bump : b.bump);
      ctx.fillStyle = '#0f1714'; ctx.fillRect(b.x - 1, y - 1, b.w + 2, b.h + 2);
      ctx.fillStyle = b.used ? '#8a5a3c' : '#e8a93a'; ctx.fillRect(b.x, y, b.w, b.h);
      ctx.fillStyle = b.used ? '#6b4630' : '#b57a1c'; ctx.fillRect(b.x, y + b.h - 2, b.w, 2);
      if (!b.used) {
        ctx.fillStyle = Math.floor(t / 20) % 2 ? '#fff3c4' : '#1c2a25';
        ctx.fillRect(b.x + 4, y + 2, 4, 1); ctx.fillRect(b.x + 8, y + 3, 1, 2); ctx.fillRect(b.x + 6, y + 5, 2, 1);
        ctx.fillRect(b.x + 6, y + 6, 1, 1); ctx.fillRect(b.x + 6, y + 8, 1, 1);
      }
    }
    for (const s of signs) {
      const lit = s === activeSign;
      ctx.fillStyle = '#6b4630'; ctx.fillRect(s.x - 1, s.y - 14, 2, 14);
      ctx.fillStyle = lit ? '#e8a93a' : '#e2d2ac'; ctx.fillRect(s.x - 8, s.y - 22, 16, 9);
      ctx.fillStyle = '#2a1f1a'; ctx.fillRect(s.x - 5, s.y - 19, 10, 1); ctx.fillRect(s.x - 5, s.y - 16, 7, 1);
    }
    for (const c of coins) {
      if (c.taken) continue;
      const bob = Math.round(Math.sin((t + c.x) * 0.08) * 1.5);
      ctx.fillStyle = '#b57a1c'; ctx.fillRect(c.x - 3, c.y - 4 + bob, 6, 8);
      ctx.fillStyle = '#f3c969'; ctx.fillRect(c.x - 2, c.y - 4 + bob, 4, 8); ctx.fillRect(c.x - 3, c.y - 3 + bob, 6, 6);
      ctx.fillStyle = '#fff3c4'; ctx.fillRect(c.x - 1, c.y - 2 + bob, 1, 3);
    }
    bugs.forEach(drawBug);
    // Goal: flagpole + campfire save point
    ctx.fillStyle = '#e2d2ac'; ctx.fillRect(GOAL, GROUND - 60, 2, 60);
    ctx.fillStyle = '#d4553a'; ctx.fillRect(GOAL + 2, GROUND - 60, 16, 10 - (Math.floor(t / 10) % 2));
    ctx.fillStyle = '#6b4630'; ctx.fillRect(GOAL + 40, GROUND - 4, 14, 4);
    const flame = ['#9c3423', '#d4553a', '#e8a93a', '#f3c969'];
    for (let fx = 0; fx < 8; fx++) {
      const hgt = 4 + ((fx * 7 + Math.floor(t / 6)) % 5) - Math.abs(fx - 3.5);
      for (let fy = 0; fy < hgt; fy++) { ctx.fillStyle = flame[Math.min(3, Math.floor((fy / hgt) * 4))]; ctx.fillRect(GOAL + 43 + fx, GROUND - 5 - fy, 1, 1); }
    }

    // Player (blinks while invulnerable)
    if (!(invuln > 0 && Math.floor(t / 4) % 2)) {
      const moving = Math.abs(p.vx) > 0.3 && p.onGround;
      const frame = !p.onGround || (moving && Math.floor(t / 7) % 2) ? SPRITE.walk : SPRITE.stand;
      drawSprite(ctx, frame, Math.round(p.x - 1), Math.round(p.y), p.dir < 0);
    }

    for (const q of particles) { ctx.fillStyle = q.color; ctx.fillRect(Math.round(q.x), Math.round(q.y), 1, 1); }

    ctx.textAlign = 'center';
    for (const pp of popups) {
      ctx.font = pp.big ? 'bold 9px monospace' : '8px monospace';
      ctx.globalAlpha = Math.min(1, pp.life / 20);
      const px = Math.max(cx + 60, Math.min(cx + W - 60, pp.x)); // keep long facts on screen
      ctx.fillStyle = '#0f1714'; ctx.fillText(pp.text, px + 1, pp.y + 1);
      ctx.fillStyle = pp.big ? '#fff3c4' : '#f3c969'; ctx.fillText(pp.text, px, pp.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

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

  // Test hook: ethanxu.dev/play/?debug exposes positions for automated play-testing
  if (new URLSearchParams(location.search).has('debug')) {
    window.__careerRun = () => ({ p, bugs, blocks, ground, platforms, GOAL, finished });
  }

  window.addEventListener('resize', resize);
  resize();
  reset();
  requestAnimationFrame(loop);
})();
