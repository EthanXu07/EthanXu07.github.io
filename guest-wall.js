// =====================================================================
//  Guest wall (library page): a shared r/place-style pixel canvas.
//  Pick a colour (or the eraser) and a brush size, then click or drag to
//  paint. Strokes save in batches through the database function
//  paint_pixels() (tools/guest-wall.sql); no cooldown. Other visitors'
//  painting shows up every few seconds while the wall is on screen.
//  The first load starts as soon as the page does (not when the wall scrolls
//  into view), and the last copy seen is kept in localStorage so a repeat
//  visit shows the wall instantly while it catches up.
// =====================================================================
(() => {
  const root = document.getElementById('guestWall');
  if (!root) return;
  const cfg = window.SITE?.supabase || {};
  if (!cfg.url || !cfg.anonKey) { root.hidden = true; return; }

  const COLS = 160, ROWS = 60, CELL = 6;
  const POLL_MS = 3000, FLUSH_MS = 150, BATCH = 2000;
  const BLANK = -1;          // erased / never painted
  // The original r/place palette
  const PALETTE = [
    ['#ffffff', 'White'], ['#e4e4e4', 'Light grey'], ['#888888', 'Grey'], ['#222222', 'Black'],
    ['#ffa7d1', 'Pink'], ['#e50000', 'Red'], ['#e59500', 'Orange'], ['#a06a42', 'Brown'],
    ['#e5d900', 'Yellow'], ['#94e044', 'Lime'], ['#02be01', 'Green'], ['#00d3dd', 'Cyan'],
    ['#0083c7', 'Blue'], ['#0000ea', 'Navy'], ['#cf6ee4', 'Magenta'], ['#820080', 'Purple'],
  ];
  const PAPER = '#f1e6cc';
  const fill = (c) => (c === BLANK ? PAPER : PALETTE[c][0]);

  const $ = (s) => root.querySelector(s);
  const canvas = $('.guest-canvas'), ctx = canvas.getContext('2d');
  const status = $('.guest-status'), coords = $('.guest-coords');
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;

  const grid = new Int8Array(COLS * ROWS).fill(BLANK);
  const placedAt = new Array(COLS * ROWS).fill(null);
  let since = null;            // newest placed_at seen; polls ask only for newer squares
  let loaded = false;
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
  let color = (() => { const c = +(store.get('guestwall:color') ?? 5); return c >= BLANK && c < 16 ? c : 5; })();
  let brush = (() => { const b = +store.get('guestwall:brush'); return [1, 2, 4].includes(b) ? b : 1; })();
  let hover = null;            // [x, y] under the pointer / keyboard cursor
  let cursor = [COLS >> 1, ROWS >> 1];

  // ---------- Supabase REST ----------
  const headers = { apikey: cfg.anonKey, ...(cfg.anonKey.startsWith('eyJ') && { Authorization: `Bearer ${cfg.anonKey}` }), 'Content-Type': 'application/json' };
  const endpoint = (path) => `${cfg.url.replace(/\/$/, '')}/rest/v1/${path}`;
  // Reads put the key in the URL and send no custom headers, so the browser skips
  // the CORS preflight round trip (the database is a slow round trip away)
  async function api(path, opts = {}) {
    const res = opts.method ? await fetch(endpoint(path), { ...opts, headers }) : await fetch(`${endpoint(path)}&apikey=${encodeURIComponent(cfg.anonKey)}`);
    const body = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
    return body;
  }
  const paintBody = (batch) => JSON.stringify({ xs: batch.map(([i]) => i % COLS), ys: batch.map(([i]) => Math.floor(i / COLS)), cs: batch.map(([, c]) => c) });

  // ---------- Saving: painted squares queue up and go out in batches ----------
  const queue = new Map();     // cell index → colour, waiting to send
  const inflight = new Map();  // cell index → colour, sent but not confirmed
  let failures = 0, flushTimer = null;
  function paintCell(x, y) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    const i = y * COLS + x;
    grid[i] = color; placedAt[i] = new Date().toISOString();
    queue.delete(i); queue.set(i, color); // re-insert so the newest paint is sent last
  }
  function scheduleFlush(ms = FLUSH_MS) { if (!flushTimer) flushTimer = setTimeout(flush, ms); }
  async function flush() {
    flushTimer = null;
    if (!queue.size) return;
    if (inflight.size) { scheduleFlush(); return; }
    const batch = [...queue].slice(0, BATCH);
    for (const [i, c] of batch) { queue.delete(i); inflight.set(i, c); }
    setStatus();
    try {
      await api('rpc/paint_pixels', { method: 'POST', body: paintBody(batch) });
      failures = 0;
    } catch {
      failures++;
      // Put them back (unless repainted meanwhile) and retry with a growing delay
      for (const [i, c] of batch) if (!queue.has(i)) queue.set(i, c);
    }
    inflight.clear();
    setStatus();
    if (queue.size) scheduleFlush(failures ? Math.min(8000, 500 * 2 ** failures) : FLUSH_MS);
  }

  // ---------- Loading + live updates ----------
  function apply(rows) {
    for (const r of rows) {
      const i = r.y * COLS + r.x;
      if (!queue.has(i) && !inflight.has(i)) { grid[i] = r.color; placedAt[i] = r.placed_at; } // don't flicker squares still being saved
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
  // First load: one page, and if the wall is fuller than that, all the other pages at
  // once (it has at most COLS*ROWS squares) instead of one slow round trip after another
  async function fetchWall() {
    const page = (k) => api(`guest_pixels?select=x,y,color,placed_at&order=y.asc,x.asc&offset=${k * 1000}&limit=1000`);
    const first = await page(0);
    const rest = first.length < 1000 ? [] : await Promise.all(Array.from({ length: Math.ceil((COLS * ROWS) / 1000) - 1 }, (_, k) => page(k + 1)));
    // Start from blank so squares deleted since the cached copy (a wipe) disappear
    grid.fill(BLANK); placedAt.fill(null);
    [first, ...rest].forEach(apply);
  }
  async function poll() {
    if (!loaded) { await fetchWall(); loaded = true; saveSnapshot(); return; }
    // Only squares newer than the newest we've seen, overlapping by 10 s: a batch
    // saved just before one we've seen can commit slightly after it
    await fetchPixels(`&placed_at=gt.${encodeURIComponent(new Date(Date.parse(since || 0) - 10000).toISOString())}`);
  }

  // ---------- Last copy seen, for an instant first paint on the next visit ----------
  const SNAP = 'guestwall:snapshot';
  function saveSnapshot() {
    const cells = [];
    for (let i = 0; i < grid.length; i++) if (grid[i] !== BLANK && placedAt[i]) cells.push([i, grid[i], placedAt[i]]);
    store.set(SNAP, JSON.stringify(cells));
  }
  function loadSnapshot() {
    try {
      for (const [i, c, at] of JSON.parse(store.get(SNAP)) || []) if (i >= 0 && i < grid.length && c >= 0 && c < 16) { grid[i] = c; placedAt[i] = at; }
    } catch { /* missing or corrupt: wait for the network */ }
  }

  // ---------- Drawing ----------
  const brushCells = ([x, y]) => {
    const o = Math.floor((brush - 1) / 2), cells = [];
    for (let dy = 0; dy < brush; dy++) for (let dx = 0; dx < brush; dx++) cells.push([x - o + dx, y - o + dy]);
    return cells;
  };
  let painting = false;
  function draw() {
    for (let i = 0; i < grid.length; i++) {
      ctx.fillStyle = fill(grid[i]);
      ctx.fillRect((i % COLS) * CELL, Math.floor(i / COLS) * CELL, CELL, CELL);
    }
    const sel = hover || (document.activeElement === canvas ? cursor : null);
    if (sel && !painting) { // brush preview
      const o = Math.floor((brush - 1) / 2), x = (sel[0] - o) * CELL, y = (sel[1] - o) * CELL, s = brush * CELL;
      ctx.globalAlpha = .6; ctx.fillStyle = fill(color); ctx.fillRect(x, y, s, s); ctx.globalAlpha = 1;
      ctx.strokeStyle = '#0f1714'; ctx.lineWidth = 2; ctx.strokeRect(x - 1, y - 1, s + 2, s + 2);
    }
  }
  let drawQueued = false;
  const redraw = () => { if (!drawQueued) { drawQueued = true; requestAnimationFrame(() => { drawQueued = false; draw(); }); } };

  // ---------- Status line ----------
  const ago = (iso) => {
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
  };
  let loadError = false, snapshotShown = false;
  function setStatus() {
    status.textContent = !loaded ? (loadError ? "Couldn't load the wall right now." : snapshotShown ? 'Catching up…' : 'Loading the wall…')
      : failures ? 'Connection trouble: retrying…'
      : queue.size || inflight.size ? 'Saving…'
      : 'Saved · live';
    const sel = hover || (document.activeElement === canvas ? cursor : null);
    if (sel) {
      const i = sel[1] * COLS + sel[0];
      coords.textContent = `(${sel[0]}, ${sel[1]})${grid[i] !== BLANK && placedAt[i] ? ` · ${PALETTE[grid[i]][1].toLowerCase()}, painted ${ago(placedAt[i])}` : ' · blank'}`;
    } else coords.textContent = '';
  }

  // ---------- Painting with the mouse / finger ----------
  let last = null, moveMode = false;
  function cellAt(e) {
    const r = canvas.getBoundingClientRect();
    return [Math.min(COLS - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * COLS))), Math.min(ROWS - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * ROWS)))];
  }
  // Paint every square between two points so fast strokes have no gaps
  function stroke(a, b) {
    let [x0, y0] = a; const [x1, y1] = b;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      for (const [x, y] of brushCells([x0, y0])) paintCell(x, y);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    scheduleFlush(); setStatus(); redraw();
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (!loaded || moveMode || e.button > 0) return;
    e.preventDefault();
    painting = true; last = cellAt(e); cursor = last;
    canvas.setPointerCapture(e.pointerId);
    stroke(last, last);
  });
  canvas.addEventListener('pointermove', (e) => {
    const c = cellAt(e);
    if (painting) { stroke(last, c); last = c; cursor = c; }
    if (e.pointerType === 'mouse') hover = c;
    setStatus(); redraw();
  });
  // Save as soon as a click or stroke ends (drags save every FLUSH_MS while drawing)
  const endStroke = () => { if (!painting) return; painting = false; last = null; clearTimeout(flushTimer); flushTimer = null; flush(); redraw(); };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('pointerleave', () => { hover = null; setStatus(); redraw(); });
  // Keyboard: arrows move a cursor, Enter/Space paints there, Shift+arrows paints as it moves
  canvas.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (d) {
      e.preventDefault(); e.stopPropagation();
      cursor = [Math.max(0, Math.min(COLS - 1, cursor[0] + d[0])), Math.max(0, Math.min(ROWS - 1, cursor[1] + d[1]))]; hover = null;
      if (e.shiftKey && loaded) stroke(cursor, cursor);
    } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (loaded) stroke(cursor, cursor); }
    else return;
    setStatus(); redraw();
  });
  canvas.addEventListener('focus', () => { setStatus(); redraw(); });
  canvas.addEventListener('blur', () => { setStatus(); redraw(); });

  // ---------- Tools: palette + eraser, brush size, paint/move on touch screens ----------
  const paletteEl = $('.guest-palette');
  const pick = (c) => {
    color = c; store.set('guestwall:color', String(c));
    paletteEl.querySelectorAll('[data-color]').forEach((s) => s.setAttribute('aria-pressed', String(+s.dataset.color === c)));
    redraw();
  };
  [...PALETTE.map(([hex, name], i) => [i, hex, name]), [BLANK, PAPER, 'Eraser']].forEach(([i, hex, name]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = i === BLANK ? 'guest-swatch guest-eraser' : 'guest-swatch';
    b.dataset.color = i; b.style.setProperty('--c', hex);
    b.setAttribute('aria-label', name); b.title = name;
    b.addEventListener('click', () => pick(i));
    paletteEl.append(b);
  });
  pick(color);
  root.querySelectorAll('[data-brush]').forEach((b) => {
    b.setAttribute('aria-pressed', String(+b.dataset.brush === brush));
    b.addEventListener('click', () => {
      brush = +b.dataset.brush; store.set('guestwall:brush', String(brush));
      root.querySelectorAll('[data-brush]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
      redraw();
    });
  });
  root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    moveMode = b.dataset.mode === 'move';
    root.classList.toggle('moving', moveMode);
    root.querySelectorAll('[data-mode]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
  }));

  // ---------- Live updates while the wall is on screen ----------
  let visible = false, timer = null;
  async function tick() {
    timer = 'busy';
    try { await poll(); loadError = false; redraw(); } catch { loadError = true; }
    setStatus();
    timer = visible && !document.hidden ? setTimeout(tick, POLL_MS) : null;
  }
  const wake = () => { if ((!loaded || visible) && !document.hidden && !timer) tick(); };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; wake(); }, { rootMargin: '200px' }).observe(root);
  document.addEventListener('visibilitychange', wake);
  // Best effort when the page closes: leaving cancels a save that's still in flight,
  // so resend it with anything queued. (Browsers may drop this: the API key header
  // needs a CORS preflight, which keepalive requests can't always wait for.)
  window.addEventListener('pagehide', () => {
    if (loaded) saveSnapshot();
    const pending = new Map([...inflight, ...queue]);
    if (pending.size) fetch(endpoint('rpc/paint_pixels'), { method: 'POST', keepalive: true, headers, body: paintBody([...pending].slice(-BATCH)) }).catch(() => {});
  });
  loadSnapshot(); snapshotShown = grid.some((c) => c !== BLANK);
  draw(); setStatus();
  wake(); // start the first load now instead of waiting for the wall to scroll into view
})();
