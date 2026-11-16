// =====================================================================
//  Leaderboard for the title-screen platformer (home.js).
//  Two boards: "speed" (fastest clear, ms, lower is better) and "score"
//  (highest score, higher is better).
//  Global when SITE.supabase has a Supabase url + anon key (table setup in
//  tools/leaderboard.sql); otherwise scores are kept in this browser only.
// =====================================================================
window.Leaderboard = (() => {
  const cfg = window.SITE?.supabase || {};
  const global = !!(cfg.url && cfg.anonKey);
  const LOCAL_KEY = 'leaderboard:v1';
  const NAME_KEY = 'leaderboard:name';   // the last name used (older saves)
  const NAMES_KEY = 'leaderboard:names'; // names used in this browser, newest first: the "accounts" offered after a run
  const TOP = 10;
  const asc = (mode) => mode === 'speed';

  const store = {
    read() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || { speed: [], score: [] }; } catch { return { speed: [], score: [] }; } },
    write(v) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const sortRows = (mode, rows) => rows.sort((a, b) => (asc(mode) ? a.value - b.value : b.value - a.value) || a.created_at.localeCompare(b.created_at));

  async function api(path, opts = {}) {
    const url = `${cfg.url.replace(/\/$/, '')}/rest/v1/${path}`;
    // Reads put the key in the URL and send no custom headers, so the browser skips
    // the CORS preflight round trip
    if (!opts.method) {
      const res = await fetch(`${url}&apikey=${encodeURIComponent(cfg.anonKey)}`);
      if (!res.ok) throw new Error(`Leaderboard ${res.status}`);
      return res.json();
    }
    const res = await fetch(url, {
      ...opts,
      // Legacy anon keys are JWTs and also go in Authorization; new sb_publishable_ keys only go in apikey
      headers: { apikey: cfg.anonKey, ...(cfg.anonKey.startsWith('eyJ') && { Authorization: `Bearer ${cfg.anonKey}` }), 'Content-Type': 'application/json', ...opts.headers },
    });
    if (!res.ok) throw new Error(`Leaderboard ${res.status}`);
    return res.status === 201 || res.status === 204 ? null : res.json();
  }

  // Global boards are cached for a minute (and fetched ahead of time by prefetch())
  // so the leaderboard opens instantly
  const cache = {};
  function top(mode, n = TOP) {
    if (!global) return Promise.resolve(sortRows(mode, store.read()[mode] || []).slice(0, n));
    const hit = cache[mode];
    if (n === TOP && hit && Date.now() - hit.at < 60000) return hit.rows;
    const rows = api(`leaderboard?select=name,value,created_at&mode=eq.${mode}&order=value.${asc(mode) ? 'asc' : 'desc'},created_at.asc&limit=${n}`);
    if (n === TOP) { cache[mode] = { at: Date.now(), rows }; rows.catch(() => { delete cache[mode]; }); }
    return rows;
  }
  const prefetch = () => { if (global) ['speed', 'score'].forEach((m) => top(m)); };

  // Returns the 1-based rank this entry landed at. Guest runs aren't remembered as a name.
  async function submit(mode, name, value, { guest = false } = {}) {
    name = cleanName(name);
    value = Math.round(value);
    if (!guest) remember(name);
    const created_at = new Date().toISOString();
    if (global) {
      await api('leaderboard', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ mode, name, value }) });
      delete cache[mode];
      const better = await api(`leaderboard?select=value&mode=eq.${mode}&value=${asc(mode) ? 'lt' : 'gt'}.${value}&limit=1000`);
      return better.length + 1;
    }
    const all = store.read();
    all[mode] = sortRows(mode, [...(all[mode] || []), { name, value, created_at }]).slice(0, 50);
    store.write(all);
    return all[mode].findIndex((r) => r.created_at === created_at && r.name === name) + 1 || all[mode].length + 1;
  }
  const cleanName = (s) => String(s || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 12) || 'Player';
  const recentNames = () => {
    let names = [];
    try { names = JSON.parse(localStorage.getItem(NAMES_KEY)) || []; } catch { /* ignore */ }
    try { const last = localStorage.getItem(NAME_KEY); if (last && !names.includes(last)) names.unshift(last); } catch { /* ignore */ }
    return names.filter((n) => typeof n === 'string' && n && !isGuest(n)).slice(0, 3);
  };
  function remember(name) {
    if (isGuest(name)) return;
    const names = [name, ...recentNames().filter((n) => n.toLowerCase() !== name.toLowerCase())].slice(0, 3);
    try { localStorage.setItem(NAME_KEY, name); localStorage.setItem(NAMES_KEY, JSON.stringify(names)); } catch { /* private mode */ }
  }
  const savedName = () => recentNames()[0] || '';

  // Default names: adjective + creature, always ≤ 12 characters
  const ADJ = ['Swift', 'Pixel', 'Brave', 'Lucky', 'Sunny', 'Turbo', 'Mossy', 'Quiet', 'Jolly', 'Rusty', 'Cosmic', 'Sneaky'];
  const NOUN = ['Otter', 'Fox', 'Frog', 'Comet', 'Koala', 'Gecko', 'Panda', 'Moth', 'Yeti', 'Crab', 'Owl', 'Bean'];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  function suggestNames(n = 2) {
    const out = new Set();
    while (out.size < n) { const s = pick(ADJ) + pick(NOUN); if (s.length <= 12) out.add(s); }
    return [...out];
  }
  const guestName = () => `Guest-${100 + Math.floor(Math.random() * 900)}`;
  const isGuest = (name) => /^Guest(-\d+)?$/i.test(name);
  const fmtTime = (ms) => { const s = ms / 1000, m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`; };
  const fmt = (mode, v) => (mode === 'speed' ? fmtTime(v) : v.toLocaleString());

  return { global, top, prefetch, submit, savedName, recentNames, suggestNames, guestName, fmt, fmtTime, cleanName };
})();
