// =====================================================================
//  Guestbook pixel wall: a shared 128×128 r/place-style canvas.
//  Anyone can paint, no sign-in, no cooldown. Click or drag to draw;
//  zoom, brush sizes and an eyedropper help with detail. Painted pixels
//  are sent in small batches (a generous server-side cap stops bots).
//  Shared mode needs Supabase keys in site-config.js (SITE.pixelWall) and
//  supabase/pixel-wall.sql run once; otherwise it saves in this browser only.
// =====================================================================
(() => {
  const canvas = document.getElementById('wall');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const $id = (id) => document.getElementById(id);
  const scroller = $id('wallScroll');

  const SIZE = 128;
  const CELL = 6;
  const POLL_MS = 3000;
  const FLUSH_MS = 250;
  const PALETTE = [
    ['#f1e6cc', 'Parchment'], ['#ffffff', 'White'], ['#b9b39c', 'Stone'], ['#5e4b3c', 'Bark'],
    ['#2a1f1a', 'Ink'], ['#0f1714', 'Night'], ['#d4553a', 'Tomato'], ['#9c3423', 'Brick'],
    ['#e8a93a', 'Gold'], ['#f3c969', 'Sun'], ['#7aa35a', 'Grass'], ['#3f7a5a', 'Pine'],
    ['#5f9c8f', 'Sage'], ['#8fb8c9', 'Sky'], ['#3b5a8c', 'Berkeley blue'], ['#9c6b8e', 'Plum'],
  ];

  const cfg = (window.SITE && window.SITE.pixelWall) || {};
  const shared = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
  const api = shared ? cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1' : null;
  const headers = shared ? { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${cfg.supabaseAnonKey}` } : {};

  const grid = new Uint8Array(SIZE * SIZE);
  let selected = 6;
  let brush = 1;
  let tool = 'paint'; // paint | pick | pan
  let zoom = 1;
  let cursor = { x: 64, y: 64 };
  let hover = null;
  let lastSync = null;
  const pending = new Map(); // "x,y" -> color, waiting to be sent
  let sending = false;
  let myCount = 0;

  canvas.width = SIZE * CELL;
  canvas.height = SIZE * CELL;

  // ---------- Controls ----------
  const paletteEl = $id('wallPalette');
  PALETTE.forEach(([hex, name], i) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.setProperty('--c', hex);
    b.title = name;
    b.setAttribute('aria-label', name);
    b.addEventListener('click', () => { selectColor(i); if (tool === 'pick') setTool('paint'); });
    paletteEl.appendChild(b);
  });
  function selectColor(i) {
    selected = i;
    paletteEl.querySelectorAll('.swatch').forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
    $id('wallColorName').textContent = PALETTE[i][1];
    $id('wallColorChip').style.background = PALETTE[i][0];
    render();
  }
  function setGroup(attr, value) {
    document.querySelectorAll(`[data-${attr}]`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(value))));
  }
  function setTool(t) {
    tool = t;
    setGroup('tool', t);
    canvas.dataset.tool = t;
  }
  function setZoom(z) {
    // Keep the center of the view steady while zooming
    const cx = (scroller.scrollLeft + scroller.clientWidth / 2) / scroller.scrollWidth;
    const cy = (scroller.scrollTop + scroller.clientHeight / 2) / scroller.scrollHeight;
    zoom = z;
    canvas.style.width = `${z * 100}%`;
    setGroup('zoom', z);
    scroller.scrollLeft = cx * scroller.scrollWidth - scroller.clientWidth / 2;
    scroller.scrollTop = cy * scroller.scrollHeight - scroller.clientHeight / 2;
    render();
  }
  document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  document.querySelectorAll('[data-brush]').forEach((b) => b.addEventListener('click', () => { brush = Number(b.dataset.brush); setGroup('brush', brush); render(); }));
  document.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => setZoom(Number(b.dataset.zoom))));

  // ---------- Rendering ----------
  let raf = 0;
  function render() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; draw(); });
  }
  function draw() {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        ctx.fillStyle = PALETTE[grid[y * SIZE + x]][0];
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
    if (zoom >= 2) { // grid lines only when zoomed in
      ctx.fillStyle = 'rgba(15, 23, 20, 0.07)';
      for (let i = 1; i < SIZE; i++) { ctx.fillRect(i * CELL, 0, 1, canvas.height); ctx.fillRect(0, i * CELL, canvas.width, 1); }
    }
    const target = hover || cursor;
    if (target && tool !== 'pan') {
      const cells = brushCells(target.x, target.y);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = tool === 'pick' ? '#ffffff' : PALETTE[selected][0];
      for (const [x, y] of cells) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      ctx.globalAlpha = 1;
      const [minX, minY] = cells[0];
      const size = tool === 'pick' ? 1 : brush;
      ctx.strokeStyle = '#0f1714';
      ctx.lineWidth = 2;
      ctx.strokeRect(minX * CELL + 1, minY * CELL + 1, size * CELL - 2, size * CELL - 2);
    }
    $id('wallCoords').textContent = target ? `(${target.x}, ${target.y})` : '';
    let painted = 0;
    for (const c of grid) if (c !== 0) painted++;
    $id('wallCount').textContent = painted.toLocaleString();
    $id('wallMine').textContent = myCount.toLocaleString();
  }

  function brushCells(cx, cy) {
    const size = tool === 'pick' ? 1 : brush;
    const x0 = Math.max(0, Math.min(SIZE - size, cx - Math.floor((size - 1) / 2)));
    const y0 = Math.max(0, Math.min(SIZE - size, cy - Math.floor((size - 1) / 2)));
    const out = [];
    for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) out.push([x, y]);
    return out;
  }

  function message(text, kind = '') {
    const el = $id('wallMessage');
    el.textContent = text;
    el.dataset.kind = kind;
  }

  // ---------- Painting ----------
  function paintAt(cx, cy) {
    for (const [x, y] of brushCells(cx, cy)) {
      const i = y * SIZE + x;
      if (grid[i] === selected && !pending.has(`${x},${y}`)) continue;
      grid[i] = selected;
      pending.set(`${x},${y}`, selected);
      myCount++;
    }
    render();
  }
  // Paint every cell along a drag, so fast strokes don't leave gaps
  function paintLine(a, b) {
    let { x: x0, y: y0 } = a;
    const { x: x1, y: y1 } = b;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      paintAt(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  async function flush() {
    if (sending || pending.size === 0) return;
    if (!shared) { pending.clear(); saveLocal(); return; }
    sending = true;
    const batch = [...pending.entries()].slice(0, 500);
    batch.forEach(([k]) => pending.delete(k));
    const items = batch.map(([k, c]) => { const [x, y] = k.split(',').map(Number); return [x, y, c]; });
    try {
      const res = await fetch(`${api}/rpc/place_pixels`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      message('Saved. Everyone can see your pixels.', 'ok');
    } catch (err) {
      // Put them back so they're retried (unless the server rejected them outright)
      if (String(err.message).includes('slow_down')) {
        message('Whoa, that\'s a lot of pixels! Take a breather for a few seconds.', 'warn');
        batch.forEach(([k, c]) => pending.set(k, c));
      } else if (String(err.message).includes('bad_pixel')) {
        message('Something went wrong with those pixels.', 'warn');
      } else {
        message('Connection hiccup. Retrying…', 'warn');
        batch.forEach(([k, c]) => pending.set(k, c));
      }
    } finally {
      sending = false;
    }
  }
  setInterval(flush, FLUSH_MS);
  window.addEventListener('pagehide', flush);

  // ---------- Input ----------
  function cellFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * SIZE);
    const y = Math.floor(((e.clientY - r.top) / r.height) * SIZE);
    return x >= 0 && y >= 0 && x < SIZE && y < SIZE ? { x, y } : null;
  }
  let drawing = false, last = null, panStart = null;
  canvas.addEventListener('pointerdown', (e) => {
    const c = cellFromEvent(e);
    if (tool === 'pan' || e.button === 1) {
      panStart = { x: e.clientX, y: e.clientY, left: scroller.scrollLeft, top: scroller.scrollTop };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (!c) return;
    if (tool === 'pick' || e.altKey) { selectColor(grid[c.y * SIZE + c.x]); setTool('paint'); return; }
    e.preventDefault();
    drawing = true;
    last = c;
    cursor = c;
    canvas.setPointerCapture(e.pointerId);
    paintAt(c.x, c.y);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (panStart) {
      scroller.scrollLeft = panStart.left - (e.clientX - panStart.x);
      scroller.scrollTop = panStart.top - (e.clientY - panStart.y);
      return;
    }
    const c = cellFromEvent(e);
    hover = c;
    if (drawing && c && last && (c.x !== last.x || c.y !== last.y)) { paintLine(last, c); last = c; }
    render();
  });
  const stop = () => { drawing = false; last = null; panStart = null; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  canvas.addEventListener('pointerleave', () => { hover = null; render(); });
  canvas.addEventListener('keydown', (e) => {
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[e.key]) {
      e.preventDefault();
      hover = null;
      cursor = { x: Math.max(0, Math.min(SIZE - 1, cursor.x + moves[e.key][0])), y: Math.max(0, Math.min(SIZE - 1, cursor.y + moves[e.key][1])) };
      if (e.shiftKey) paintAt(cursor.x, cursor.y); // Shift+arrows draws a line
      render();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      paintAt(cursor.x, cursor.y);
    }
  });

  // ---------- Storage: shared (Supabase) or this browser only ----------
  function saveLocal() {
    try {
      let s = '';
      for (let i = 0; i < grid.length; i += 2) s += String.fromCharCode((grid[i] << 4) | grid[i + 1]);
      localStorage.setItem('pixelWall128', btoa(s));
    } catch { /* storage blocked or full */ }
  }
  function loadLocal() {
    try {
      const raw = localStorage.getItem('pixelWall128');
      if (!raw) return;
      const s = atob(raw);
      for (let i = 0; i < s.length; i++) { const b = s.charCodeAt(i); grid[i * 2] = b >> 4; grid[i * 2 + 1] = b & 15; }
    } catch { /* ignore */ }
  }

  function apply(rows) {
    for (const r of rows) {
      const k = `${r.x},${r.y}`;
      if (!pending.has(k)) grid[r.y * SIZE + r.x] = r.color; // don't clobber strokes still being sent
      if (!lastSync || r.updated_at > lastSync) lastSync = r.updated_at;
    }
  }
  async function loadShared() {
    for (let offset = 0; ; offset += 1000) { // PostgREST caps rows per request
      const res = await fetch(`${api}/pixels?select=x,y,color,updated_at&order=updated_at.asc&limit=1000&offset=${offset}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      apply(rows);
      if (rows.length < 1000) break;
    }
  }
  async function poll() {
    try {
      const since = lastSync ? `&updated_at=gt.${encodeURIComponent(lastSync)}` : '';
      const res = await fetch(`${api}/pixels?select=x,y,color,updated_at&order=updated_at.asc&limit=5000${since}`, { headers });
      if (!res.ok) throw new Error();
      const rows = await res.json();
      if (rows.length) { apply(rows); render(); }
      $id('wallLive').dataset.state = 'live';
    } catch {
      $id('wallLive').dataset.state = 'error';
    }
  }

  // ---------- Start ----------
  selectColor(selected);
  setTool('paint');
  setGroup('brush', brush);
  setGroup('zoom', zoom);
  if (shared) {
    $id('wallMode').textContent = 'Live · shared with everyone';
    loadShared()
      .then(() => { render(); $id('wallLive').dataset.state = 'live'; })
      .catch(() => { $id('wallLive').dataset.state = 'error'; message('Could not load the wall right now.', 'warn'); });
    setInterval(() => { if (document.visibilityState === 'visible') poll(); }, POLL_MS);
  } else {
    $id('wallMode').textContent = 'Preview · saved in this browser only';
    $id('wallLive').dataset.state = 'local';
    loadLocal();
    render();
  }

  // Test hook: ?debug exposes state for automated checks
  if (new URLSearchParams(location.search).has('debug')) window.__wall = () => ({ grid, pending, myCount, SIZE });
})();
