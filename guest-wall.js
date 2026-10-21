// =====================================================================
//  Guest wall (library page): a shared r/place-style pixel canvas.
//  Pick a colour, click a square, and it's there for every visitor.
//  One pixel per visitor every 15 s, enforced by the database function
//  place_pixel() (tools/guest-wall.sql). New pixels from other visitors show
//  up every few seconds while the wall is on screen.
// =====================================================================
(() => {
  const root = document.getElementById('guestWall');
  if (!root) return;
  const cfg = window.SITE?.supabase || {};
  if (!cfg.url || !cfg.anonKey) { root.hidden = true; return; }

  const COLS = 64, ROWS = 24, CELL = 10, POLL_MS = 5000, EMPTY = 255;
  // The original r/place palette
  const PALETTE = [
    ['#ffffff', 'White'], ['#e4e4e4', 'Light grey'], ['#888888', 'Grey'], ['#222222', 'Black'],
    ['#ffa7d1', 'Pink'], ['#e50000', 'Red'], ['#e59500', 'Orange'], ['#a06a42', 'Brown'],
    ['#e5d900', 'Yellow'], ['#94e044', 'Lime'], ['#02be01', 'Green'], ['#00d3dd', 'Cyan'],
    ['#0083c7', 'Blue'], ['#0000ea', 'Navy'], ['#cf6ee4', 'Magenta'], ['#820080', 'Purple'],
  ];
  const BLANK = '#f1e6cc';

  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const status = root.querySelector('.guest-status');
  const coords = root.querySelector('.guest-coords');
  const paletteEl = root.querySelector('.guest-palette');
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;

  const grid = new Uint8Array(COLS * ROWS).fill(EMPTY);
  const placedAt = new Array(COLS * ROWS).fill(null);
  let since = null;          // newest placed_at seen; polling asks only for newer pixels
  let hover = null;          // [x, y] under the pointer / keyboard cursor
  let cursor = [Math.floor(COLS / 2), Math.floor(ROWS / 2)];
  let readyAt = 0;           // ms timestamp when this visitor may place again
  let loaded = false;
  let color = (() => { try { const c = +localStorage.getItem('guestwall:color'); return c >= 0 && c < 16 ? c : 5; } catch { return 5; } })();

  // ---------- Supabase REST ----------
  async function api(path, opts = {}) {
    const res = await fetch(`${cfg.url.replace(/\/$/, '')}/rest/v1/${path}`, {
      ...opts,
      headers: { apikey: cfg.anonKey, ...(cfg.anonKey.startsWith('eyJ') && { Authorization: `Bearer ${cfg.anonKey}` }), 'Content-Type': 'application/json', ...opts.headers },
    });
    const body = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) { const err = new Error(body?.message || `HTTP ${res.status}`); err.body = body; throw err; }
    return body;
  }
  function apply(rows) {
    for (const r of rows) {
      const i = r.y * COLS + r.x;
      grid[i] = r.color; placedAt[i] = r.placed_at;
      if (!since || r.placed_at > since) since = r.placed_at;
    }
  }
  // Supabase returns at most 1000 rows per request, so page through (oldest first)
  async function fetchPixels(filter = '') {
    for (let from = 0; ; from += 1000) {
      const rows = await api(`guest_pixels?select=x,y,color,placed_at&order=placed_at.asc,x.asc,y.asc${filter}&offset=${from}&limit=1000`);
      apply(rows);
      if (rows.length < 1000) break;
    }
  }
  async function poll() {
    if (!loaded) { await fetchPixels(); loaded = true; return; }
    // Only pixels newer than the newest we've seen, overlapping by 10 s: a pixel
    // saved just before one we've seen can commit slightly after it
    await fetchPixels(`&placed_at=gt.${encodeURIComponent(new Date(Date.parse(since || 0) - 10000).toISOString())}`);
  }

  // ---------- Drawing ----------
  function draw() {
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const c = grid[y * COLS + x];
      ctx.fillStyle = c === EMPTY ? BLANK : PALETTE[c][0];
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
    // faint grid so squares are easy to aim at
    ctx.fillStyle = 'rgba(42, 31, 26, .07)';
    for (let x = 1; x < COLS; x++) ctx.fillRect(x * CELL, 0, 1, canvas.height);
    for (let y = 1; y < ROWS; y++) ctx.fillRect(0, y * CELL, canvas.width, 1);
    const sel = hover || (document.activeElement === canvas ? cursor : null);
    if (sel) {
      const [x, y] = sel;
      ctx.globalAlpha = .55; ctx.fillStyle = PALETTE[color][0]; ctx.fillRect(x * CELL, y * CELL, CELL, CELL); ctx.globalAlpha = 1;
      ctx.strokeStyle = '#0f1714'; ctx.lineWidth = 2; ctx.strokeRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    }
  }

  // ---------- Status line ----------
  const ago = (iso) => {
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
  };
  let note = '';
  function updateStatus() {
    const left = Math.ceil((readyAt - Date.now()) / 1000);
    status.textContent = note || (!loaded ? 'Loading the wall…' : left > 0 ? `Next pixel in ${left}s` : 'Ready: pick a colour and click a square');
    root.classList.toggle('cooling', left > 0);
    const sel = hover || (document.activeElement === canvas ? cursor : null);
    if (sel) {
      const i = sel[1] * COLS + sel[0];
      coords.textContent = `(${sel[0]}, ${sel[1]})${placedAt[i] ? ` · ${PALETTE[grid[i]][1].toLowerCase()}, placed ${ago(placedAt[i])}` : ' · empty'}`;
    } else coords.textContent = '';
  }
  const flash = (msg, ms = 2500) => { note = msg; updateStatus(); clearTimeout(flash.t); flash.t = setTimeout(() => { note = ''; updateStatus(); }, ms); };

  // ---------- Placing ----------
  async function place(x, y) {
    if (!loaded) return;
    const left = Math.ceil((readyAt - Date.now()) / 1000);
    if (left > 0) { flash(`Hold on: next pixel in ${left}s`); return; }
    const i = y * COLS + x, prev = [grid[i], placedAt[i]];
    grid[i] = color; placedAt[i] = new Date().toISOString(); // show it right away
    readyAt = Date.now() + 15000;
    draw(); updateStatus();
    try {
      const wait = await api('rpc/place_pixel', { method: 'POST', body: JSON.stringify({ px: x, py: y, pcolor: color }) });
      readyAt = Date.now() + (wait || 15) * 1000;
      flash('Placed! Your mark is on the wall.');
    } catch (err) {
      [grid[i], placedAt[i]] = prev;
      const m = /cooldown (\d+)/.exec(err.body?.message || '');
      if (m) { readyAt = Date.now() + +m[1] * 1000; flash(`Hold on: next pixel in ${m[1]}s`); }
      else { readyAt = 0; flash("Couldn't place that pixel. Try again?"); }
      draw();
    }
  }
  function cellAt(e) {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * COLS), y = Math.floor(((e.clientY - r.top) / r.height) * ROWS);
    return x >= 0 && x < COLS && y >= 0 && y < ROWS ? [x, y] : null;
  }
  canvas.addEventListener('pointermove', (e) => { hover = cellAt(e); draw(); updateStatus(); });
  canvas.addEventListener('pointerleave', () => { hover = null; draw(); updateStatus(); });
  canvas.addEventListener('click', (e) => { const c = cellAt(e); if (c) { cursor = c; place(...c); } });
  // Keyboard: arrows move a cursor, Enter/Space places
  canvas.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (d) { e.preventDefault(); e.stopPropagation(); cursor = [Math.max(0, Math.min(COLS - 1, cursor[0] + d[0])), Math.max(0, Math.min(ROWS - 1, cursor[1] + d[1]))]; hover = null; }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); place(...cursor); }
    else return;
    draw(); updateStatus();
  });
  canvas.addEventListener('focus', () => { draw(); updateStatus(); });
  canvas.addEventListener('blur', () => { draw(); updateStatus(); });

  // ---------- Palette ----------
  PALETTE.forEach(([hex, name], i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'guest-swatch'; b.style.setProperty('--c', hex);
    b.setAttribute('aria-label', name); b.title = name;
    b.setAttribute('aria-pressed', String(i === color));
    b.addEventListener('click', () => {
      color = i;
      try { localStorage.setItem('guestwall:color', String(i)); } catch { /* private mode */ }
      paletteEl.querySelectorAll('.guest-swatch').forEach((s, k) => s.setAttribute('aria-pressed', String(k === i)));
      draw();
    });
    paletteEl.append(b);
  });

  // ---------- Live updates while the wall is on screen ----------
  let visible = false, timer = null;
  async function tick() {
    timer = 'busy';
    try { await poll(); draw(); } catch { if (!loaded) note = "Couldn't load the wall right now."; }
    updateStatus();
    timer = visible && !document.hidden ? setTimeout(tick, POLL_MS) : null;
  }
  const wake = () => { if (visible && !document.hidden && !timer) tick(); };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; wake(); }, { rootMargin: '200px' }).observe(root);
  document.addEventListener('visibilitychange', wake);
  setInterval(() => { if (readyAt > Date.now() - 1000) updateStatus(); }, 250); // cooldown countdown
  draw(); updateStatus();
})();
