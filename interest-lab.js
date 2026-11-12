/* Field notebook: one small interactive tool per interest page.
   build.mjs renders <section class="lab" data-lab="kind"> from the `lab` field in
   src/interests.json; this file fills its .lab-body. No dependencies. */
(() => {
  const root = document.querySelector('.lab[data-lab]');
  if (!root) return;
  const body = root.querySelector('.lab-body');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- tiny DOM helpers ------------------------------------------------------
  const h = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid);
    return n;
  };
  let uid = 0;
  const field = (label, input, hint) => {
    const id = `lab-f${++uid}`;
    input.id = id;
    return h('div', { class: 'lab-field' }, h('label', { for: id, text: label }), input,
      hint ? h('span', { class: 'lab-hint', text: hint }) : null);
  };
  const num = (value, min, max, step = 1) => h('input', { type: 'number', inputmode: 'decimal', value, min, max, step });
  const select = (options, value) => {
    const s = h('select');
    options.forEach(([v, t]) => s.append(h('option', { value: v, text: t })));
    s.value = value;
    return s;
  };
  const out = () => h('div', { class: 'lab-out', role: 'status', 'aria-live': 'polite' });
  const stat = (label, value, note) => h('div', { class: 'lab-stat' },
    h('span', { class: 'lab-stat-label', text: label }), h('b', { text: value }),
    note ? h('span', { class: 'lab-stat-note', text: note }) : null);
  const val = (input) => { const v = parseFloat(input.value); return Number.isFinite(v) ? v : 0; };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fmtTime = (hours) => {
    const m = Math.round(hours * 60);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
  };
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(`lab:${k}`)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(`lab:${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const live = (inputs, fn) => { inputs.forEach((i) => i.addEventListener('input', fn)); fn(); };
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // --- the tools ---------------------------------------------------------------
  const labs = {
    // Hiking: "book time" (30 min per mile + 30 min per 1,000 ft of gain) and a profile of the climb
    'trail-time'() {
      const dist = num(6, 0.5, 40, 0.5), gain = num(1500, 0, 10000, 100);
      const start = h('input', { type: 'time', value: '09:00' });
      const shape = select([['out', 'Out and back'], ['loop', 'Loop (climb first)'], ['up', 'One way up']], 'out');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 320 90');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('class', 'lab-profile');
      svg.setAttribute('aria-hidden', 'true');
      const o = out();
      body.append(h('div', { class: 'lab-grid' },
        field('Distance (miles)', dist), field('Elevation gain (ft)', gain),
        field('Route', shape), field('Start time', start)), svg, o);
      live([dist, gain, start, shape], () => {
        const d = val(dist), g = val(gain);
        const climbMiles = shape.value === 'up' ? d : shape.value === 'loop' ? d * 0.4 : d / 2;
        const perMile = climbMiles ? Math.round(g / climbMiles) : 0;
        const hours = d / 2 + (g / 1000) * 0.5;
        const [hh, mm] = (start.value || '09:00').split(':').map(Number);
        const end = new Date(2000, 0, 1, hh, mm + Math.round(hours * 60));
        const water = Math.max(0.5, Math.ceil(hours * 2) / 4 * 1);
        o.replaceChildren(
          stat('Moving time', fmtTime(hours), 'book time'),
          stat('Back by', end.toTimeString().slice(0, 5), end.getDate() > 1 ? 'next day!' : ''),
          stat('Water', `${water.toFixed(1)} L`, 'about ½ L an hour'),
          stat('Climb', perMile ? `${perMile} ft/mi` : '–',
            perMile > 1000 ? 'steep: hands on knees' : perMile > 500 ? 'a real climb' : perMile > 200 ? 'moderate' : 'gentle'));
        // profile: rises to the summit, then down (out and back / loop) or ends on top
        const peakX = shape.value === 'up' ? 300 : shape.value === 'loop' ? 120 : 160;
        const top = 80 - clamp(g / 60, 4, 70);
        const pts = [[10, 80], [peakX * 0.45, 80 - (80 - top) * 0.55], [peakX * 0.7, 80 - (80 - top) * 0.7], [peakX, top]];
        if (shape.value !== 'up') pts.push([peakX + (310 - peakX) * 0.4, 80 - (80 - top) * 0.5], [310, 80]);
        const line = pts.map((p) => p.join(',')).join(' ');
        svg.innerHTML = `<polygon points="10,86 ${line} ${pts.at(-1)[0]},86" fill="${css('--grass')}" opacity=".35"/>
          <polyline points="${line}" fill="none" stroke="${css('--grass')}" stroke-width="3" stroke-linejoin="bevel" vector-effect="non-scaling-stroke"/>
          <rect x="${peakX - 4}" y="${top - 12}" width="3" height="10" fill="${css('--text-dark')}"/>
          <rect x="${peakX - 1}" y="${top - 12}" width="8" height="5" fill="${css('--tomato')}"/>`;
      });
    },

    // Racket sports: reaction-time test
    reaction() {
      const pad = h('button', { type: 'button', class: 'lab-react is-idle', text: 'Click (or press Space) to start' });
      const o = out();
      let state = 'idle', timer = 0, t0 = 0, times = [];
      const show = () => {
        const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
        const b = store.get('reaction-best');
        o.replaceChildren(stat('Last', times.length ? `${times.at(-1)} ms` : '–'),
          stat('Average', avg ? `${avg} ms` : '–', `${times.length} of 5`),
          stat('Your best', b ? `${b} ms` : '–', 'saved in this browser'),
          stat('A badminton smash', '≈ 100 ms', 'to cross the court'));
      };
      const set = (s, text) => { state = s; pad.className = `lab-react is-${s}`; pad.textContent = text; };
      const press = () => {
        if (state === 'idle' || state === 'done' || state === 'early') {
          if (state === 'done') times = [];
          set('wait', 'Wait for green…');
          timer = setTimeout(() => { set('go', 'NOW!'); t0 = performance.now(); }, 900 + Math.random() * 2200);
        } else if (state === 'wait') {
          clearTimeout(timer); set('early', 'Too early! Click to try again');
        } else if (state === 'go') {
          const ms = Math.round(performance.now() - t0);
          times.push(ms);
          const b = store.get('reaction-best');
          if (!b || ms < b) store.set('reaction-best', ms);
          if (times.length >= 5) set('done', `${ms} ms. Round over. Click to go again`);
          else set('idle', `${ms} ms. Click for the next one (${times.length}/5)`);
          show();
        }
      };
      pad.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
      pad.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); press(); } });
      body.append(pad, o);
      show();
    },

    // Soccer: fair pickup teams by snake draft
    teams() {
      const names = h('textarea', { rows: 6, spellcheck: 'false' });
      names.value = 'Alex 4\nSam 3\nJordan 5\nRiley 2\nCasey 3\nMorgan 4\nTaylor 2\nJamie 3\nDrew 5\nQuinn 1';
      const n = select([['2', 'Two teams'], ['3', 'Three teams'], ['4', 'Four teams']], '2');
      const o = out();
      const go = () => {
        const players = names.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
          const m = l.match(/^(.*?)[\s,]+([1-5])$/);
          return { name: m ? m[1] : l, skill: m ? +m[2] : 3, r: Math.random() };
        });
        const k = +n.value;
        if (players.length < k) { o.replaceChildren(h('p', { text: `Need at least ${k} players.` })); return; }
        // sort by skill (random tiebreak), then snake: 1-2-2-1... so nobody stacks the top picks
        players.sort((a, b) => b.skill - a.skill || a.r - b.r);
        const teams = Array.from({ length: k }, () => []);
        players.forEach((p, i) => {
          const round = Math.floor(i / k), pos = i % k;
          teams[round % 2 ? k - 1 - pos : pos].push(p);
        });
        const colors = ['--tomato', '--sky', '--gold', '--grass'];
        o.replaceChildren(h('div', { class: 'lab-teams' }, teams.map((t, i) => h('div', { class: 'lab-team', style: `--tc: var(${colors[i]})` },
          h('h3', { text: `Team ${i + 1}` }),
          h('ul', {}, t.map((p) => h('li', {}, p.name, h('span', { class: 'lab-dots', 'aria-label': `skill ${p.skill}`, text: '●'.repeat(p.skill) })))),
          h('p', { class: 'lab-hint', text: `${t.length} players · strength ${t.reduce((a, p) => a + p.skill, 0)}` })))));
      };
      body.append(h('div', { class: 'lab-grid lab-grid-2' },
        field('Who showed up (name, then skill 1–5)', names, 'One per line. Skill is optional.'),
        h('div', {}, field('How many teams', n),
          h('button', { type: 'button', class: 'btn btn-gold', onclick: go, text: 'Pick teams ▶' }))), o);
      go();
    },

    // Swimming: pace per 100 and SWOLF
    pace() {
      const pool = select([['25y', '25 yd pool'], ['25m', '25 m pool'], ['50m', '50 m pool']], '25y');
      const lengths = num(40, 1, 400), mins = num(22, 0, 300), secs = num(30, 0, 59), strokes = num(16, 0, 60);
      const tape = h('div', { class: 'lab-tape', 'aria-hidden': 'true' });
      const o = out();
      body.append(h('div', { class: 'lab-grid' }, field('Pool', pool), field('Lengths swum', lengths),
        field('Time: minutes', mins), field('Time: seconds', secs), field('Strokes per length', strokes, 'for SWOLF')), tape, o);
      live([pool, lengths, mins, secs, strokes], () => {
        const len = parseInt(pool.value, 10), unit = pool.value.endsWith('y') ? 'yd' : 'm';
        const L = Math.max(1, Math.round(val(lengths))), total = val(mins) * 60 + val(secs);
        const dist = L * len, per100 = total / dist * 100, perLen = total / L;
        const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
        o.replaceChildren(stat('Distance', `${dist.toLocaleString()} ${unit}`, unit === 'yd' ? `${Math.round(dist * 0.9144).toLocaleString()} m` : ''),
          stat(`Pace per 100 ${unit}`, total ? mmss(per100) : '–'),
          stat('Per length', total ? `${perLen.toFixed(1)} s` : '–'),
          stat('SWOLF', total && val(strokes) ? Math.round(perLen + val(strokes)) : '–', 'strokes + seconds per length; lower is better'));
        tape.replaceChildren(...Array.from({ length: Math.min(L, 120) }, (_, i) => h('span', { class: i % 2 ? 'back' : '' })));
      });
    },

    // Gym: estimated 1RM (Epley) + plate loader for a 45 lb bar
    lift() {
      const weight = num(185, 45, 1000, 5), reps = num(5, 1, 15);
      const target = num(225, 45, 1000, 5);
      const o = out(), bar = h('div', { class: 'lab-bar', 'aria-hidden': 'true' }), plates = h('p', { class: 'lab-hint' });
      body.append(h('div', { class: 'lab-grid' }, field('Weight lifted (lb)', weight), field('Reps', reps),
        field('Load the bar to (lb)', target, '45 lb bar')), o, bar, plates);
      const PLATES = [[45, 'p45'], [35, 'p35'], [25, 'p25'], [10, 'p10'], [5, 'p5'], [2.5, 'p2']];
      live([weight, reps, target], () => {
        const w = val(weight), r = clamp(Math.round(val(reps)), 1, 15);
        const one = r === 1 ? w : w * (1 + r / 30);
        o.replaceChildren(stat('Estimated 1-rep max', `${Math.round(one)} lb`, 'Epley formula'),
          stat('Next week (+2.5%)', `${Math.round(w * 1.025 / 5) * 5} lb × ${r}`),
          stat('After 12 weeks', `${Math.round(w * 1.025 ** 12 / 5) * 5} lb`, 'small steps compound'));
        let side = Math.max(0, (val(target) - 45) / 2);
        const load = [];
        for (const [p, cls] of PLATES) while (side >= p - 1e-9) { load.push([p, cls]); side -= p; }
        const left = [...load].reverse().map(([p, c]) => h('span', { class: `plate ${c}`, title: `${p} lb` }));
        const right = load.map(([p, c]) => h('span', { class: `plate ${c}`, title: `${p} lb` }));
        bar.replaceChildren(h('span', { class: 'bar-end' }), ...left, h('span', { class: 'bar-mid' }), ...right, h('span', { class: 'bar-end' }));
        plates.textContent = load.length ? `Each side: ${load.map(([p]) => p).join(' + ')} lb${side > 0.01 ? ` (${(side * 2).toFixed(1)} lb short of the target)` : ''}`
          : 'Just the bar. Everyone starts somewhere.';
      });
    },

    // Eating: spin the cuisine wheel
    wheel() {
      const items = ['Ramen', 'Pho', 'Dumplings', 'Hot pot', 'Korean BBQ', 'Tacos', 'Sandwiches', 'Hand-pulled noodles', 'Sushi', 'Something new'];
      const c = h('canvas', { width: 320, height: 320, class: 'lab-wheel', role: 'img', 'aria-label': `Wheel of ${items.length} cuisines` });
      const o = out();
      const spin = h('button', { type: 'button', class: 'btn btn-gold', text: 'Spin ▶' });
      body.append(h('div', { class: 'lab-wheel-wrap' }, c, h('div', {}, spin, o)));
      const ctx = c.getContext('2d');
      const cols = ['--tomato', '--gold', '--sage', '--sky', '--plum', '--grass'].map(css);
      let angle = 0;
      const draw = () => {
        const n = items.length, R = 150;
        ctx.clearRect(0, 0, 320, 320);
        ctx.save(); ctx.translate(160, 160); ctx.rotate(angle);
        items.forEach((it, i) => {
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, (i / n) * 2 * Math.PI, ((i + 1) / n) * 2 * Math.PI);
          ctx.fillStyle = cols[i % cols.length]; ctx.fill();
          ctx.strokeStyle = css('--edge'); ctx.lineWidth = 3; ctx.stroke();
          const mid = ((i + 0.5) / n) * 2 * Math.PI;
          const abs = ((mid + angle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
          const flip = abs > Math.PI / 2 && abs < 1.5 * Math.PI;
          ctx.save(); ctx.rotate(mid); ctx.fillStyle = css('--edge'); ctx.font = '600 13px "Pixelify Sans", monospace';
          if (flip) { ctx.rotate(Math.PI); ctx.textAlign = 'left'; ctx.fillText(it, -(R - 10), 5); }
          else { ctx.textAlign = 'right'; ctx.fillText(it, R - 10, 5); }
          ctx.restore();
        });
        ctx.restore();
        ctx.fillStyle = css('--edge'); ctx.beginPath(); ctx.moveTo(306, 160); ctx.lineTo(320, 150); ctx.lineTo(320, 170); ctx.fill();
        ctx.fillStyle = css('--paper'); ctx.fillRect(150, 150, 20, 20); ctx.strokeRect(150, 150, 20, 20);
      };
      const result = () => {
        const n = items.length, a = ((-angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const pick = items[Math.floor(a / (2 * Math.PI) * n) % n];
        o.replaceChildren(stat('Tonight', pick, pick === 'Something new' ? 'pick a cuisine you have never tried' : 'house rules: share everything, save room for dessert'));
      };
      spin.addEventListener('click', () => {
        const from = angle, to = angle + 2 * Math.PI * (4 + Math.random() * 3), dur = reduce ? 0 : 2600, t0 = performance.now();
        spin.disabled = true;
        const step = (t) => {
          const k = dur ? Math.min(1, (t - t0) / dur) : 1;
          angle = from + (to - from) * (1 - (1 - k) ** 3);
          draw();
          if (k < 1) requestAnimationFrame(step); else { spin.disabled = false; result(); }
        };
        requestAnimationFrame(step);
      });
      document.fonts?.ready.then(draw);
      draw();
      o.replaceChildren(stat('Tonight', '?', 'spin to decide'));
    },

    // Card games: pot odds vs equity from outs
    'pot-odds'() {
      const pot = num(100, 0, 1e6), call = num(25, 0, 1e6), outs = num(9, 0, 30);
      const street = select([['flop', 'On the flop (two cards to come)'], ['turn', 'On the turn (one card to come)']], 'flop');
      const preset = select([['', 'Common draws…'], ['9', 'Flush draw: 9 outs'], ['8', 'Open-ended straight draw: 8'], ['4', 'Gutshot: 4'],
        ['15', 'Flush + straight draw: 15'], ['2', 'Pocket pair to a set: 2'], ['6', 'Two overcards: 6']], '');
      const meter = h('div', { class: 'lab-meter', 'aria-hidden': 'true' }, h('span', { class: 'need' }), h('span', { class: 'have' }));
      const legend = h('p', { class: 'lab-hint', text: 'Bar: your equity. Black line: the equity you need. Green means the bar clears the line.' });
      const o = out();
      body.append(h('div', { class: 'lab-grid' }, field('Pot, including their bet', pot), field('To call', call),
        field('Outs', outs), field('Shortcut', preset), field('Street', street)), meter, legend, o);
      preset.addEventListener('change', () => { if (preset.value) { outs.value = preset.value; outs.dispatchEvent(new Event('input')); } });
      live([pot, call, outs, street], () => {
        const P = val(pot), C = val(call), x = clamp(Math.round(val(outs)), 0, 30);
        const odds = C ? C / (P + C) : 0;
        const unseen = 47;
        const exact = street.value === 'flop' ? 1 - ((unseen - x) / unseen) * ((unseen - 1 - x) / (unseen - 1)) : x / 46;
        const rule = Math.min(1, x * (street.value === 'flop' ? 4 : 2) / 100);
        const good = exact > odds;
        meter.querySelector('.need').style.width = `${odds * 100}%`;
        meter.querySelector('.have').style.width = `${exact * 100}%`;
        meter.classList.toggle('is-good', good);
        o.replaceChildren(stat('Pot odds (need)', `${(odds * 100).toFixed(1)}%`, C ? `${(P / C).toFixed(1)} : 1` : 'free card'),
          stat('Equity (have)', `${(exact * 100).toFixed(1)}%`, `rule of ${street.value === 'flop' ? 4 : 2}: ~${Math.round(rule * 100)}%`),
          stat('Verdict', C ? (good ? 'CALL' : 'FOLD') : 'CHECK', C ? (good ? 'profitable over time' : 'unless implied odds make up the gap') : ''),
          stat('Break-even call', `${Math.floor(P * exact / Math.max(1e-9, 1 - exact))}`, 'biggest call that still pays'));
      });
    },

    // Board games: Catan dice, rolled for real vs the expected curve
    dice() {
      const counts = Array(13).fill(0);
      let total = 0, last = [0, 0];
      const chart = h('div', { class: 'lab-hist', role: 'img' });
      const faces = h('div', { class: 'lab-dice', 'aria-hidden': 'true' });
      const o = out();
      const pip = (n) => h('span', { class: `die d${n}` }, ...Array.from({ length: n }, () => h('i')));
      const roll = (k) => {
        for (let i = 0; i < k; i++) {
          last = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
          counts[last[0] + last[1]]++; total++;
        }
        render();
      };
      const render = () => {
        const exp = (s) => (6 - Math.abs(7 - s)) / 36;
        const max = Math.max(...counts.slice(2).map((c, i) => total ? c / total : 0), exp(7)) * 1.1;
        chart.replaceChildren(...counts.slice(2).map((c, i) => {
          const s = i + 2, got = total ? c / total : 0;
          return h('div', { class: `col${s === 6 || s === 8 ? ' hot' : ''}${s === 7 ? ' robber' : ''}` },
            h('span', { class: 'bar', style: `height:${got / max * 100}%` }),
            h('span', { class: 'exp', style: `bottom:${exp(s) / max * 100}%` }),
            h('b', { text: s }));
        }));
        chart.setAttribute('aria-label', `After ${total} rolls: ` + counts.slice(2).map((c, i) => `${i + 2}: ${c}`).join(', '));
        faces.replaceChildren(...(total ? last.map(pip) : []));
        const sevens = counts[7];
        o.replaceChildren(stat('Rolls', total.toLocaleString()),
          stat('Last roll', total ? `${last[0] + last[1]}` : '–', last[0] + last[1] === 7 ? 'robber moves!' : ''),
          stat('Sevens', total ? `${(sevens / total * 100).toFixed(1)}%` : '–', 'expected 16.7%'),
          stat('6s and 8s', total ? `${((counts[6] + counts[8]) / total * 100).toFixed(1)}%` : '–', 'expected 27.8%: settle on them'));
      };
      body.append(h('div', { class: 'lab-actions' },
        h('button', { type: 'button', class: 'btn btn-gold', onclick: () => roll(1), text: 'Roll once' }),
        h('button', { type: 'button', class: 'btn btn-paper', onclick: () => roll(10), text: 'Roll 10' }),
        h('button', { type: 'button', class: 'btn btn-paper', onclick: () => roll(1000), text: 'Roll 1,000' }),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { counts.fill(0); total = 0; render(); }, text: 'Reset' }), faces),
        chart, h('p', { class: 'lab-hint', text: 'Bars: your rolls. Line: the expected share for each number with two dice.' }), o);
      render();
    },

    // Video games: 20-second aim trainer
    aim() {
      const c = h('canvas', { class: 'lab-aim', width: 640, height: 320, tabindex: 0, 'aria-label': 'Aim trainer: click the targets' });
      const startBtn = h('button', { type: 'button', class: 'btn btn-gold', text: 'Start (20 s) ▶' });
      const o = out();
      body.append(c, h('div', { class: 'lab-actions' }, startBtn), o);
      const ctx = c.getContext('2d');
      let running = false, t0 = 0, hits = 0, shots = 0, target = null, spawnT = 0, reacts = [], raf = 0;
      const DUR = 20000;
      const spawn = () => { target = { x: 30 + Math.random() * 580, y: 30 + Math.random() * 260, r: 18 }; spawnT = performance.now(); };
      const draw = (now) => {
        ctx.fillStyle = css('--ink-2') || '#24342e'; ctx.fillRect(0, 0, 640, 320);
        ctx.strokeStyle = 'rgba(241,230,204,.06)';
        for (let x = 0; x < 640; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 320); ctx.stroke(); }
        for (let y = 0; y < 320; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(640, y); ctx.stroke(); }
        if (running && target) {
          const k = Math.min(1, (now - spawnT) / 120);
          const r = target.r * (reduce ? 1 : k);
          [[r, css('--tomato')], [r * 0.62, css('--paper')], [r * 0.28, css('--tomato')]].forEach(([rr, col]) => {
            ctx.beginPath(); ctx.arc(target.x, target.y, rr, 0, 2 * Math.PI); ctx.fillStyle = col; ctx.fill();
          });
          const left = Math.max(0, DUR - (now - t0));
          ctx.fillStyle = css('--gold'); ctx.fillRect(0, 314, 640 * left / DUR, 6);
          ctx.fillStyle = css('--paper'); ctx.font = '12px "Press Start 2P", monospace'; ctx.fillText(`${hits}`, 12, 24);
          if (left <= 0) return end();
          raf = requestAnimationFrame(draw);
        } else {
          ctx.fillStyle = css('--paper'); ctx.font = '12px "Press Start 2P", monospace'; ctx.textAlign = 'center';
          ctx.fillText(shots ? 'Round over' : 'Press start, then click the targets', 320, 165); ctx.textAlign = 'left';
        }
      };
      const show = () => {
        const best = store.get('aim-best');
        const avg = reacts.length ? Math.round(reacts.reduce((a, b) => a + b, 0) / reacts.length) : null;
        o.replaceChildren(stat('Hits', `${hits}`), stat('Accuracy', shots ? `${Math.round(hits / shots * 100)}%` : '–'),
          stat('Avg time to hit', avg ? `${avg} ms` : '–'), stat('Best score', best ? `${best}` : '–', 'saved in this browser'));
      };
      const end = () => {
        running = false; cancelAnimationFrame(raf);
        const best = store.get('aim-best');
        if (!best || hits > best) store.set('aim-best', hits);
        startBtn.disabled = false; draw(performance.now()); show();
      };
      c.addEventListener('pointerdown', (e) => {
        if (!running) return;
        const rect = c.getBoundingClientRect();
        const x = (e.clientX - rect.left) * 640 / rect.width, y = (e.clientY - rect.top) * 320 / rect.height;
        shots++;
        if (Math.hypot(x - target.x, y - target.y) <= target.r + 2) { hits++; reacts.push(performance.now() - spawnT); spawn(); }
        show();
      });
      startBtn.addEventListener('click', () => {
        hits = shots = 0; reacts = []; running = true; startBtn.disabled = true; t0 = performance.now(); spawn(); show();
        raf = requestAnimationFrame(draw);
      });
      document.fonts?.ready.then(() => draw(performance.now()));
      draw(performance.now()); show();
    },

    // Webnovels & anime: how long would it take to catch up?
    binge() {
      const preset = select([['rv', 'Reverend Insanity (webnovel, about 2,300 chapters)'], ['cg', 'Code Geass (anime, 50 episodes)'],
        ['vs', 'Vinland Saga, first two seasons (anime, 48 episodes)'], ['custom', 'Something else…']], 'rv');
      const kind = select([['read', 'Webnovel'], ['watch', 'Anime']], 'read');
      const count = num(2300, 1, 10000), per = num(2000, 100, 20000, 100), speed = num(250, 50, 1000, 10), daily = num(60, 5, 600, 5);
      const perLabel = field('Words per chapter', per), speedLabel = field('Reading speed (words/min)', speed);
      const o = out(), cal = h('div', { class: 'lab-cal', 'aria-hidden': 'true' });
      body.append(h('div', { class: 'lab-grid' }, field('Series', preset), field('Type', kind), field('Chapters / episodes', count),
        perLabel, speedLabel, field('Minutes a day', daily)), o, cal);
      preset.addEventListener('change', () => {
        const p = { rv: ['read', 2300], cg: ['watch', 50], vs: ['watch', 48] }[preset.value];
        if (p) { kind.value = p[0]; count.value = p[1]; }
        kind.dispatchEvent(new Event('input'));
      });
      live([kind, count, per, speed, daily], () => {
        const reading = kind.value === 'read';
        perLabel.hidden = speedLabel.hidden = !reading;
        const each = reading ? val(per) / Math.max(1, val(speed)) : 23;
        const minutes = val(count) * each, days = Math.ceil(minutes / Math.max(1, val(daily)));
        o.replaceChildren(stat('Total time', minutes >= 60 ? `${Math.round(minutes / 60).toLocaleString()} h` : `${Math.round(minutes)} min`),
          stat('Per ' + (reading ? 'chapter' : 'episode'), `${Math.round(each)} min`),
          stat('Days to finish', days.toLocaleString(), `at ${val(daily)} min a day`),
          stat('…or nonstop', `${(minutes / 60 / 24).toFixed(1)} days`, 'not recommended'));
        const weeks = Math.min(Math.ceil(days / 7), 52 * 3);
        cal.replaceChildren(...Array.from({ length: weeks * 7 }, (_, i) => h('span', { class: i < days ? 'on' : '' })));
        cal.title = days > weeks * 7 ? 'More than three years!' : '';
      });
    },
  };

  const run = labs[root.dataset.lab];
  if (run) { run(); root.classList.add('is-ready'); }
})();
