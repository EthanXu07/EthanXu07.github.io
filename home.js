// =====================================================================
//  Title screen: a small side-scrolling platformer.
//  Run right from the Campanile (the layout shifts slightly each run), bump "?" blocks (prizes partly reshuffled: coins, coffee = +1 heart,
//  star = invincibility, coin magnet, double jump, a hidden 1-up), stomp bugs, dodge
//  spiky viruses, cross pits and a moving platform, then climb the stairs to
//  the flag and into the castle for the fireworks. Past the castle stands a
//  wooden leaderboard (fastest clears + high scores) you can walk along.
//  Run out of hearts and it's game over. Clears (time + score) and game-over
//  scores can be sent to the leaderboard (leaderboard.js). Before Start only the scenery shows;
//  on Start the level drops into place and the name + bio card slides into
//  the corner.
//  World coordinates: the ground surface is y = 0 and "up" is negative.
//  Uses drawSprite / SPRITE from script.js.
// =====================================================================
(() => {
  const canvas = document.getElementById('scene');
  const section = document.getElementById('titleScreen');
  if (!canvas || !section) return;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $id = (id) => document.getElementById(id);
  const prompt = { el: $id('explorePrompt'), label: $id('exploreLabel'), title: $id('exploreTitle'), desc: $id('exploreDesc'), go: $id('exploreGo') };
  const overEl = $id('exploreOver');

  const PW = 10;
  const PH = 16;
  const JUMP_V = -5.8; // ~57 px: enough to land on the 52 px-high brick rows
  const GRAV = 0.28;
  const MAX_HEARTS = 5;
  const START_HEARTS = 3;
  const FALL_Y = 70;
  const JUMP_BUFFER = 10; // frames a jump press is remembered (so pressing just before landing still jumps)
  const COYOTE = 8;      // frames you can still jump after running off a ledge
  const CORNER = 4;      // px: clipping a ledge's corner with your head slides you past it instead of ending the jump

  // ---------- Viewport ----------
  let W = 320, H = 200, G = 176, scale = 4;
  function resize() {
    const cw = section.clientWidth, ch = section.clientHeight;
    scale = Math.max(2, Math.min(6, Math.round(Math.min(cw / 260, ch / 200))));
    W = Math.ceil(cw / scale);
    H = Math.ceil(ch / scale);
    G = H - Math.ceil(24 / scale) - 2; // ground line sits just above the dirt strip
    canvas.width = W;
    canvas.height = H;
  }

  // ---------- Level layout ----------
  const START_X = 70;
  const MID_CHECKPOINT = 540;
  const FLAG_X = 1230;
  const CASTLE_X = 1270;
  const DOOR_X = 1295; // castle door (CASTLE_X + 25)
  const WORLD_W = 1640;
  const BOARD_X = 1372, BOARD_W = 230; // the physical leaderboard past the castle

  // The layout is rebuilt each run with small random nudges: pits, pipes, block rows, coins and
  // enemies shift a few px and pits/pipes change size slightly, but the counts, the order and the
  // flag/castle stay fixed, so every run is about the same length and difficulty.
  // The bounds keep every pit jumpable, pipes clear of the block rows and enemies on open ground.
  const rand = (lo, hi) => Math.round(lo + Math.random() * (hi - lo));
  let ground, pipes, stairs, blocks, pits, movers, coinSpots, enemySpots;
  function buildLevel() {
    const s1 = rand(-12, 12), w1 = rand(-4, 6);   // first pit: shift, extra width (36-46 px)
    const s2 = rand(-10, 10);                     // moving-platform pit: shift only (its width sets the platform's reach)
    const s3 = rand(-4, 8), w3 = rand(-3, 5);     // last pit (27-35 px)
    const rowA = rand(-10, 10), rowB = rand(-10, 10); // the two brick rows
    // Ground with three gaps (the middle one has a moving platform)
    ground = [[0, 470 + s1], [510 + s1 + w1, 720 + s2], [800 + s2, 1060 + s3], [1090 + s3 + w3, WORLD_W]].map(([a, b]) => ({ x: a, y: 0, w: b - a, h: 60, kind: 'ground' }));
    pits = ground.slice(1).map((g, k) => ({ a: ground[k].x + ground[k].w, b: g.x }));
    pipes = [{ x: 330 + rand(-10, 10), h: 24 + rand(-4, 4) }, { x: 410 + rand(-10, 10), h: 32 + rand(-4, 4) }, { x: 1010 + rand(-6, 4), h: 20 + rand(-3, 4) }]
      .map((pp) => ({ x: pp.x, y: -pp.h, w: 22, h: pp.h, kind: 'pipe' }));
    stairs = [];
    for (let c = 0; c < 5; c++) for (let r = 0; r <= c; r++) stairs.push({ x: 1110 + c * 12, y: -12 * (r + 1), w: 12, h: 12, kind: 'stone' });

    // Blocks: y is the block's top edge. "hidden" blocks are invisible until bumped.
    const blockDefs = [
      [160 + rand(-8, 8), 52, 'coin'],
      [220 + rowA, 52, 'brick'], [232 + rowA, 52, 'coffee'], [244 + rowA, 52, 'brick'], [256 + rowA, 52, 'coin'], [268 + rowA, 52, 'brick'],
      [244 + rowA, 96, 'magnet'],                     // coins fly to you
      [560 + rand(-10, 10), 52, 'multi'],             // looks like a brick, pays out 5 coins
      [680 + rand(-6, 6), 52, 'star'],
      [830 + rand(-8, 8), 52, 'heart', true],         // hidden
      [880 + rowB, 52, 'coin'], [892 + rowB, 52, 'brick'], [904 + rowB, 52, 'feather'], [916 + rowB, 52, 'brick'], [928 + rowB, 52, 'coin'],
    ];
    blocks = blockDefs.map(([x, top, content, hidden]) => ({
      x, y: -top, w: 12, h: 12, kind: 'block', base: content, content, hidden: !!hidden, used: false, hits: content === 'multi' ? 5 : 1, bump: 0,
    }));

    movers = [{ x: 724 + s2, y: -20, w: 36, h: 5, minX: 722 + s2, maxX: 764 + s2, vx: 0.5 }]; // right end reaches the far ledge

    const c1 = rand(-6, 6), c2 = rand(-10, 10), c3 = rand(-6, 6);
    coinSpots = [
      ...[0, 1, 2].map((k) => [pits[0].a + 10 + (w1 >> 1) + k * 12, -50]), // arc over the first pit
      ...[0, 1, 2].map((k) => [226 + rowA + k * 18, -66]),               // above the first brick row
      [190 + c1, -12], [202 + c1, -12], [600 + c2, -12], [612 + c2, -12], [624 + c2, -12],
      ...[0, 1, 2, 3].map((k) => [730 + s2 + k * 14, -48 + rand(-4, 4)]),  // over the moving platform
      ...[0, 1, 2, 3].map((k) => [886 + rowB + k * 12, -66]),
      [960 + c3, -12], [972 + c3, -12], [1126, -44], [1150, -68],
    ];

    // Enemies spawn somewhere inside a stretch of open ground between pipes and pits
    const [p1, p2, p3] = pipes;
    const zone = (lo, hi) => rand(lo, Math.max(lo, hi));
    enemySpots = [
      { type: 'bug', x: zone(255, p1.x - 14), vx: -0.4 },
      { type: 'bug', x: zone(p1.x + 26, p2.x - 14), vx: 0.4 },
      { type: 'bug', x: zone(575, 615), vx: -0.4 },
      { type: 'bug', x: zone(635, pits[1].a - 30), vx: 0.4 },
      { type: 'bug', x: zone(pits[1].b + 15, 870), vx: -0.4 },
      { type: 'virus', x: zone(935, 965), vx: 0.35 },
      { type: 'bug', x: zone(p3.x + 26, pits[2].a - 12), vx: -0.4 },
    ];
  }

  // Each new run, every "?" block keeps its usual prize half the time and rolls a random one otherwise
  // (bricks, the multi-coin brick and the hidden 1-up stay put)
  const PRIZES = ['coin', 'coin', 'coin', 'coin', 'coffee', 'coffee', 'magnet', 'feather', 'star'];
  const rollPrize = (b) => (b.base === 'brick' || b.base === 'multi' || b.base === 'heart' || Math.random() < 0.5 ? b.base : PRIZES[Math.floor(Math.random() * PRIZES.length)]);

  // Pits: the spaces between ground segments, flooded with bay water
  const WATER_Y = 5;
  function drawPits() {
    for (const { a, b } of pits) {
      const w = b - a;
      ctx.fillStyle = '#2a1d16'; ctx.fillRect(a, 0, w, H);                        // shadowed back wall
      ctx.fillStyle = '#3a281d'; for (let x = a + 3; x < b - 2; x += 7) ctx.fillRect(x, 1 + (x % 2), 2, 1); // pebbles in the wall
      ctx.fillStyle = '#244b5a'; ctx.fillRect(a, WATER_Y, w, H);                  // water
      ctx.fillStyle = '#1b3946'; ctx.fillRect(a, WATER_Y + 3, w, H);              // deeper water
      for (let x = a; x < b; x++) {                                                 // rippling surface
        const k = Math.sin(x * 0.7 + t * 0.12) + Math.sin(x * 0.23 - t * 0.05);
        ctx.fillStyle = k > 0.9 ? '#9fd0d6' : '#4f8c9b';
        ctx.fillRect(x, WATER_Y + (k < -1.1 ? 1 : 0), 1, 1);
        if (Math.sin(x * 1.9 + t * 0.07) > 0.97) { ctx.fillStyle = '#efb074'; ctx.fillRect(x, WATER_Y + 2, 1, 1); } // sunset glints
      }
      ctx.fillStyle = '#5a3a28'; ctx.fillRect(a, 2, 1, H); ctx.fillRect(b - 1, 2, 1, H);       // dirt face of each ledge
      ctx.fillStyle = '#7aa35a'; ctx.fillRect(a, 0, 2, 1); ctx.fillRect(b - 2, 0, 2, 1);         // grass lip curling over
      ctx.fillStyle = '#5c8a44'; ctx.fillRect(a + 1, 1, 1, 2); ctx.fillRect(b - 2, 1, 1, 3);     // hanging roots
    }
  }
  function splash(x) {
    for (let i = 0; i < 8; i++) particles.push({ x: x + (i - 3.5) * 1.5, y: WATER_Y, vx: (i - 3.5) * 0.25, vy: -1.2 - (i % 3) * 0.4, life: 18, color: i % 2 ? '#9fd0d6' : '#4f8c9b' });
  }

  function solidList() {
    return [...ground, ...pipes, ...stairs, ...blocks.filter((b) => !b.hidden)];
  }
  const hitTest = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const solidAt = (x, y, list) => list.some((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);

  // ---------- State ----------
  const keys = { left: false, right: false, jump: false, down: false };
  let p, enemies, items, coins, cam, t, playing = false, startT = 0, runFrames = 0, state, hearts, score, coinCount, invuln, star, magnet, feather, airJumps, jumpBuffer = 0, coyote = 0, jumpT = 99, checkpoint, popups, particles, winT, near, phase, phaseT, hidePlayer;
  let stars = [], clouds = [];

  function newGame() {
    p = { x: START_X, y: -PH, w: PW, h: PH, vx: 0, vy: 0, dir: 1, onGround: true, jumpHeld: false };
    buildLevel();
    enemies = enemySpots.map((e) => ({ ...e, y: -8, w: 10, h: 8, vy: 0, alive: true, squash: 0, onGround: true }));
    items = [];
    coins = coinSpots.map(([x, y]) => ({ x, y, taken: false }));
    blocks.forEach((b) => { b.content = rollPrize(b); b.used = false; b.hits = b.content === 'multi' ? 5 : 1; b.bump = 0; b.hidden = b.content === 'heart'; });
    movers.forEach((m) => { m.x = m.minX + 2; m.vx = 0.5; });
    cam = 0; t = 0;
    startT = 0; // t restarts at 0, so a retry replays the drop-in instead of freezing until t catches up with the old startT
    state = 'play'; // play | won | over
    hearts = START_HEARTS; score = 0; coinCount = 0; invuln = 0; star = 0; magnet = 0; feather = 0; airJumps = 0; jumpBuffer = 0; coyote = 0;
    checkpoint = START_X;
    popups = []; particles = [];
    winT = 0; near = null; phase = null; phaseT = 0; hidePlayer = false;
    runFrames = 0;
    resetSubmit();
    overEl.hidden = true;
    prompt.el.hidden = true;
  }

  function seedSky() {
    stars = Array.from({ length: 60 }, (_, i) => ({ x: (i * 97) % 900, y: 6 + ((i * 53) % 70), p: i * 0.7 }));
    // Clouds: five kinds (puffy, towering, long streak, wisp, small puff) on two depths
    const rnd = (n) => { const v = Math.sin(n * 127.1 + 3.7) * 43758.5453; return v - Math.floor(v); };
    const TYPES = ['puff', 'tower', 'streak', 'wisp', 'small', 'puff', 'streak', 'tower', 'small', 'wisp', 'puff', 'small', 'streak', 'puff'];
    clouds = TYPES.map((type, i) => {
      const far = i % 3 === 0;
      const r = (k) => rnd(i * 10 + k);
      let parts;
      if (type === 'puff') {
        const w = 16 + Math.round(r(1) * 14);
        parts = [{ dx: 0, dy: 0, w, h: 3 }];
        for (let b = 0; b < 2 + Math.round(r(2) * 2); b++) { const bw = Math.round(w * (0.25 + r(3 + b) * 0.25)), bh = 2 + Math.round(r(6 + b) * 2); parts.push({ dx: Math.round(r(9 + b) * (w - bw)), dy: -bh, w: bw, h: bh }); }
      } else if (type === 'tower') {
        const w = 18 + Math.round(r(1) * 10);
        parts = [{ dx: 0, dy: 0, w, h: 3 }];
        let y = 0, cw = w;
        for (let lv = 0; lv < 3 + Math.round(r(2)); lv++) { const nw = Math.round(cw * (0.62 + r(3 + lv) * 0.15)), bh = 2 + Math.round(r(7 + lv) * 2); y -= bh; parts.push({ dx: Math.round((w - nw) / 2 + (r(11 + lv) - 0.5) * 4), dy: y, w: nw, h: bh + 1 }); cw = nw; }
      } else if (type === 'streak') {
        const w = 30 + Math.round(r(1) * 24);
        parts = [{ dx: 0, dy: 0, w, h: 2 }, { dx: Math.round(w * 0.15), dy: -1, w: Math.round(w * 0.35), h: 1 }, { dx: Math.round(w * 0.6), dy: -1, w: Math.round(w * 0.2), h: 1 }];
      } else if (type === 'wisp') {
        const w = 20 + Math.round(r(1) * 16);
        parts = [{ dx: 0, dy: 0, w, h: 1 }, { dx: Math.round(w * 0.25), dy: 2, w: Math.round(w * 0.6), h: 1 }, { dx: Math.round(w * 0.1), dy: -2, w: Math.round(w * 0.3), h: 1 }];
      } else {
        const w = 6 + Math.round(r(1) * 5);
        parts = [{ dx: 0, dy: 0, w, h: 2 }, { dx: 2, dy: -1, w: w - 4, h: 1 }];
      }
      return { type, far, parts, x: Math.round(i * 113 + r(20) * 60), y: far ? 10 + Math.round(r(21) * 30) : 22 + Math.round(r(22) * 50) };
    });
  }

  // ---------- Start / corner card ----------
  function start() {
    if (playing) return;
    playing = true;
    startT = t; // the level drops in from here
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
  $id('pressStart')?.addEventListener('click', (e) => { e.preventDefault(); start(); });
  $id('exploreRetry').addEventListener('click', () => newGame());
  $id('exploreAgain').addEventListener('click', () => newGame());

  // ---------- Input ----------
  const KEYMAP = {
    ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
    ' ': 'jump', ArrowUp: 'jump', w: 'jump', W: 'jump', ArrowDown: 'down', s: 'down', S: 'down',
  };
  const inView = () => { const r = section.getBoundingClientRect(); return r.bottom > window.innerHeight * 0.35 && r.top < window.innerHeight * 0.5; };
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select, dialog')) return;
    if (!inView()) return;
    const onControl = e.target.closest?.('a, button');
    if (e.key === 'Enter' && !onControl && playing) {
      if (state === 'over') { e.preventDefault(); newGame(); return; }
      if (state === 'won' && phase === 'ready') {
        e.preventDefault();
        document.getElementById('contact')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
        return;
      }
    }
    if ((e.key === 'q' || e.key === 'Q') && playing && !e.repeat) { newGame(); return; } // quick restart (R is the site-wide résumé shortcut)
    const k = KEYMAP[e.key];
    if (!k) return;
    if (onControl && e.key === ' ') return; // Space still presses a focused button
    e.preventDefault();
    if (k === 'jump' && !e.repeat) pressJump();
    keys[k] = true;
    if (k !== 'down') start();
  });
  window.addEventListener('keyup', (e) => { const k = KEYMAP[e.key]; if (k) keys[k] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  function pressJump() { if (playing) jumpBuffer = JUMP_BUFFER; }
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); pressJump(); start(); keys.jump = true; });
  canvas.addEventListener('pointerup', () => { keys.jump = false; });
  canvas.addEventListener('pointerleave', () => { keys.jump = false; });
  section.querySelectorAll('.explore-pad button').forEach((b) => {
    const k = b.dataset.key;
    const on = (e) => { e.preventDefault(); if (k === 'jump') pressJump(); start(); keys[k] = true; };
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

  // ---------- Prompt ----------
  function setPrompt(kind) {
    if (kind === near) return;
    near = kind;
    if (!kind) { prompt.el.hidden = true; return; }
    prompt.label.textContent = 'Level clear!';
    prompt.title.textContent = `${Leaderboard.fmtTime(clearMs())} · Score ${score}`;
    prompt.desc.textContent = `${coinCount} coins · ${hearts} hearts left. Nice run! Press Enter to get in touch, or walk past the castle to see the leaderboard →`;
    forms.clear.hidden = false;
    $id('exploreAgain').hidden = $id('exploreBoard').hidden = false;
    prompt.go.href = '#contact';
    prompt.go.firstChild.textContent = 'Contact ';
    prompt.el.hidden = false;
  }

  // ---------- Leaderboard ----------
  const clearMs = () => Math.round((runFrames * 1000) / 60);
  const forms = {};
  section.querySelectorAll('.run-submit').forEach((f) => { forms[f.dataset.mode] = f; });
  function resetSubmit() {
    for (const f of Object.values(forms)) {
      f.hidden = true;
      f.elements.name.disabled = false; f.querySelector('button').disabled = false;
      f.elements.name.value = Leaderboard.savedName();
      f.querySelector('.run-submit-msg').textContent = '';
      f.classList.remove('done');
      f.ranks = {}; // boards this run is already on, so a retry after a failed save doesn't add it twice
    }
  }
  for (const f of Object.values(forms)) {
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = Leaderboard.cleanName(f.elements.name.value);
      const msg = f.querySelector('.run-submit-msg');
      f.elements.name.disabled = true; f.querySelector('button').disabled = true;
      msg.textContent = 'Saving…';
      try {
        const entries = f.dataset.mode === 'clear' ? [['speed', clearMs()], ['score', score]] : [['score', score]];
        await Promise.all(entries.map(async ([mode, value]) => { f.ranks[mode] ??= await Leaderboard.submit(mode, name, value); }));
        msg.textContent = `Saved! ${entries.map(([mode]) => `${mode === 'speed' ? 'Speedrun' : 'High score'} #${f.ranks[mode]}`).join(' · ')}`;
        f.classList.add('done');
        refreshWall(true);
        openBoard(entries[0][0], name);
      } catch {
        msg.textContent = "Couldn't reach the leaderboard. Try again?";
        f.elements.name.disabled = false; f.querySelector('button').disabled = false;
        f.elements.name.focus(); // it lost focus while disabled; keep Enter retrying instead of reaching the game
      }
    });
  }

  const board = { el: $id('boardModal'), list: $id('boardList'), note: $id('boardNote'), tab: 'speed', mine: '' };
  async function renderBoard() {
    const mode = board.tab;
    board.el.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === mode)));
    board.note.textContent = (mode === 'speed' ? 'Fastest clears to the flag. ' : 'Best scores, cleared or not. ') + (Leaderboard.global ? '' : 'Saved in this browser.');
    board.list.replaceChildren();
    board.list.setAttribute('aria-busy', 'true');
    let rows;
    try { rows = await Leaderboard.top(mode); } catch { rows = null; }
    if (mode !== board.tab) return; // tab switched while loading
    board.list.removeAttribute('aria-busy');
    if (!rows || !rows.length) {
      const li = document.createElement('li');
      li.className = 'board-empty';
      li.textContent = rows ? 'No runs yet. Be the first!' : "Couldn't load the leaderboard.";
      board.list.append(li);
      return;
    }
    for (const r of rows) {
      const li = document.createElement('li');
      if (board.mine && r.name === board.mine) li.classList.add('mine');
      const n = document.createElement('span'); n.className = 'board-name'; n.textContent = r.name;
      const v = document.createElement('span'); v.className = 'board-value'; v.textContent = Leaderboard.fmt(mode, r.value);
      li.append(n, v);
      board.list.append(li);
    }
  }
  function openBoard(tab = board.tab, mine = Leaderboard.savedName()) {
    board.tab = tab; board.mine = mine;
    for (const k in keys) keys[k] = false;
    if (!board.el.open) board.el.showModal();
    renderBoard();
  }
  section.querySelectorAll('[data-board]').forEach((b) => b.addEventListener('click', () => openBoard()));
  // Fetch both boards in the background once the page settles, so opening one is instant
  (window.requestIdleCallback || setTimeout)(() => { Leaderboard.prefetch(); refreshWall(); }, { timeout: 3000 });
  board.el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { board.tab = b.dataset.tab; renderBoard(); }));
  $id('boardClose').addEventListener('click', () => board.el.close());
  board.el.addEventListener('click', (e) => { if (e.target === board.el) board.el.close(); }); // backdrop
  // If focus can't go back (the submit button is disabled by now), don't leave it in the closed dialog or the game ignores keys
  board.el.addEventListener('close', () => { if (board.el.contains(document.activeElement)) document.activeElement.blur(); });

  // ---------- Damage, death, game over ----------
  function hurt() {
    if (invuln > 0 || star > 0 || state !== 'play') return;
    hearts--;
    invuln = 100;
    p.vy = -2.6;
    p.vx = -p.dir * 1.5;
    burst(p.x + 5, p.y + 8, '#d4553a', 8);
    if (hearts <= 0) gameOver();
  }

  function respawn() {
    p.x = checkpoint; p.y = -PH - 30; p.vx = 0; p.vy = 0;
    invuln = 100;
  }

  function gameOver() {
    state = 'over';
    hearts = 0;
    $id('exploreOverStats').textContent = `Score ${score} · ${coinCount} coins`;
    forms.score.hidden = score <= 0;
    overEl.hidden = false;
    prompt.el.hidden = true;
    near = null;
  }

  // ---------- Physics helpers ----------
  // Move an actor with gravity against solids; reports a head bump.
  function moveActor(a, solids, { turnAtWalls = false, cornerSlide = false } = {}) {
    let bumpedHead = null;
    a.x += a.vx;
    for (const s of solids) if (hitTest(a, s)) { a.x = a.vx > 0 ? s.x - a.w : s.x + s.w; a.vx = turnAtWalls ? -a.vx : 0; }
    a.vy = Math.min(a.vy + GRAV, 6);
    const prevBottom = a.y + a.h;
    a.y += a.vy;
    a.onGround = false;
    // Decide falling vs rising once: landing across two side-by-side blocks used to
    // treat the second one as a head bump and push you down through them
    const falling = a.vy > 0;
    // Corner correction: jumping up beside a ledge, a head that only just overlaps
    // its edge gets nudged out sideways so the jump carries you up onto it
    if (!falling && cornerSlide) {
      const hits = solids.filter((s) => hitTest(a, s));
      if (hits.length) {
        const out = [-Math.max(...hits.map((s) => a.x + a.w - s.x)), Math.max(...hits.map((s) => s.x + s.w - a.x))].sort((u, v) => Math.abs(u) - Math.abs(v));
        for (const dx of out) {
          if (Math.abs(dx) > CORNER) continue;
          const moved = { x: a.x + dx, y: a.y, w: a.w, h: a.h };
          if (!solids.some((s) => hitTest(moved, s))) { a.x += dx; break; }
        }
      }
    }
    for (const s of solids) {
      if (!hitTest(a, s)) continue;
      if (falling) { a.y = s.y - a.h; a.onGround = true; } else { a.y = s.y + s.h; bumpedHead = s; }
      a.vy = 0;
    }
    return { bumpedHead, prevBottom };
  }

  function addCoin(x, y) {
    coinCount++;
    score += 100;
    popup(x, y, '+100', 45);
    particles.push({ x, y, vx: 0, vy: -2.2, life: 18, color: '#f3c969' });
  }

  function bumpBlock(b) {
    b.bump = 8;
    if (b.used) return;
    b.hidden = false;
    const cx = b.x + 6;
    switch (b.content) {
      case 'brick':
        burst(cx, b.y, '#b5835a', 4);
        return; // just wobbles
      case 'coin':
        addCoin(cx, b.y - 8);
        break;
      case 'multi':
        addCoin(cx, b.y - 8);
        if (--b.hits > 0) return;
        break;
      default: // coffee, star, heart, magnet, feather pop out and move
        items.push({ type: b.content, x: b.x + 1, y: b.y, w: 10, h: 10, vx: 0, vy: 0, rise: 12, onGround: false });
    }
    b.used = true;
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

    if (!playing || state === 'over') return;

    const solids = solidList();
    if (invuln > 0) invuln--;
    if (star > 0) star--;
    if (magnet > 0) magnet--;
    if (feather > 0) feather--;
    if (!playing || t - startT < 30) return; // let the level finish dropping in
    if (state === 'play') runFrames++; // speedrun clock: fixed 60 steps a second, so it can't drift with frame rate

    for (const m of movers) { m.x += m.vx; if (m.x < m.minX || m.x > m.maxX) m.vx *= -1; }

    // Ending: walk into the castle door → fireworks → step back out
    let autoRight = false;
    if (state === 'won') {
      if (phase === 'walk') {
        autoRight = p.x < DOOR_X;
        if (!autoRight && p.onGround) { phase = 'inside'; phaseT = t; hidePlayer = true; p.vx = 0; }
      } else if (phase === 'inside') {
        const dt = t - phaseT;
        if (dt === 12 || dt === 28 || dt === 44) {
          const fx = CASTLE_X + 10 + ((dt * 7) % 40), fy = -95 - (dt % 20);
          burst(fx, fy, ['#e8a93a', '#d4553a', '#8fb8c9'][dt % 3], 14);
        }
        if (dt > 60) { phase = 'out'; phaseT = t; hidePlayer = false; }
      } else if (phase === 'out') {
        autoRight = p.x < DOOR_X + 30;
        if (!autoRight) phase = 'ready';
      }
    }
    const auto = state === 'won' && phase !== 'ready';
    const left = !auto && keys.left, right = auto ? autoRight : keys.right;
    const accel = p.onGround ? 0.22 : 0.15;
    if (left && !right) { p.vx -= accel; p.dir = -1; }
    else if (right && !left) { p.vx += accel; p.dir = 1; }
    else p.vx *= p.onGround ? 0.75 : 0.95;
    const maxV = auto ? 1.1 : 2;
    p.vx = Math.max(-maxV, Math.min(maxV, p.vx));
    if (Math.abs(p.vx) < 0.02) p.vx = 0;
    // Jump buffering + coyote time: a press counts for a few frames, and you can
    // still jump just after leaving a ledge
    coyote = p.onGround ? COYOTE : Math.max(0, coyote - 1);
    if (auto) jumpBuffer = 0;
    if (jumpBuffer > 0) {
      if (p.onGround || coyote > 0) { p.vy = JUMP_V; p.onGround = false; airJumps = 1; jumpBuffer = 0; coyote = 0; jumpT = 0; }
      else if (feather > 0 && airJumps > 0 && jumpBuffer === JUMP_BUFFER) { // double jump (fresh press only)
        jumpBuffer = 0;
        p.vy = JUMP_V * 0.9; airJumps--; jumpT = 0;
        for (let i = 0; i < 6; i++) particles.push({ x: p.x + 5, y: p.y + PH, vx: (i - 2.5) * 0.5, vy: 0.6, life: 16, color: '#f1e6cc' });
      }
    }
    if (jumpBuffer > 0) jumpBuffer--;
    p.jumpHeld = keys.jump;
    // Let go early for a shorter hop, but every jump gets a few frames of lift first
    jumpT++;
    if (!keys.jump && jumpT > 6 && p.vy < -2.2) p.vy = -2.2; // even a quick tap is a solid hop

    const { bumpedHead, prevBottom } = moveActor(p, solids, { cornerSlide: true });
    if (bumpedHead?.kind === 'block') bumpBlock(bumpedHead);
    // Hidden blocks only become solid when hit from below
    for (const b of blocks) {
      if (b.hidden && p.vy <= 0 && hitTest(p, b) && p.y > b.y + 4) { p.y = b.y + b.h; p.vy = 0; bumpBlock(b); }
    }
    // One-way moving platforms (they carry you)
    for (const m of movers) {
      if (p.vy >= 0 && prevBottom <= m.y + 0.5 && p.y + PH >= m.y && p.x + PW > m.x && p.x < m.x + m.w) {
        p.y = m.y - PH; p.vy = 0; p.onGround = true; p.x += m.vx;
      }
    }
    p.x = Math.max(0, Math.min(WORLD_W - PW, p.x));

    // Splash into the water at the bottom of a pit
    if (prevBottom < WATER_Y && p.y + PH >= WATER_Y && !solidAt(p.x + PW / 2, WATER_Y + 1, ground)) splash(p.x + PW / 2);
    // Fell into a pit
    if (p.y > FALL_Y) {
      hearts--;
      if (hearts <= 0) { gameOver(); return; }
      popup(checkpoint + 5, -40, 'Oops! -1 heart', 70);
      respawn();
    }
    if (p.x > MID_CHECKPOINT && checkpoint < MID_CHECKPOINT) { checkpoint = MID_CHECKPOINT; popup(MID_CHECKPOINT, -44, 'Checkpoint!', 70); }

    // Enemies
    for (const e of enemies) {
      if (!e.alive) { if (e.squash > 0) e.squash--; continue; }
      if (Math.abs(e.x - p.x) > W * 1.5) continue; // sleep until near the camera
      const wasOnGround = e.onGround;
      moveActor(e, solids, { turnAtWalls: true });
      if (wasOnGround && e.onGround) { // turn around at ledges
        const aheadX = e.vx > 0 ? e.x + e.w + 1 : e.x - 1;
        if (!solidAt(aheadX, e.y + e.h + 2, solids)) { e.vx = -e.vx; e.x += e.vx * 2; }
      }
      if (e.y > FALL_Y) { e.alive = false; continue; }
      if (!hitTest(p, e)) continue;
      if (star > 0) {
        e.alive = false; e.squash = 0; score += 200;
        burst(e.x + 5, e.y + 4, '#fff3c4', 10); popup(e.x + 5, e.y - 6, '+200', 50);
      } else if (e.type === 'bug' && p.vy > 0 && prevBottom <= e.y + 4) {
        e.alive = false; e.squash = 30; score += 200;
        p.vy = -3.4;
        burst(e.x + 5, e.y + 4, '#7aa35a', 6); popup(e.x + 5, e.y - 6, '+200 stomp', 50);
      } else {
        hurt();
        if (state === 'over') return;
      }
    }

    // Items from ? blocks
    for (const it of items) {
      if (it.rise > 0) { it.y -= 1; if (--it.rise === 0) it.vx = it.type === 'star' ? 0.9 : it.type === 'feather' ? 0 : 0.6; continue; }
      moveActor(it, solids, { turnAtWalls: true });
      if (it.type === 'star' && it.onGround) it.vy = -3.2; // stars bounce
      if (it.type === 'feather') { it.vy = Math.min(it.vy, 0.35); it.x += Math.sin(t * 0.08) * 0.5; } // feathers drift down
      if (it.y > FALL_Y) it.gone = true;
      if (!it.gone && hitTest(p, it)) {
        it.gone = true;
        if (it.type === 'star') {
          star = 480; score += 500;
          popup(it.x + 5, it.y - 6, 'Star! Invincible!', 90, true);
        } else if (it.type === 'magnet') {
          magnet = 600; score += 500;
          popup(it.x + 5, it.y - 6, 'Coin magnet!', 90, true);
        } else if (it.type === 'feather') {
          feather = 600; score += 500;
          popup(it.x + 5, it.y - 6, 'Double jump!', 90, true);
        } else {
          hearts = Math.min(MAX_HEARTS, hearts + 1);
          score += 500;
          popup(it.x + 5, it.y - 6, it.type === 'coffee' ? 'Coffee break! +1 heart' : 'Extra life! +1 heart', 90, true);
        }
        burst(it.x + 5, it.y + 5, '#fff3c4', 10);
      }
    }
    items = items.filter((it) => !it.gone);

    if (magnet > 0) {
      for (const c of coins) {
        if (c.taken) continue;
        const dx = p.x + PW / 2 - c.x, dy = p.y + PH / 2 - c.y, d = Math.hypot(dx, dy);
        if (d < 70 && d > 0) { c.x += (dx / d) * 2.6; c.y += (dy / d) * 2.6; }
      }
    }
    for (const c of coins) {
      if (!c.taken && Math.abs(p.x + PW / 2 - c.x) < 8 && Math.abs(p.y + PH / 2 - c.y) < 11) { c.taken = true; addCoin(c.x, c.y - 6); }
    }

    // Flag → castle → level clear
    if (state === 'play' && p.x + PW >= FLAG_X) {
      state = 'won';
      winT = t;
      phase = 'walk';
      score += hearts * 500;
      burst(FLAG_X, -60, '#e8a93a', 16);
      popup(FLAG_X, -72, 'Level clear!', 120, true);
    }
    if (state === 'won') {
      // Step aside in front of the leaderboard so the prompt card doesn't cover it
      setPrompt(phase === 'ready' && p.x + PW / 2 > BOARD_X - 10 ? null : 'clear');
      if (p.x + PW / 2 > BOARD_X - 120) refreshWall(); // cached for a minute
    }
  }

  // ---------- Drawing ----------
  const SIGN_FONT = '8px "Press Start 2P", monospace';
  // Real-life dusk: deep blue overhead, lavender, then a warm glowing horizon, plus a
  // soft bloom around the sun. Painted as CSS gradients (full resolution, no banding).
  const SKY_CSS = [[0, '#0f1a33'], [0.15, '#15244a'], [0.3, '#203461'], [0.44, '#344a7a'], [0.56, '#55628f'], [0.66, '#7d7198'], [0.75, '#a87d95'], [0.83, '#cf8d88'], [0.91, '#eca57b'], [1, '#fac98e']];
  let skyKey = '';
  // Fine random grain laid over the sky: dithering hides the banding a smooth dark
  // gradient shows on an 8-bit display. Made once as a small tile.
  const grain = (() => {
    try {
      const c = document.createElement('canvas'); c.width = c.height = 96;
      const g = c.getContext('2d'), img = g.createImageData(96, 96);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() < 0.5 ? 0 : 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 3 + Math.random() * 4; // ~1–3% opacity: enough to dither, too faint to see
      }
      g.putImageData(img, 0, 0);
      return `url(${c.toDataURL()})`;
    } catch { return ''; }
  })();
  // Blend in OKLab (perceptually even) where supported, else plain sRGB
  const OKLAB = typeof CSS !== 'undefined' && CSS.supports?.('background-image', 'linear-gradient(in oklab, red, blue)');
  function paintSky(sunX, sunY, skyH) {
    const key = `${sunX},${sunY},${skyH},${W},${H}`;
    if (key === skyKey) return;
    skyKey = key;
    const pct = (v) => `${((v / H) * 100).toFixed(2)}%`;
    const stops = SKY_CSS.map(([k, c]) => `${c} ${pct(k * skyH)}`).join(', ');
    const sx = `${((sunX / W) * 100).toFixed(2)}%`, sy = pct(sunY);
    const space = OKLAB ? 'in oklab ' : '';
    canvas.style.backgroundImage = [
      grain,
      `radial-gradient(${space}circle at ${sx} ${sy}, rgba(255,226,170,.7) 0, rgba(255,200,140,.42) 3%, rgba(255,178,118,.22) 8%, rgba(255,160,105,.1) 15%, rgba(255,150,100,0) 28%)`,
      `linear-gradient(${space}to bottom, ${stops}, ${SKY_CSS[SKY_CSS.length - 1][1]} 100%)`,
    ].filter(Boolean).join(', ');
    canvas.style.backgroundSize = grain ? '96px 96px, 100% 100%, 100% 100%' : '';
    canvas.style.backgroundRepeat = grain ? 'repeat, no-repeat, no-repeat' : '';
  }
  // Far mountains: jagged ridge with snow on the tallest peaks
  const ridge = (x) => 18 + 8 * Math.sin(x * 0.011 + 0.7) + 7 * Math.abs(Math.sin(x * 0.037 + 2.1)) + 3 * Math.abs(Math.sin(x * 0.083 + 0.3));
  let flock = null, nextFlock = 240;
  const BIRD_UP = [[-3, -2], [-2, -1], [-1, 0], [0, 0], [1, 0], [2, -1], [3, -2], [0, 1]];
  const BIRD_DOWN = [[-3, 1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 1], [0, 1]];
  const birds = Array.from({ length: 5 }, (_, i) => ({ x: i * 97 + 20, y: 30 + ((i * 23) % 40), v: 0.12 + (i % 3) * 0.04, ph: i * 1.7 }));
  const hill = (x, amp, base, f, seed) => base - amp * (0.55 + 0.45 * Math.sin(x * f + seed) * Math.sin(x * f * 2.3 + seed * 1.7));

  function drawBrick(x, y) {
    ctx.fillStyle = '#9c5a3c'; ctx.fillRect(x, y, 12, 12);
    ctx.fillStyle = '#6b3a24';
    ctx.fillRect(x, y + 5, 12, 1); ctx.fillRect(x, y + 11, 12, 1);
    ctx.fillRect(x + 5, y, 1, 5); ctx.fillRect(x + 2, y + 6, 1, 5); ctx.fillRect(x + 9, y + 6, 1, 5);
    ctx.fillStyle = '#c47a52'; ctx.fillRect(x, y, 12, 1);
  }
  function drawQBlock(b, y) {
    ctx.fillStyle = '#0f1714'; ctx.fillRect(b.x - 1, y - 1, 14, 14);
    ctx.fillStyle = b.used ? '#8a5a3c' : '#e8a93a'; ctx.fillRect(b.x, y, 12, 12);
    ctx.fillStyle = b.used ? '#6b4630' : '#b57a1c'; ctx.fillRect(b.x, y + 10, 12, 2);
    if (!b.used) {
      ctx.fillStyle = Math.floor(t / 20) % 2 ? '#fff3c4' : '#1c2a25';
      ctx.fillRect(b.x + 4, y + 2, 4, 1); ctx.fillRect(b.x + 8, y + 3, 1, 2); ctx.fillRect(b.x + 6, y + 5, 2, 1);
      ctx.fillRect(b.x + 6, y + 6, 1, 1); ctx.fillRect(b.x + 6, y + 8, 1, 1);
    }
  }
  function drawPipe(pp, h = pp.h) {
    if (h <= 0) return;
    const y = -h;
    ctx.fillStyle = '#1f3a2d'; ctx.fillRect(pp.x - 1, y + 5, pp.w + 2, h - 5);
    ctx.fillStyle = '#3f7a5a'; ctx.fillRect(pp.x + 1, y + 6, pp.w - 2, h - 6);
    ctx.fillStyle = '#7aa35a'; ctx.fillRect(pp.x + 4, y + 6, 3, h - 6);
    ctx.fillStyle = '#1f3a2d'; ctx.fillRect(pp.x - 3, y - 1, pp.w + 6, 7);
    ctx.fillStyle = '#4f9a6f'; ctx.fillRect(pp.x - 2, y, pp.w + 4, 5);
    ctx.fillStyle = '#8fd19a'; ctx.fillRect(pp.x + 1, y + 1, 3, 3);
  }
  function drawEnemy(e) {
    const x = Math.round(e.x), y = Math.round(e.y);
    if (!e.alive) { if (e.squash > 0) { ctx.fillStyle = '#3f7a5a'; ctx.fillRect(x, y + 6, 10, 2); } return; }
    const leg = Math.floor(t / 8) % 2;
    if (e.type === 'virus') { // spiky: can't be stomped
      ctx.fillStyle = '#9c3423'; ctx.fillRect(x + 1, y + 1, 8, 6);
      ctx.fillStyle = '#d4553a'; ctx.fillRect(x + 2, y + 2, 6, 4);
      ctx.fillStyle = '#f1e6cc';
      ctx.fillRect(x + 1, y - 1, 1, 2); ctx.fillRect(x + 4, y - 2, 2, 2); ctx.fillRect(x + 8, y - 1, 1, 2);
      ctx.fillRect(x - 1, y + 3, 2, 1); ctx.fillRect(x + 9, y + 3, 2, 1);
      ctx.fillStyle = '#0f1714'; ctx.fillRect(x + (e.vx > 0 ? 6 : 3), y + 3, 1, 1);
      ctx.fillRect(x + 2 + leg, y + 7, 1, 1); ctx.fillRect(x + 7 - leg, y + 7, 1, 1);
      return;
    }
    ctx.fillStyle = '#3f7a5a'; ctx.fillRect(x + 1, y, 8, 6);
    ctx.fillStyle = '#7aa35a'; ctx.fillRect(x + 2, y + 1, 3, 2);
    ctx.fillStyle = '#1c2a25'; ctx.fillRect(x + (e.vx > 0 ? 7 : 1), y + 2, 2, 2);
    ctx.fillRect(x + 1 + leg, y + 6, 1, 2); ctx.fillRect(x + 4 - leg, y + 6, 1, 2); ctx.fillRect(x + 7 + leg, y + 6, 1, 2);
    ctx.fillStyle = '#d4553a'; ctx.fillRect(x + (e.vx > 0 ? 9 : 0), y + 1, 1, 1);
  }
  function drawItem(it) {
    const x = Math.round(it.x), y = Math.round(it.y);
    if (it.type === 'coffee') {
      ctx.fillStyle = '#f1e6cc'; ctx.fillRect(x + 1, y + 3, 7, 7); ctx.fillRect(x + 8, y + 4, 2, 4);
      ctx.fillStyle = '#6b4630'; ctx.fillRect(x + 2, y + 3, 5, 2);
      ctx.fillStyle = '#b9b39c'; ctx.fillRect(x + (Math.floor(t / 10) % 2 ? 3 : 5), y, 1, 2);
    } else if (it.type === 'magnet') {
      ctx.fillStyle = '#d4553a'; ctx.fillRect(x, y + 1, 3, 7); ctx.fillRect(x + 7, y + 1, 3, 7); ctx.fillRect(x, y + 7, 10, 3);
      ctx.fillStyle = '#e2d2ac'; ctx.fillRect(x, y, 3, 2); ctx.fillRect(x + 7, y, 3, 2);
    } else if (it.type === 'feather') {
      ctx.fillStyle = '#f1e6cc'; ctx.fillRect(x + 4, y, 2, 2); ctx.fillRect(x + 3, y + 2, 4, 2); ctx.fillRect(x + 2, y + 4, 5, 2); ctx.fillRect(x + 2, y + 6, 4, 2);
      ctx.fillStyle = '#8fb8c9'; ctx.fillRect(x + 5, y + 1, 1, 8); ctx.fillRect(x + 1, y + 8, 2, 2);
    } else if (it.type === 'heart') {
      ctx.fillStyle = '#d4553a';
      ctx.fillRect(x + 1, y + 2, 3, 3); ctx.fillRect(x + 6, y + 2, 3, 3); ctx.fillRect(x + 1, y + 4, 8, 2); ctx.fillRect(x + 2, y + 6, 6, 2); ctx.fillRect(x + 4, y + 8, 2, 1);
    } else {
      ctx.fillStyle = Math.floor(t / 4) % 2 ? '#f3c969' : '#fff3c4';
      ctx.fillRect(x + 4, y, 2, 3); ctx.fillRect(x, y + 3, 10, 2); ctx.fillRect(x + 2, y + 5, 6, 2); ctx.fillRect(x + 1, y + 7, 3, 3); ctx.fillRect(x + 6, y + 7, 3, 3);
    }
  }
  function drawCampanile(x) {
    const tH = 78;
    ctx.fillStyle = '#d9cbb0'; ctx.fillRect(x, -tH, 11, tH);
    ctx.fillStyle = '#b3a488'; ctx.fillRect(x + 8, -tH, 3, tH);
    ctx.fillStyle = '#2a1f1a'; ctx.fillRect(x + 3, -tH + 5, 5, 7);
    ctx.fillStyle = '#e8a93a'; ctx.fillRect(x + 5, -tH + 17, 2, 2);
    ctx.fillStyle = '#6f9a8a';
    for (let i = 0; i < 8; i++) ctx.fillRect(x + Math.floor(i / 2), -tH - 1 - i, 11 - Math.floor(i / 2) * 2, 1);
    ctx.fillRect(x + 5, -tH - 12, 1, 4);
  }
  function drawCastle(x) {
    ctx.fillStyle = '#8b949c'; ctx.fillRect(x, -46, 60, 46);
    ctx.fillStyle = '#6b737a'; for (let yy = -42; yy < 0; yy += 6) ctx.fillRect(x, yy, 60, 1);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = '#8b949c'; ctx.fillRect(x + i * 11, -52, 6, 6); }
    ctx.fillStyle = '#8b949c'; ctx.fillRect(x + 18, -70, 24, 24);
    for (let i = 0; i < 3; i++) ctx.fillRect(x + 18 + i * 9, -75, 6, 5);
    ctx.fillStyle = '#1c2a25'; ctx.fillRect(x + 24, -20, 12, 20); ctx.fillRect(x + 26, -62, 8, 8);
    ctx.fillStyle = '#d4553a'; ctx.fillRect(x + 30, -88, 1, 13);
    if (state === 'won' && phase !== 'walk') ctx.fillRect(x + 31, -88, 7, 5); // castle flag goes up
  }
  // ---------- The physical leaderboard past the castle ----------
  // Two chalkboards on a wooden frame. Text uses a tiny 3x5 pixel font so it stays crisp at any
  // scale; the board is drawn to an offscreen canvas and only redrawn when its rows change.
  const FONT = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
    F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
    K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
    P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
    Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
    4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
    9: '111101111001110', ':': '000010000010000', '.': '000000000000010', '-': '000000111000000', _: '000000000000111',
    '#': '101111101111101', '?': '110001010000010', ',': '000000000010100', '!': '010010010000010', ' ': '000000000000000',
  };
  const textW = (str) => String(str).length * 4 - 1;
  function pixText(c, str, x, y, color) {
    c.fillStyle = color;
    let cx = Math.round(x);
    for (const ch of String(str).toUpperCase()) {
      const g = FONT[ch] ?? FONT['?'];
      for (let i = 0; i < 15; i++) if (g[i] === '1') c.fillRect(cx + (i % 3), y + Math.floor(i / 3), 1, 1);
      cx += 4;
    }
  }
  const wall = { speed: null, score: null, at: 0, key: '' };
  function refreshWall(force = false) {
    if (!force && Date.now() - wall.at < 60000) return;
    wall.at = Date.now();
    for (const m of ['speed', 'score']) Promise.resolve(Leaderboard.top(m)).then((rows) => { wall[m] = rows; }, () => { if (!wall[m]) wall[m] = 'error'; });
  }
  const BOARD_H = 104, BOARD_TOP = -BOARD_H - 22;
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = BOARD_W; boardCanvas.height = BOARD_H;
  function renderBoardImage() {
    const c = boardCanvas.getContext('2d'), mine = Leaderboard.savedName();
    c.clearRect(0, 0, BOARD_W, BOARD_H);
    // Frame + header plank
    c.fillStyle = '#0f1714'; c.fillRect(0, 0, BOARD_W, BOARD_H);
    c.fillStyle = '#6b4630'; c.fillRect(1, 1, BOARD_W - 2, BOARD_H - 2);
    c.fillStyle = '#8a5a3c'; c.fillRect(1, 1, BOARD_W - 2, 2);
    c.fillStyle = '#4a2f20'; for (let x = 9; x < BOARD_W; x += 23) c.fillRect(x, 4, 1, 9);
    const title = 'LEADERBOARD';
    pixText(c, title, (BOARD_W - textW(title)) / 2 + 1, 6, '#0f1714');
    pixText(c, title, (BOARD_W - textW(title)) / 2, 5, '#f3c969');
    const panelW = (BOARD_W - 12) / 2;
    [['speed', 'FASTEST CLEARS'], ['score', 'HIGH SCORES']].forEach(([mode, label], k) => {
      const px = 4 + k * (panelW + 4), py = 15;
      c.fillStyle = '#0f1714'; c.fillRect(px - 1, py - 1, panelW + 2, BOARD_H - py - 3);
      c.fillStyle = '#1f3329'; c.fillRect(px, py, panelW, BOARD_H - py - 5);
      c.fillStyle = 'rgba(241,230,204,0.05)'; c.fillRect(px + 3, py + 30, panelW - 20, 1); c.fillRect(px + 12, py + 58, panelW - 30, 1); // chalk smudges
      pixText(c, label, px + (panelW - textW(label)) / 2, py + 3, '#e2d2ac');
      c.fillStyle = 'rgba(226,210,172,0.35)'; c.fillRect(px + 4, py + 10, panelW - 8, 1);
      const rows = wall[mode];
      if (!Array.isArray(rows) || !rows.length) {
        const note = rows === 'error' ? 'OFFLINE' : rows ? 'NO RUNS YET' : 'LOADING...';
        pixText(c, note, px + (panelW - textW(note)) / 2, py + 38, '#b9b39c');
        return;
      }
      rows.slice(0, 10).forEach((r, i) => {
        const y = py + 14 + i * 7, isMine = mine && r.name === mine;
        const rank = String(i + 1).padStart(2, ' ');
        const value = Leaderboard.fmt(mode, r.value);
        if (isMine) { c.fillStyle = 'rgba(232,169,58,0.18)'; c.fillRect(px + 2, y - 1, panelW - 4, 7); }
        pixText(c, rank, px + 4, y, ['#f3c969', '#c9d1d6', '#d29a6a'][i] || '#8b949c');
        pixText(c, r.name.slice(0, 12), px + 14, y, isMine ? '#f3c969' : '#f1e6cc');
        pixText(c, value, px + panelW - 4 - textW(value), y, isMine ? '#f3c969' : '#e2d2ac');
      });
    });
  }
  function drawLeaderboard(x) {
    const key = JSON.stringify([wall.speed, wall.score, Leaderboard.savedName()]);
    if (key !== wall.key) { wall.key = key; renderBoardImage(); }
    // Posts into the ground, with a lantern on each
    for (const px of [x + 14, x + BOARD_W - 18]) {
      ctx.fillStyle = '#0f1714'; ctx.fillRect(px - 1, BOARD_TOP + 4, 6, -BOARD_TOP - 4);
      ctx.fillStyle = '#5a3a28'; ctx.fillRect(px, BOARD_TOP + 4, 4, -BOARD_TOP - 4);
      ctx.fillStyle = '#7a5238'; ctx.fillRect(px, BOARD_TOP + 4, 1, -BOARD_TOP - 4);
    }
    const glow = 0.22 + Math.sin(t * 0.15) * 0.03;
    for (const lx of [x - 3, x + BOARD_W]) {
      const g = ctx.createRadialGradient(lx + 1.5, BOARD_TOP + 8, 0, lx + 1.5, BOARD_TOP + 8, 34);
      g.addColorStop(0, `rgba(243,201,105,${glow})`); g.addColorStop(1, 'rgba(243,201,105,0)');
      ctx.fillStyle = g; ctx.fillRect(lx - 34, BOARD_TOP - 26, 70, 70);
    }
    ctx.drawImage(boardCanvas, x, BOARD_TOP);
    for (const lx of [x - 4, x + BOARD_W]) {
      ctx.fillStyle = '#0f1714'; ctx.fillRect(lx, BOARD_TOP + 4, 4, 7);
      ctx.fillStyle = '#f3c969'; ctx.fillRect(lx + 1, BOARD_TOP + 6, 2, 4);
    }
    // Your run, on a plaque under the board
    if (state === 'won') {
      const line = `YOUR RUN  ${Leaderboard.fmtTime(clearMs())}  ${score.toLocaleString()}`;
      const w = textW(line) + 8, lx = Math.round(x + (BOARD_W - w) / 2);
      ctx.fillStyle = '#0f1714'; ctx.fillRect(lx - 1, -21, w + 2, 11);
      ctx.fillStyle = '#e2d2ac'; ctx.fillRect(lx, -20, w, 9);
      pixText(ctx, line, lx + 4, -18, '#2a1f1a');
    }
  }

  function drawHud() {
    const narrow = window.innerWidth <= 832;
    const top = Math.ceil((narrow ? 345 : 92) / scale); // phones: below the corner card
    const count = Math.max(hearts, START_HEARTS);
    const totalW = count * 10 + 40;
    let x = narrow ? W - totalW - 6 : Math.round(W / 2 - totalW / 2);
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = '#0f1714'; ctx.fillRect(x - 1, top, 10, 8);
      ctx.fillStyle = i < hearts ? '#d4553a' : '#3b5263';
      ctx.fillRect(x, top + 1, 3, 3); ctx.fillRect(x + 5, top + 1, 3, 3); ctx.fillRect(x, top + 3, 8, 2); ctx.fillRect(x + 1, top + 5, 6, 1); ctx.fillRect(x + 3, top + 6, 2, 1);
      x += 10;
    }
    ctx.font = SIGN_FONT; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillStyle = '#0f1714'; ctx.fillRect(x + 3, top - 1, 8, 10);
    ctx.fillStyle = '#f3c969'; ctx.fillRect(x + 4, top, 6, 8);
    ctx.fillStyle = '#0f1714'; ctx.fillText(String(coinCount), x + 14, top + 1);
    ctx.fillStyle = '#f3c969'; ctx.fillText(String(coinCount), x + 13, top);
    // Speedrun clock (stops at the flag)
    const clock = Leaderboard.fmtTime(clearMs());
    const clockX = narrow ? W - 6 - ctx.measureText(clock).width : x + 13 + ctx.measureText(String(coinCount)).width + 8;
    const clockY = narrow ? top + 12 : top;
    ctx.fillStyle = '#0f1714'; ctx.fillText(clock, clockX + 1, clockY + 1);
    ctx.fillStyle = state === 'won' ? '#f3c969' : '#f1e6cc'; ctx.fillText(clock, clockX, clockY);
    // Active power-ups with seconds left
    const powers = [[star, 'STAR'], [magnet, 'MAGNET'], [feather, '2x JUMP']].filter(([f]) => f > 0).map(([f, n]) => `${n} ${Math.ceil(f / 60)}`);
    if (powers.length) {
      ctx.textAlign = narrow ? 'right' : 'center';
      const px = narrow ? W - 6 : Math.round(W / 2);
      const py = top + (narrow ? 24 : 12);
      ctx.fillStyle = '#0f1714'; ctx.fillText(powers.join('  '), px + 1, py + 1);
      ctx.fillStyle = '#fff3c4'; ctx.fillText(powers.join('  '), px, py);
    }
    ctx.textBaseline = 'alphabetic';
  }

  function draw() {
    const target = Math.max(0, Math.min(WORLD_W - W, p.x - W * 0.4));
    cam += (target - cam) * (playing ? 0.15 : 1);
    const cx = Math.round(cam);

    // --- Screen-space background ---
    const skyH = G - 20;
    // The sky itself is a full-resolution CSS gradient behind the canvas (see paintSky),
    // so it's perfectly smooth; the canvas only clears it and draws on top.
    ctx.clearRect(0, 0, W, G);
    for (const s of stars) {
      if (s.y > skyH * 0.42) continue;
      if (reduceMotion || Math.sin(t * 0.03 + s.p) > 0.2) { ctx.fillStyle = `rgba(241,230,204,${(1 - s.y / (skyH * 0.42)) * 0.9})`; ctx.fillRect(((s.x - cx * 0.05) % W + W) % W, s.y, 1, 1); }
    }
    // Setting sun with a soft halo
    const sunX = Math.round(W * 0.74 - cx * 0.03), sunY = skyH - 30;
    paintSky(sunX, sunY, skyH);
    ctx.fillStyle = '#f7cf78';
    for (let yy = -13; yy <= 13; yy++) { const half = Math.floor(Math.sqrt(169 - yy * yy)); ctx.fillRect(sunX - half, sunY + yy, half * 2, 1); }
    ctx.fillStyle = '#fbe3a4';
    for (let yy = -9; yy <= 3; yy++) { const half = Math.floor(Math.sqrt(81 - yy * yy) * 0.6); ctx.fillRect(sunX - half - 3, sunY + yy, half, 1); }
    const wrapW = Math.max(W + 200, 1600);
    for (const c of clouds) {
      const x = Math.round(((c.x - cx * (c.far ? 0.1 : 0.22)) % wrapW + wrapW) % wrapW - 100);
      if (x > W + 60) continue;
      // lit from below by the sunset: cool lavender up high, warm peach near the horizon
      const k = Math.min(1, c.y / (skyH * 0.75));
      const lerp = (a, b) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
      const top = lerp([124, 126, 164], [240, 200, 164]), under = lerp([92, 88, 128], [214, 150, 128]), hi = lerp([150, 150, 184], [252, 222, 190]);
      ctx.globalAlpha = c.far ? 0.55 : 1;
      for (const [i, pt] of c.parts.entries()) {
        ctx.fillStyle = `rgb(${top})`; ctx.fillRect(x + pt.dx, c.y + pt.dy, pt.w, pt.h);
        if (!c.far && pt.h > 1 && i > 0) { ctx.fillStyle = `rgb(${hi})`; ctx.fillRect(x + pt.dx + 1, c.y + pt.dy, Math.max(1, pt.w - 2), 1); }
      }
      const base = c.parts[0];
      if (base.h > 1) { ctx.fillStyle = `rgb(${under})`; ctx.fillRect(x + base.dx + 1, c.y + base.h - 1, base.w - 2, 1); }
      ctx.globalAlpha = 1;
    }
    // Flocks of birds cross the sky while you play
    if (playing && !reduceMotion && state !== 'over') {
      if (!flock && t > nextFlock) {
        const dir = Math.random() < 0.5 ? 1 : -1, n = 3 + Math.floor(Math.random() * 4);
        flock = { dir, x: dir > 0 ? -20 : W + 20, y: Math.round(skyH * (0.18 + Math.random() * 0.25)), cam0: cx,
          birds: Array.from({ length: n }, (_, i) => { const k = Math.ceil(i / 2), side = i % 2 ? 1 : -1; return { ox: -dir * k * 7, oy: i ? side * k * 4 : 0, ph: Math.random() * 16 }; }) };
        nextFlock = t + 420 + Math.random() * 480; // every ~7–15 s
      }
      if (flock) {
        flock.x += flock.dir * 0.38;
        const fx0 = flock.x - (cx - flock.cam0) * 0.3, bob = Math.sin(t * 0.05) * 2;
        ctx.fillStyle = '#2b2536';
        for (const b of flock.birds) {
          const bx = Math.round(fx0 + b.ox), by = Math.round(flock.y + b.oy + bob + Math.sin((t + b.ph * 9) * 0.07));
          const frame = Math.floor((t + b.ph) / 8) % 2 ? BIRD_UP : BIRD_DOWN;
          for (const [dx, dy] of frame) ctx.fillRect(bx + dx, by + dy, 1, 1);
        }
        if (fx0 < -80 || fx0 > W + 80) flock = null;
      }
    }
    // Birds drifting across the sky
    {
      ctx.fillStyle = '#3a3346';
      for (const b of birds) {
        const bx = Math.round((((b.x + t * b.v - cx * 0.1) % (W + 40)) + W + 40) % (W + 40) - 20);
        const by = Math.round(b.y + Math.sin(t * 0.02 + b.ph) * 3);
        const up = !reduceMotion && Math.floor(t / 12 + b.ph) % 2;
        ctx.fillRect(bx, by, 1, 1);
        ctx.fillRect(bx - 1, by - (up ? 1 : 0), 1, 1); ctx.fillRect(bx + 1, by - (up ? 1 : 0), 1, 1);
        ctx.fillRect(bx - 2, by - (up ? 2 : 0), 1, 1); ctx.fillRect(bx + 2, by - (up ? 2 : 0), 1, 1);
      }
    }
    // Distant snow-capped mountains (hazy, close to the sky colour)
    for (let sx = 0; sx < W; sx++) {
      const wx = sx + cx * 0.06;
      const h = ridge(wx), top = Math.round(G - 22 - h);
      ctx.fillStyle = '#76687d'; ctx.fillRect(sx, top, 1, G - top);
      // snowcap: deeper on taller peaks, with a ragged, melting lower edge; lit on the sunset side
      if (h > 25) {
        const depth = Math.round((h - 25) * 0.55 + 1 + 1.1 * Math.sin(wx * 0.3) + 0.5 * Math.sin(wx * 0.75));
        if (depth > 0) {
          const litSide = ridge(wx + 6) < ridge(wx - 6); // broad slope facing the sun (to the right)
          ctx.fillStyle = litSide ? '#c2b4c1' : '#9888a3'; ctx.fillRect(sx, top, 1, depth);
          if (Math.sin(wx * 0.45) > 0.92) ctx.fillRect(sx, top + depth, 1, 2); // an occasional snow streak
        }
      }
      ctx.fillStyle = 'rgba(239,176,116,0.14)'; ctx.fillRect(sx, top, 1, G - top);                  // warm haze from the sunset
    }
    // Golden Gate Bridge, far off in the haze (appears once, slow parallax)
    const bx0 = Math.round(W * 0.2 + 260 - cx * 0.12);
    if (bx0 > -140 && bx0 < W + 20) {
      const deck = G - 44, span = 90, tw = 30;
      ctx.fillStyle = '#9a6a6a';
      ctx.fillRect(bx0 - 30, deck, span + 60, 1);                                    // road deck
      for (const tx of [bx0, bx0 + span]) { ctx.fillRect(tx - 1, deck - tw, 3, tw + 8); ctx.fillRect(tx - 2, deck - tw + 6, 5, 1); ctx.fillRect(tx - 2, deck - tw + 16, 5, 1); }
      for (let x = 0; x <= span; x++) { const k = x / span - 0.5; ctx.fillRect(bx0 + x, Math.round(deck - tw + 2 + (1 - 4 * k * k) * (tw - 4)), 1, 1); } // main cable
      for (let x = 0; x <= 30; x++) { ctx.fillRect(bx0 - x, Math.round(deck - tw + 2 + (x / 30) * (tw - 4)), 1, 1); ctx.fillRect(bx0 + span + x, Math.round(deck - tw + 2 + (x / 30) * (tw - 4)), 1, 1); }
      ctx.fillStyle = 'rgba(118,104,125,0.35)'; for (let x = 6; x < span; x += 6) { const k = x / span - 0.5; const cy = Math.round(deck - tw + 2 + (1 - 4 * k * k) * (tw - 4)); ctx.fillRect(bx0 + x, cy, 1, deck - cy); } // suspenders
    }
    const layer = (color, amp, base, f, seed, speed) => {
      ctx.fillStyle = color;
      for (let sx = 0; sx < W; sx++) { const top = Math.round(hill(sx + cx * speed, amp, base, f, seed)); ctx.fillRect(sx, top, 1, G - top); }
    };
    layer('#5d6170', 34, G - 30, 0.018, 1.3, 0.15);
    layer('#3d5a4c', 22, G - 12, 0.03, 4.1, 0.35);
    ctx.fillStyle = '#1f3a2d';
    for (let i = 0; i < 44; i++) {
      const x = Math.round(i * 53 + ((i * 17) % 23) - cx * 0.6);
      if (x < -10 || x > W + 10) continue;
      const h = 12 + ((i * 7) % 8);
      for (let r = 0; r < h; r++) { const half = Math.floor(r / 2.2); ctx.fillRect(x - half, G - h + r, half * 2 + 1, 1); }
    }
    ctx.fillStyle = '#1c2a25'; ctx.fillRect(0, G, W, H - G);

    // --- World space: ground surface at y = 0 ---
    ctx.save();
    ctx.translate(-cx, G);

    drawCampanile(26);
    drawPits();
    for (const g of ground) {
      ctx.fillStyle = '#8a5a3c'; ctx.fillRect(g.x, 4, g.w, g.h);
      ctx.fillStyle = '#7aa35a'; ctx.fillRect(g.x, 0, g.w, 2);
      ctx.fillStyle = '#5c8a44'; ctx.fillRect(g.x, 2, g.w, 2);
      ctx.fillStyle = '#6b4630'; for (let px = g.x + 5; px < g.x + g.w; px += 13) ctx.fillRect(px, 9 + (px % 3) * 5, 2, 1);
    }
    // Before Start only the scenery shows; on Start the level drops in from above,
    // then coins, items and enemies appear.
    if (playing) {
      const drop = reduceMotion ? 0 : Math.max(0, 30 - (t - startT)) * 5;
      ctx.save();
      ctx.translate(0, -drop);
      ctx.fillStyle = '#e2d2ac'; ctx.fillRect(MID_CHECKPOINT, -30, 1, 30);
      ctx.fillStyle = checkpoint >= MID_CHECKPOINT ? '#e8a93a' : '#8b949c'; ctx.fillRect(MID_CHECKPOINT + 1, -30, 8, 6);
      for (const s of stairs) { ctx.fillStyle = '#6b737a'; ctx.fillRect(s.x, s.y, 12, 12); ctx.fillStyle = '#8b949c'; ctx.fillRect(s.x + 1, s.y + 1, 10, 10); ctx.fillStyle = '#a9b1b8'; ctx.fillRect(s.x + 1, s.y + 1, 10, 1); }
      pipes.forEach((pp) => drawPipe(pp));
      for (const m of movers) {
        ctx.fillStyle = '#0f1714'; ctx.fillRect(Math.round(m.x) - 1, m.y - 1, m.w + 2, m.h + 2);
        ctx.fillStyle = '#e2d2ac'; ctx.fillRect(Math.round(m.x), m.y, m.w, m.h);
        ctx.fillStyle = '#b3a488'; ctx.fillRect(Math.round(m.x), m.y + m.h - 1, m.w, 1);
      }
      for (const b of blocks) {
        if (b.hidden) continue;
        const y = b.y - (b.bump > 4 ? 8 - b.bump : b.bump);
        if (b.content === 'brick' || (b.content === 'multi' && !b.used)) drawBrick(b.x, y);
        else drawQBlock(b, y);
      }

      ctx.fillStyle = '#e2d2ac'; ctx.fillRect(FLAG_X, -80, 2, 80);
      ctx.fillStyle = '#e8a93a'; ctx.fillRect(FLAG_X - 1, -83, 4, 4);
      const flagDrop = state === 'won' ? Math.min(66, Math.round((t - winT) * 1.5)) : 0;
      ctx.fillStyle = '#d4553a'; ctx.fillRect(FLAG_X - 14, -78 + flagDrop, 14, 10 - (Math.floor(t / 10) % 2));
      drawCastle(CASTLE_X);
      drawLeaderboard(BOARD_X);
      ctx.restore();
      if (drop === 0) {
        for (const c of coins) {
          if (c.taken) continue;
          const y = c.y + Math.round(Math.sin((t + c.x) * 0.08) * 1.5);
          ctx.fillStyle = '#b57a1c'; ctx.fillRect(c.x - 3, y - 4, 6, 8);
          ctx.fillStyle = '#f3c969'; ctx.fillRect(c.x - 2, y - 4, 4, 8); ctx.fillRect(c.x - 3, y - 3, 6, 6);
          ctx.fillStyle = '#fff3c4'; ctx.fillRect(c.x - 1, y - 2, 1, 3);
        }
        items.forEach(drawItem);
        enemies.forEach(drawEnemy);
      }
    }

    if (state !== 'over' && !hidePlayer && !(invuln > 0 && Math.floor(t / 4) % 2)) {
      const moving = Math.abs(p.vx) > 0.3 && p.onGround;
      const frame = !p.onGround || (moving && Math.floor(t / 7) % 2) ? SPRITE.walk : SPRITE.stand;
      const breathe = !playing && !reduceMotion && Math.floor(t / 40) % 2 ? 1 : 0;
      drawSprite(ctx, frame, Math.round(p.x - 1), Math.round(p.y) + breathe, p.dir < 0);
      if (star > 0 && Math.floor(t / 3) % 2) { ctx.fillStyle = 'rgba(255,243,196,0.55)'; ctx.fillRect(Math.round(p.x - 1), Math.round(p.y), 12, 16); }
    }

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

    if (playing) drawHud();
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

  // Test hook: ?debug exposes state for automated play-testing
  if (new URLSearchParams(location.search).has('debug')) {
    window.__mover = () => movers[0].x;
    window.__explorer = () => ({ runFrames, flock, phase, hidePlayer, keys, movers, ground, pipes, pits, coins, magnet, feather, p, enemies, blocks, items, FLAG_X, MID_CHECKPOINT, state, hearts, star, coinCount, score, playing, near });
  }

  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 100); });
  resize();
  seedSky();
  newGame();
  requestAnimationFrame(loop);
})();
