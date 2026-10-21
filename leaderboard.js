// =====================================================================
//  Leaderboard for the title-screen platformer (home.js).
//  Two boards: "speed" (fastest clear, ms, lower is better) and "score"
//  (highest score, higher is better).
//  Global when SITE.leaderboard has a Supabase url + anon key (table setup in
//  tools/leaderboard.sql); otherwise scores are kept in this browser only.
// =====================================================================
window.Leaderboard = (() => {
  const cfg = window.SITE?.leaderboard || {};
  const global = !!(cfg.url && cfg.anonKey);
  const LOCAL_KEY = 'leaderboard:v1';
  const NAME_KEY = 'leaderboard:name';
  const TOP = 10;
  const asc = (mode) => mode === 'speed';

  const store = {
    read() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || { speed: [], score: [] }; } catch { return { speed: [], score: [] }; } },
    write(v) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const sortRows = (mode, rows) => rows.sort((a, b) => (asc(mode) ? a.value - b.value : b.value - a.value) || a.created_at.localeCompare(b.created_at));

  async function api(path, opts = {}) {
    const res = await fetch(`${cfg.url.replace(/\/$/, '')}/rest/v1/${path}`, {
      ...opts,
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}`, 'Content-Type': 'application/json', ...opts.headers },
    });
    if (!res.ok) throw new Error(`Leaderboard ${res.status}`);
    return res.status === 201 || res.status === 204 ? null : res.json();
  }

  async function top(mode, n = TOP) {
    if (!global) return sortRows(mode, store.read()[mode] || []).slice(0, n);
    return api(`leaderboard?select=name,value,created_at&mode=eq.${mode}&order=value.${asc(mode) ? 'asc' : 'desc'},created_at.asc&limit=${n}`);
  }

  // Returns the 1-based rank this entry landed at
  async function submit(mode, name, value) {
    name = cleanName(name);
    value = Math.round(value);
    try { localStorage.setItem(NAME_KEY, name); } catch { /* ignore */ }
    const created_at = new Date().toISOString();
    if (global) {
      await api('leaderboard', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ mode, name, value }) });
      const better = await api(`leaderboard?select=value&mode=eq.${mode}&value=${asc(mode) ? 'lt' : 'gt'}.${value}&limit=1000`);
      return better.length + 1;
    }
    const all = store.read();
    all[mode] = sortRows(mode, [...(all[mode] || []), { name, value, created_at }]).slice(0, 50);
    store.write(all);
    return all[mode].findIndex((r) => r.created_at === created_at && r.name === name) + 1 || all[mode].length + 1;
  }
  const cleanName = (s) => String(s || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 12) || 'Player';
  const savedName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };
  const fmtTime = (ms) => { const s = ms / 1000, m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`; };
  const fmt = (mode, v) => (mode === 'speed' ? fmtTime(v) : v.toLocaleString());

  return { global, top, submit, savedName, fmt, fmtTime, cleanName };
})();
