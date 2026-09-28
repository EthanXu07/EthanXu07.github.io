// =====================================================================
//  Guestbook pixel wall: a shared 64×64 r/place-style canvas.
//  Anyone can paint one pixel every 5 seconds, no sign-in.
//  Shared mode needs Supabase keys in site-config.js (SITE.pixelWall) and
//  supabase/pixel-wall.sql run once. Without them the wall still works,
//  but saves only in this browser.
// =====================================================================
(() => {
  const canvas = document.getElementById('wall');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const $id = (id) => document.getElementById(id);

  const SIZE = 64;
  const CELL = 10;
  const COOLDOWN_MS = 5000;
  const POLL_MS = 3000;
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
  let cursor = { x: 32, y: 32 };
  let hover = null;
  let lastSync = null;
  let lastPlaced = 0;
  try { lastPlaced = Number(localStorage.getItem('pixelWallLast')) || 0; } catch { /* storage blocked */ }

  canvas.width = SIZE * CELL;
  canvas.height = SIZE * CELL;

  // ---------- Palette ----------
  const paletteEl = $id('wallPalette');
  PALETTE.forEach(([hex, name], i) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.setProperty('--c', hex);
    b.title = name;
    b.setAttribute('aria-label', name);
    b.setAttribute('aria-pressed', String(i === selected));
    b.addEventListener('click', () => selectColor(i));
    paletteEl.appendChild(b);
  });
  function selectColor(i) {
    selected = i;
    paletteEl.querySelectorAll('.swatch').forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
    $id('wallColorName').textContent = PALETTE[i][1];
    $id('wallColorChip').style.background = PALETTE[i][0];
    render();
  }

  // ---------- Rendering ----------
  function render() {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        ctx.fillStyle = PALETTE[grid[y * SIZE + x]][0];
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
    // faint grid
    ctx.fillStyle = 'rgba(15, 23, 20, 0.06)';
    for (let i = 1; i < SIZE; i++) {
      ctx.fillRect(i * CELL, 0, 1, canvas.height);
      ctx.fillRect(0, i * CELL, canvas.width, 1);
    }
    // preview + outline where you'd paint
    const target = hover || cursor;
    if (target) {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = PALETTE[selected][0];
      ctx.fillRect(target.x * CELL, target.y * CELL, CELL, CELL);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#0f1714';
      ctx.lineWidth = 2;
      ctx.strokeRect(target.x * CELL + 1, target.y * CELL + 1, CELL - 2, CELL - 2);
    }
    $id('wallCoords').textContent = `(${target.x}, ${target.y})`;
    let painted = 0;
    for (const c of grid) if (c !== 0) painted++;
    $id('wallCount').textContent = painted.toLocaleString();
  }

  // ---------- Cooldown ----------
  const bar = $id('wallCooldownBar');
  const cdText = $id('wallCooldownText');
  function tickCooldown() {
    const left = Math.max(0, COOLDOWN_MS - (Date.now() - lastPlaced));
    bar.style.width = `${100 - (left / COOLDOWN_MS) * 100}%`;
    cdText.textContent = left > 0 ? `Next pixel in ${(left / 1000).toFixed(1)}s` : 'Ready to paint!';
    canvas.classList.toggle('cooling', left > 0);
  }
  setInterval(tickCooldown, 100);

  function message(text, kind = '') {
    const el = $id('wallMessage');
    el.textContent = text;
    el.dataset.kind = kind;
  }

  // ---------- Placing ----------
  async function place(x, y) {
    if (Date.now() - lastPlaced < COOLDOWN_MS) { message('Hold on! One pixel every 5 seconds.', 'warn'); return; }
    const i = y * SIZE + x;
    const before = grid[i];
    grid[i] = selected;
    lastPlaced = Date.now();
    try { localStorage.setItem('pixelWallLast', String(lastPlaced)); } catch { /* ignore */ }
    render();
    if (!shared) { saveLocal(); message(`Painted (${x}, ${y}).`, 'ok'); return; }
    try {
      const res = await fetch(`${api}/rpc/place_pixel`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ px: x, py: y, pc: selected }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      message(`Painted (${x}, ${y}). Everyone can see it now.`, 'ok');
    } catch (err) {
      grid[i] = before;
      render();
      message(String(err.message).includes('cooldown') ? 'Hold on! One pixel every 5 seconds.' : 'Could not save that pixel. Try again in a moment.', 'warn');
    }
  }

  // ---------- Input: mouse / touch / keyboard ----------
  function cellFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * SIZE);
    const y = Math.floor(((e.clientY - r.top) / r.height) * SIZE);
    return x >= 0 && y >= 0 && x < SIZE && y < SIZE ? { x, y } : null;
  }
  canvas.addEventListener('pointermove', (e) => { hover = cellFromEvent(e); render(); });
  canvas.addEventListener('pointerleave', () => { hover = null; render(); });
  canvas.addEventListener('click', (e) => {
    const c = cellFromEvent(e);
    if (!c) return;
    cursor = c;
    place(c.x, c.y);
  });
  canvas.addEventListener('keydown', (e) => {
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[e.key]) {
      e.preventDefault();
      hover = null;
      cursor = { x: Math.max(0, Math.min(SIZE - 1, cursor.x + moves[e.key][0])), y: Math.max(0, Math.min(SIZE - 1, cursor.y + moves[e.key][1])) };
      render();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      place(cursor.x, cursor.y);
    }
  });

  // ---------- Storage: shared (Supabase) or this browser only ----------
  function saveLocal() {
    try { localStorage.setItem('pixelWallLocal', btoa(String.fromCharCode(...grid))); } catch { /* ignore */ }
  }
  function loadLocal() {
    try {
      const raw = localStorage.getItem('pixelWallLocal');
      if (raw) atob(raw).split('').forEach((ch, i) => { grid[i] = ch.charCodeAt(0) & 15; });
    } catch { /* ignore */ }
  }

  function apply(rows) {
    for (const r of rows) {
      grid[r.y * SIZE + r.x] = r.color;
      if (!lastSync || r.updated_at > lastSync) lastSync = r.updated_at;
    }
  }

  async function loadShared() {
    // PostgREST caps rows per request, so page through the wall
    for (let offset = 0; ; offset += 1000) {
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
      const res = await fetch(`${api}/pixels?select=x,y,color,updated_at&order=updated_at.asc${since}`, { headers });
      if (res.ok) {
        const rows = await res.json();
        if (rows.length) { apply(rows); render(); }
        $id('wallLive').dataset.state = 'live';
      } else {
        $id('wallLive').dataset.state = 'error';
      }
    } catch {
      $id('wallLive').dataset.state = 'error';
    }
  }

  // ---------- Start ----------
  selectColor(selected);
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
  tickCooldown();
})();
