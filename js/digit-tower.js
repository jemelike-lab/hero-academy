/**
 * Hero Academy — Digit Tower (Game Day) — v210
 *
 * Tuesday/Thursday Class Time replacement. One 75-minute session:
 *   hq (0–5) → warmup (5–13) → floors (13–48) → break (5) → bonus (→65) → debrief (→75)
 *
 * - No timer per problem, no lives. A wrong answer opens Ms. Humphrey's
 *   work board; the third miss shows the answer and Nigel types it (retrieval).
 * - Every room is generated from a seed (child + date + room), re-skinned by
 *   the current WORLD, and gets one daily TWIST. Progress (world, floor, gems,
 *   rank, crown) carries over in ha_tower_progress.
 * - Ms. Humphrey speaks through HeroAcademy.Humphrey.say() — same TTS pipeline
 *   as Class Time. Music is a procedural WebAudio loop per world; it ducks
 *   while she talks.
 * - No question ever carries a `visual` field. All art is drawn in code.
 */
(function () {
  'use strict';
  const NS = (window.HeroAcademy = window.HeroAcademy || {});
  const CHILD_ID = '2e0e51c5-f120-4152-8aa1-041eeecc8165';
  const SEASON = 1;
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------------ config
  const W = 1280, H = 720, COLS = 9, ROWS = 6, T = 100, OX = (W - COLS * T) / 2, OY = 60;
  const MIN = 60 * 1000;
  const PHASES = [ // [name, ends-at-minute]
    ['hq', 5], ['warmup', 13], ['floors', 44], ['break', 49], ['bonus', 61], ['debrief', 75],
  ];
  const TOTAL_MIN = 75;
  const WARMUP_N = 4, DEBRIEF_N = 4, DEBRIEF_MAX = 8, DEBRIEF_UNTIL_MIN = 70;
  const C = { ink:'#0b0c22', cream:'#fff6e5', gold:'#ffc72c', magenta:'#ff4f8b', cyan:'#35e0ff', coral:'#ff6b4a', mint:'#5cf0b0', violet:'#7b3fe4' };
  const FONT = '"Segoe UI", system-ui, sans-serif', FONT_D = 'Impact, "Arial Narrow Bold", "Segoe UI Black", sans-serif';

  const WORLDS = [
    { n:'Gem Vaults',       std:'two-digit addition',        vil:'The Locksmith',       lock:'lock',  floor:'#26245f', floor2:'#2c2a6b', wall:'#131437', acc:'#ffc72c', acc2:'#35e0ff', dark:false, kinds:{add2:.3, add2r:.5, skip:.2}, music:{bpm:112, root:57, scale:[0,2,4,7,9], lead:'square', bass:'triangle'} },
    { n:'Frost Lab',        std:'regrouping',                vil:'Captain Freeze',      lock:'ice',   floor:'#cfe9f7', floor2:'#bddff2', wall:'#5b8fb0', acc:'#0b4f7a', acc2:'#ff4f8b', dark:true,  kinds:{add2r:.8, add2:.2}, music:{bpm:96, root:62, scale:[0,2,3,7,8], lead:'triangle', bass:'sine'} },
    { n:'Jungle Ruins',     std:'skip counting',             vil:'The Vine Queen',      lock:'vine',  floor:'#2f6b3a', floor2:'#37784a', wall:'#1a3d22', acc:'#ffb347', acc2:'#e6ff6a', dark:false, kinds:{skip:.7, add2:.3}, music:{bpm:124, root:55, scale:[0,3,5,7,10], lead:'square', bass:'triangle'} },
    { n:'Robot Factory',    std:'missing addend',            vil:'Unit Zero',           lock:'gear',  floor:'#4a4f5c', floor2:'#555b69', wall:'#23262e', acc:'#ff8a3d', acc2:'#35e0ff', dark:false, kinds:{missing:.7, add2r:.3}, music:{bpm:118, root:52, scale:[0,2,3,5,7,10], lead:'sawtooth', bass:'square'} },
    { n:'Coin Harbor',      std:'money',                     vil:'Pirate Penny',        lock:'chest', floor:'#e8d6a8', floor2:'#dcc78f', wall:'#1c6e7a', acc:'#c98a1b', acc2:'#1c6e7a', dark:true,  kinds:{money:.7, skip:.3}, music:{bpm:104, root:60, scale:[0,2,4,5,7,9], lead:'triangle', bass:'triangle'} },
    { n:'Clock Tower',      std:'telling time',              vil:'The Tick-Tock Twins', lock:'clock', floor:'#5a2a2f', floor2:'#66333a', wall:'#2b1316', acc:'#e0b45c', acc2:'#fff6e5', dark:false, kinds:{time:.7, skip:.3}, music:{bpm:100, root:57, scale:[0,2,4,7,9], lead:'square', bass:'sine'} },
    { n:'Measure Mountain', std:'length',                    vil:'Yeti Yardstick',      lock:'plank', floor:'#eef3f7', floor2:'#dde6ee', wall:'#2d5a4a', acc:'#2d5a4a', acc2:'#ff6b4a', dark:true,  kinds:{length:.7, add2r:.3}, music:{bpm:92, root:64, scale:[0,2,4,7,9], lead:'triangle', bass:'triangle'} },
    { n:'Array Arcade',     std:'arrays',                    vil:'The Grid Gremlin',    lock:'grid',  floor:'#1a0b2e', floor2:'#22103a', wall:'#0a0414', acc:'#ff4f8b', acc2:'#35e0ff', dark:false, kinds:{arrays:.7, fact:.3}, music:{bpm:132, root:57, scale:[0,3,5,7,10], lead:'square', bass:'square'} },
    { n:'Shape Caverns',    std:'geometry',                  vil:'Polygon Pete',        lock:'shape', floor:'#3b2a5c', floor2:'#46336b', wall:'#1d1430', acc:'#ffa94d', acc2:'#5cf0b0', dark:false, kinds:{shapes:.7, add2:.3}, music:{bpm:108, root:55, scale:[0,2,3,7,8], lead:'triangle', bass:'sine'} },
    { n:'Data Dome',        std:'graphs',                    vil:'Chart Shark',         lock:'chart', floor:'#0f4c5c', floor2:'#135a6c', wall:'#062830', acc:'#ff6b4a', acc2:'#5cf0b0', dark:false, kinds:{graph:.7, missing:.3}, music:{bpm:110, root:60, scale:[0,2,4,7,9], lead:'sawtooth', bass:'triangle'} },
    { n:'Hundred Heights',  std:'three-digit place value',   vil:'General Thousand',    lock:'lift',  floor:'#a9c8e8', floor2:'#98bde3', wall:'#3c5f8a', acc:'#ffc72c', acc2:'#fff6e5', dark:true,  kinds:{three:.7, add2r:.3}, music:{bpm:116, root:62, scale:[0,2,4,5,7,9,11], lead:'square', bass:'triangle'} },
    { n:"Digit's Citadel",  std:'everything',                vil:'Doctor Digit',        lock:'skull', floor:'#1a1020', floor2:'#22152a', wall:'#080408', acc:'#ff2e5b', acc2:'#7b3fe4', dark:false, kinds:{add2r:.2, missing:.2, skip:.15, money:.15, time:.1, arrays:.1, three:.1}, music:{bpm:128, root:52, scale:[0,1,3,5,7,8,10], lead:'sawtooth', bass:'square'} },
  ];
  // Twists: unlock as the season goes (gd = game days completed)
  const TWISTS = [
    { id:'none',   label:'Clear skies',   from:0 },
    { id:'fog',    label:'Fog',           from:1 },
    { id:'gems',   label:'Gem rush',      from:1 },
    { id:'mirror', label:'Mirror',        from:2 },
    { id:'ralphie',label:'Ralphie rescue',from:2 },
    { id:'night',  label:'Night floor',   from:4 },
  ];
  const RANKS = [
    { n:'Cadet',    at:0,   suit:'#9aa0b5', cape:'#5a6078' },
    { n:'Scout',    at:25,  suit:'#35e0ff', cape:'#1c6e7a' },
    { n:'Guardian', at:60,  suit:'#ffc72c', cape:'#ff4f8b' },
    { n:'Captain',  at:110, suit:'#ffc72c', cape:'#7b3fe4' },
    { n:'Legend',   at:180, suit:'#fff6e5', cape:'#ff4f8b' },
  ];
  function rankFor(firstTry) { let r = 0; RANKS.forEach((k, i) => { if (firstTry >= k.at) r = i; }); return r; }

  // ------------------------------------------------------------------ utils
  function todayISO() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function hash32(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  let R = Math.random; // current rng (seeded per room; Math.random for questions)
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const rndS = (a, b) => a + Math.floor(R() * (b - a + 1));
  const shuffle = (arr, rng) => { rng = rng || Math.random; for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  function pickWeighted(weights) { let r = Math.random(), keys = Object.keys(weights), tot = keys.reduce((s, k) => s + weights[k], 0); r *= tot; for (const k of keys) { r -= weights[k]; if (r <= 0) return k; } return keys[0]; }

  // ------------------------------------------------------------------ voice
  const Voice = {
    muted: false,
    init() {
      if (NS.Humphrey && typeof NS.Humphrey.init === 'function') {
        try { NS.Humphrey.init({ position: 'bottom-right', audioEnabled: true, kidName: 'Nigel' }); NS.Humphrey.hide(); } catch (e) { console.warn('[digit-tower] Humphrey.init failed', e); }
        try {
          NS.Humphrey.on('started-speaking', () => { $('humphrey-portrait')?.classList.add('speaking'); Music.duck(true); });
          NS.Humphrey.on('finished-speaking', () => { $('humphrey-portrait')?.classList.remove('speaking'); Music.duck(false); });
        } catch (_) {}
      }
    },
    say(text, opts) {
      opts = opts || {};
      if (!text || Voice.muted) return Promise.resolve();
      const Hm = NS.Humphrey;
      if (!Hm || typeof Hm.say !== 'function') return Promise.resolve();
      try {
        const p = Hm.say('digit-tower', { kidName: 'Nigel', text: String(text), priority: opts.queue ? 'normal' : 'high', expression: opts.expression });
        const safety = new Promise((res) => setTimeout(res, opts.maxMs || 30000));
        return Promise.race([Promise.resolve(p), safety]).catch(() => {});
      } catch (e) { console.warn('[digit-tower] say threw', e); return Promise.resolve(); }
    },
    stop() { try { NS.Humphrey && NS.Humphrey.stop && NS.Humphrey.stop(); } catch (_) {} },
  };

  // ------------------------------------------------------------------ music (procedural, per world)
  const Music = (function () {
    let ac = null, master = null, on = true, running = false, timer = null, cfg = null, lead = [], bass = [], step = 0, nextT = 0, ducked = false;
    const LOOKAHEAD = 0.12, TICK = 30;
    function ctx() { if (!ac) { const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return null; ac = new Ctx(); master = ac.createGain(); master.gain.value = 0.16; master.connect(ac.destination); } return ac; }
    function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }
    function build(worldIdx, seed) {
      const w = WORLDS[worldIdx] || WORLDS[0]; cfg = w.music; const rng = mulberry(seed ^ 0x9e3779b9);
      const sc = cfg.scale; lead = []; bass = []; let deg = 4;
      for (let i = 0; i < 32; i++) {
        if (rng() < 0.28) { lead.push(null); continue; }
        deg += Math.round((rng() - 0.5) * 4); deg = Math.max(0, Math.min(sc.length * 2 - 1, deg));
        lead.push(cfg.root + 12 + sc[deg % sc.length] + 12 * Math.floor(deg / sc.length));
      }
      for (let i = 0; i < 32; i++) { const bar = Math.floor(i / 8) % 4; const rootDeg = [0, 0, 3, 4][bar] % sc.length; bass.push(i % 4 === 0 ? cfg.root - 12 + sc[rootDeg] : (i % 4 === 2 ? cfg.root - 12 + sc[(rootDeg + 2) % sc.length] : null)); }
    }
    function note(freq, t, dur, type, vol) { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02); }
    function hat(t) { const b = ac.createBuffer(1, ac.sampleRate * 0.03, ac.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); const s = ac.createBufferSource(); s.buffer = b; const g = ac.createGain(); g.gain.value = 0.18; s.connect(g); g.connect(master); s.start(t); }
    function schedule() {
      if (!running || !ac) return; const spb = 60 / cfg.bpm / 2; // 8th notes
      while (nextT < ac.currentTime + LOOKAHEAD) {
        const i = step % 32; const l = lead[i], b = bass[i];
        if (l != null) note(midi(l), nextT, spb * 0.9, cfg.lead, 0.09);
        if (b != null) note(midi(b), nextT, spb * 1.6, cfg.bass, 0.14);
        if (i % 2 === 1) hat(nextT);
        nextT += spb; step++;
      }
    }
    return {
      start(worldIdx, seed) { if (!ctx()) return; build(worldIdx, seed); running = on; step = 0; nextT = ac.currentTime + 0.05; if (ac.state === 'suspended') ac.resume().catch(() => {}); clearInterval(timer); if (running) timer = setInterval(schedule, TICK); },
      stop() { running = false; clearInterval(timer); },
      toggle() { on = !on; if (!on) { running = false; clearInterval(timer); } else if (cfg && ac) { running = true; nextT = ac.currentTime + 0.05; clearInterval(timer); timer = setInterval(schedule, TICK); } return on; },
      isOn() { return on; },
      duck(d) { ducked = d; if (master) master.gain.setTargetAtTime(d ? 0.035 : 0.16, ac.currentTime, 0.15); },
      sfx(kind) {
        if (!ctx()) return; const t = ac.currentTime;
        const bp = (f, dur, type, vol, dt) => note(f, t + (dt || 0), dur, type || 'square', vol || 0.06);
        if (kind === 'good') { bp(660, .12); bp(990, .16, 'square', .06, .09); }
        else if (kind === 'gem') { bp(1320, .08, 'triangle', .05); bp(1760, .1, 'triangle', .05, .07); }
        else if (kind === 'soft') { bp(220, .18, 'triangle', .05); }
        else if (kind === 'step') { bp(330, .04, 'triangle', .025); }
        else if (kind === 'fanfare') { [523, 659, 784, 1047].forEach((f, i) => bp(f, .18, 'square', .06, i * .11)); }
      },
    };
  })();

  // ------------------------------------------------------------------ questions
  // Each returns { kind, topic, prompt, say, answer, hints:[3], start, work:{...} }
  function genAdd2(reg) {
    let a, b; for (let i = 0; i < 100; i++) { a = rnd(12, 78); b = rnd(11, 78); if (a + b > 99) continue; if (((a % 10 + b % 10) >= 10) === reg) break; }
    const s = a + b, ao = a % 10, bo = b % 10, at = Math.floor(a / 10), bt = Math.floor(b / 10), c = (ao + bo) >= 10 ? 1 : 0;
    return { kind: reg ? 'add2r' : 'add2', topic: reg ? 'two-digit-add-regroup' : 'two-digit-add-no-regroup', prompt: `${a} + ${b} = ?`, say: `What is ${a} plus ${b}?`, answer: s,
      work: { type: 'cols', a, b, ao, bo, at, bt, c, s },
      hints: [`Add the ones first: ${ao} plus ${bo}. What do you get?`,
        c ? `${ao} plus ${bo} is ${ao + bo}. Write ${(ao + bo) % 10} in the ones and carry one to the tens. Now add ${at} plus ${bt} plus one.` : `${ao} plus ${bo} is ${ao + bo}. Now add the tens: ${at} plus ${bt}.`,
        c ? `Ones: ${ao} plus ${bo} is ${ao + bo}, write ${(ao + bo) % 10}, carry one. Tens: ${at} plus ${bt} plus one is ${at + bt + 1}. So ${a} plus ${b} is ${s}. Type ${s} to open it.` : `Ones: ${ao} plus ${bo} is ${ao + bo}. Tens: ${at} plus ${bt} is ${at + bt}. So ${a} plus ${b} is ${s}. Type ${s} to open it.`],
      start: 'Add the ones first, then the tens.' };
  }
  function genFact() {
    let a, b; do { a = rnd(3, 12); b = rnd(3, 12); } while (a + b > 20 || a + b < 11);
    const s = a + b, big = Math.max(a, b), sm = Math.min(a, b), need = 10 - big;
    return { kind: 'fact', topic: 'addition-within-20', prompt: `${a} + ${b} = ?`, say: `What is ${a} plus ${b}?`, answer: s, work: { type: 'tenframe', a, b, big, sm, need, s },
      hints: [`Make a ten. ${big} needs ${need} more to reach ten. Take ${need} from the ${sm}.`, `${big} plus ${need} is ten, and ${sm} minus ${need} is ${sm - need}. So it is ten plus ${sm - need}.`, `Ten plus ${sm - need} is ${s}. So ${a} plus ${b} is ${s}. Type ${s}.`],
      start: 'Make a ten first, then count what is left.' };
  }
  function genSkip() {
    const step = Math.random() < 0.7 ? 10 : 5; const start = step === 10 ? rnd(1, 60) : rnd(0, 12) * 5; const seq = [start, start + step, start + 2 * step], s = start + 3 * step;
    return { kind: 'skip', topic: step === 10 ? 'skip-count-10' : 'skip-count-5', prompt: `${seq.join(', ')}, ?`, say: `What comes next? ${seq.join(', ')}…`, answer: s, work: { type: 'seq', seq, step, s },
      hints: [`Each number jumps by ${step}. What is ${seq[2]} plus ${step}?`, `${seq[0]}, ${seq[1]}, ${seq[2]}. Every jump is plus ${step}. ${step === 10 ? 'The ones digit never changes.' : 'The ones digit flips between zero and five.'} One more jump from ${seq[2]}.`, `${seq[2]} plus ${step} is ${s}. Type ${s}.`],
      start: 'Look at how much the numbers grow each time.' };
  }
  function genMissing() {
    const c = rnd(30, 90), a = rnd(11, c - 6), s = c - a, toTen = (10 - a % 10) % 10, mid = a + toTen;
    return { kind: 'missing', topic: 'missing-addend', prompt: `${a} + ? = ${c}`, say: `${a} plus what makes ${c}?`, answer: s, work: { type: 'countup', a, c, toTen, mid, s },
      hints: [`Count up from ${a}. First, how many to reach the next ten, ${toTen ? mid : a + 10}?`, toTen ? `${a} plus ${toTen} is ${mid}. Now jump from ${mid} to ${c}: that is ${c - mid} more. Add your jumps: ${toTen} plus ${c - mid}.` : `${a} is already on a ten. Jump from ${a} to ${c}: that is ${c - a}.`, `The jumps add up to ${s}. So ${a} plus ${s} is ${c}. Type ${s}.`],
      start: 'Count up from the first number until you reach the total.' };
  }
  function genMoney() {
    const d = rnd(1, 5), n = rnd(0, 3), p = rnd(0, 4); const s = d * 10 + n * 5 + p;
    const parts = [`${d} dime${d > 1 ? 's' : ''}`]; if (n) parts.push(`${n} nickel${n > 1 ? 's' : ''}`); if (p) parts.push(`${p} penn${p > 1 ? 'ies' : 'y'}`);
    const txt = parts.join(', ');
    return { kind: 'money', topic: 'money-count-cents', prompt: `${txt}.\nHow many cents?`, say: `Pirate Penny left ${txt}. How many cents is that?`, answer: s,
      work: { type: 'steps', steps: [`Dimes: ${d} × 10 = ${d * 10}¢`, n ? `Nickels: ${n} × 5 = ${n * 5}¢` : null, p ? `Pennies: ${p}¢` : null, `Total: ${s}¢`].filter(Boolean) },
      hints: [`Count the dimes first, by tens: ${d} dimes is ${d * 10} cents.`, `Now add the nickels by fives${n ? `: ${n * 5} more makes ${d * 10 + n * 5}` : ': there are none'}. Then add the pennies.`, `${d * 10}${n ? ` plus ${n * 5}` : ''}${p ? ` plus ${p}` : ''} is ${s} cents. Type ${s}.`],
      start: 'Dimes are ten, nickels are five, pennies are one.' };
  }
  function genTime() {
    const h = rnd(1, 10), add = rnd(1, 4), s = h + add;
    return { kind: 'time', topic: 'time-hours-later', prompt: `The clock says ${h} o'clock.\nWhat hour is it ${add} hour${add > 1 ? 's' : ''} later?`, say: `The clock says ${h} o'clock. What hour will it be ${add} hour${add > 1 ? 's' : ''} later?`, answer: s,
      work: { type: 'steps', steps: [`Start at ${h} o'clock`, `Count ${add} hour${add > 1 ? 's' : ''} forward: ${Array.from({ length: add }, (_, i) => h + i + 1).join(', ')}`, `It will be ${s} o'clock`] },
      hints: [`Start at ${h} and count forward ${add}.`, `${h}, then ${h + 1}${add > 1 ? `, then ${h + 2}` : ''}… keep going ${add} times.`, `${h} plus ${add} is ${s}. It will be ${s} o'clock. Type ${s}.`], start: 'Count the hours forward on the clock.' };
  }
  function genLength() {
    const a = rnd(11, 45), b = rnd(8, 40), s = a + b;
    return { kind: 'length', topic: 'length-add-cm', prompt: `One plank is ${a} cm.\nAnother is ${b} cm.\nHow long together?`, say: `One plank is ${a} centimeters. Another is ${b} centimeters. How long are they together?`, answer: s,
      work: { type: 'cols', a, b, ao: a % 10, bo: b % 10, at: Math.floor(a / 10), bt: Math.floor(b / 10), c: (a % 10 + b % 10) >= 10 ? 1 : 0, s },
      hints: [`Together means add. Add the ones first: ${a % 10} plus ${b % 10}.`, `Now the tens: ${Math.floor(a / 10)} plus ${Math.floor(b / 10)}${(a % 10 + b % 10) >= 10 ? ' plus the carry' : ''}.`, `${a} plus ${b} is ${s} centimeters. Type ${s}.`], start: 'Together means add. Line up the tens and ones.' };
  }
  function genArrays() {
    const r = rnd(2, 5), c = rnd(2, 5), s = r * c;
    return { kind: 'arrays', topic: 'arrays-repeated-addition', prompt: `${r} rows of ${c} bulbs.\nHow many bulbs?`, say: `${r} rows, with ${c} bulbs in each row. How many bulbs in all?`, answer: s, work: { type: 'array', r, c, s },
      hints: [`Add ${c} for every row: ${Array(r).fill(c).join(' + ')}.`, `Count by ${c}s, ${r} times: ${Array.from({ length: r }, (_, i) => c * (i + 1)).join(', ')}.`, `${r} rows of ${c} is ${s}. Type ${s}.`], start: 'Add one row at a time.' };
  }
  function genShapes() {
    const shapes = [['triangle', 3], ['square', 4], ['pentagon', 5], ['hexagon', 6]]; const [nm, sides] = shapes[rnd(0, 3)]; const k = rnd(2, 3), s = sides * k;
    return { kind: 'shapes', topic: 'shapes-sides-count', prompt: `${k} ${nm}s.\nHow many sides in all?`, say: `Polygon Pete has ${k} ${nm}s. How many sides in all?`, answer: s, work: { type: 'steps', steps: [`A ${nm} has ${sides} sides`, `${k} ${nm}s: ${Array(k).fill(sides).join(' + ')}`, `= ${s} sides`] },
      hints: [`A ${nm} has ${sides} sides. Add ${sides} for each shape.`, `${Array(k).fill(sides).join(' plus ')}.`, `That is ${s} sides. Type ${s}.`], start: 'Count the sides of one shape first.' };
  }
  function genGraph() {
    const red = rnd(8, 20), blue = rnd(3, red - 2), s = red - blue;
    return { kind: 'graph', topic: 'graph-compare-more', prompt: `Gem chart:\nRed ${red} · Blue ${blue}\nHow many more red than blue?`, say: `The gem chart shows ${red} red and ${blue} blue. How many more red than blue?`, answer: s, work: { type: 'countup', a: blue, c: red, toTen: (10 - blue % 10) % 10, mid: blue + (10 - blue % 10) % 10, s },
      hints: [`How many more means count up from ${blue} to ${red}.`, `Start at ${blue}, count up until you reach ${red}. Keep track of the jumps.`, `${blue} plus ${s} is ${red}. So ${s} more red. Type ${s}.`], start: 'Count up from the smaller bar to the taller bar.' };
  }
  function genThree() {
    const h = rnd(1, 8), t = rnd(0, 9), o = rnd(0, 9); const s = h * 100 + t * 10 + o;
    return { kind: 'three', topic: 'three-digit-expanded', prompt: `${h * 100} + ${t * 10} + ${o} = ?`, say: `What is ${h * 100} plus ${t * 10} plus ${o}?`, answer: s, work: { type: 'steps', steps: [`${h} hundreds = ${h * 100}`, `${t} tens = ${t * 10}`, `${o} ones = ${o}`, `Together: ${s}`] },
      hints: [`Hundreds, tens, ones. ${h * 100} is ${h} hundreds.`, `${t * 10} is ${t} tens, and ${o} is ${o} ones. Put them in their places.`, `${h} hundreds, ${t} tens, ${o} ones is ${s}. Type ${s}.`], start: 'Each number goes in its own place: hundreds, tens, ones.' };
  }
  const GEN = { add2: () => genAdd2(false), add2r: () => genAdd2(true), fact: genFact, skip: genSkip, missing: genMissing, money: genMoney, time: genTime, length: genLength, arrays: genArrays, shapes: genShapes, graph: genGraph, three: genThree };
  function weakKindFromTopic(id) { id = String(id || '').toLowerCase(); if (/no-regroup|no_regroup/.test(id)) return 'add2'; if (/regroup|double-digit|two-digit|word-problem/.test(id)) return 'add2r'; if (/within-20|within-15|teens|make-ten/.test(id)) return 'fact'; if (/skip|count-by/.test(id)) return 'skip'; if (/missing|subtract/.test(id)) return 'missing'; return null; }
  function makeQuestion(mode) {
    // mode: 'world' | 'weak' | 'review' | 'fact' | kind name
    const w = WORLDS[S.worldIdx];
    let kind;
    if (GEN[mode]) kind = mode;
    else if (mode === 'weak') { const ks = S.weakKinds.length ? S.weakKinds : ['add2r']; kind = ks[rnd(0, ks.length - 1)]; }
    else if (mode === 'review') kind = ['add2', 'fact', 'skip'][rnd(0, 2)];
    else { const r = Math.random(); kind = r < 0.6 ? pickWeighted(w.kinds) : r < 0.85 ? (S.weakKinds[rnd(0, Math.max(0, S.weakKinds.length - 1))] || 'add2r') : ['add2', 'fact', 'skip'][rnd(0, 2)]; }
    return GEN[kind]();
  }

  // ------------------------------------------------------------------ state
  const S = {
    date: todayISO(), booted: false,
    progress: null, weakKinds: ['add2r'],
    phase: 'hq', elapsedMs: 0, lastTick: 0, completed: false,
    worldIdx: 0, floorIdx: 1, roomIdx: 0, twist: 'none', seed: 0,
    gemsToday: 0, locksToday: 0, firstTryToday: 0, assistedToday: 0, boardToday: 0, misses: [], topics: {},
    room: null, // { grid, hero, path, walkT, opened:Set, seen:Set, ralphie, hintTokens, stats }
    warmupDone: 0, debriefDone: 0,
    q: null, tries: 0, typed: '', workOpen: false, boardBeforeAnswer: false, sel: null, probMode: 'lock',
    t: 0, particles: [], floats: [], breakLeft: 0, breakTimer: null, mode: 'boot',
  };

  // ------------------------------------------------------------------ persistence (local + supabase)
  const LS_KEY = () => 'ha_gameday_' + S.date;
  function saveLocal() {
    try {
      const room = S.room ? { seed: S.seed, hero: { c: S.room.hero.c, r: S.room.hero.r }, opened: [...S.room.opened], seen: [...S.room.seen], ralphie: S.room.ralphie, hintTokens: S.room.hintTokens, stats: S.room.stats, bonus: !!S.room.bonus } : (S.resumePhase ? (S.savedRoom || null) : null);
      localStorage.setItem(LS_KEY(), JSON.stringify({ v: 1, phase: S.phase, elapsedMs: S.elapsedMs, completed: S.completed, worldIdx: S.worldIdx, floorIdx: S.floorIdx, roomIdx: S.roomIdx, twist: S.twist, gemsToday: S.gemsToday, locksToday: S.locksToday, firstTryToday: S.firstTryToday, assistedToday: S.assistedToday, boardToday: S.boardToday, misses: S.misses.slice(-12), topics: S.topics, warmupDone: S.warmupDone, debriefDone: S.debriefDone, room }));
    } catch (_) {}
  }
  function loadLocal() { try { const raw = localStorage.getItem(LS_KEY()); return raw ? JSON.parse(raw) : null; } catch (_) { return null; } }
  function rpc(fn, body) {
    try { if (NS.Telemetry && typeof NS.Telemetry.rpc === 'function') return NS.Telemetry.rpc(fn, body).then((r) => r.ok ? r.json() : null).catch((e) => { console.warn('[digit-tower] rpc', fn, e); return null; }); } catch (e) { console.warn('[digit-tower] rpc threw', fn, e); }
    return Promise.resolve(null);
  }
  function recordTopic(topic, passedFirstTry) { rpc('ha_record_topic_attempt', { p_child_id: CHILD_ID, p_topic_id: topic, p_passed: !!passedFirstTry, p_subject: 'math', p_zone_id: 'digit-tower' }); }
  function recordRoomRun(phase, stats, stars) {
    rpc('ha_tower_record_floor', { p_child_id: CHILD_ID, p_run: { run_date: S.date, season: SEASON, world_idx: S.worldIdx, floor_idx: S.floorIdx, seed: S.seed, twist: S.twist, phase, locks_total: stats.locks, first_try: stats.first, assisted: stats.assisted, board_opened: stats.board, stars, duration_s: Math.round(stats.ms / 1000), topics: stats.topics || {} } });
  }
  function logEvent(type, payload) { rpc('ha_record_event', { p_child_id: CHILD_ID, p_event_type: type, p_payload: payload || {} }); }

  // ------------------------------------------------------------------ clock
  function phaseIndex(name) { return PHASES.findIndex((p) => p[0] === name); }
  function elapsedMin() { return S.elapsedMs / MIN; }
  function tickClock() {
    const now = Date.now();
    if (S.lastTick && document.visibilityState === 'visible' && !S.completed && S.mode !== 'boot') S.elapsedMs += Math.min(5000, now - S.lastTick);
    S.lastTick = now;
    const m = Math.floor(elapsedMin());
    const cm = $('clock-min'); if (cm) cm.textContent = `${Math.min(TOTAL_MIN, m)} of ${TOTAL_MIN} min`;
    const fill = $('clock-fill'); if (fill) fill.style.width = Math.min(100, elapsedMin() / TOTAL_MIN * 100) + '%';
    if (m % 1 === 0) saveLocal();
    if (S.phase === 'break' && S.breakLeft > 0) { /* handled by break timer */ }
  }
  setInterval(tickClock, 1000);
  function setPhase(name) {
    S.phase = name; const labels = { hq: 'Hero HQ', warmup: 'Warm-up', floors: 'The tower', break: 'Stretch break', bonus: 'Bonus room', debrief: 'Hero debrief' };
    $('phase-badge').textContent = labels[name] || name; $('clock-phase').textContent = labels[name] || name; saveLocal();
  }
  function setWorldBadge() { $('world-badge').textContent = `World ${S.worldIdx + 1} · ${WORLDS[S.worldIdx].n} · Floor ${S.floorIdx}`; }
  function setGems() { $('gems').textContent = `${(S.progress ? S.progress.gems : 0) + S.gemsToday} ◆`; }

  // ------------------------------------------------------------------ room generation
  function makeRoom(seed, opts) {
    opts = opts || {}; R = mulberry(seed); let grid;
    for (let attempt = 0; attempt < 80; attempt++) {
      grid = [];
      for (let r = 0; r < ROWS; r++) { grid.push([]); for (let c = 0; c < COLS; c++) { const edge = r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1; grid[r].push(edge ? '#' : (R() < 0.2 ? '#' : '.')); } }
      grid[1][1] = 'S'; grid[ROWS - 2][COLS - 2] = 'E';
      if (opts.lieutenant) { grid[ROWS - 2][COLS - 3] = 'V'; grid[ROWS - 3][COLS - 2] = 'V'; grid[ROWS - 3][COLS - 3] = 'V'; }
      const open = []; for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) if (grid[r][c] === '.') open.push({ c, r });
      shuffle(open, R);
      const nL = opts.bonus ? 2 : rndS(4, 6), nC = (opts.bonus ? 4 : rndS(1, 2)) + (S.twist === 'gems' ? 2 : 0), nG = rndS(2, 3);
      let i = 0; for (let k = 0; k < nL && i < open.length; k++, i++) grid[open[i].r][open[i].c] = 'D';
      for (let k = 0; k < nC && i < open.length; k++, i++) grid[open[i].r][open[i].c] = 'C';
      for (let k = 0; k < nG && i < open.length; k++, i++) grid[open[i].r][open[i].c] = 'G';
      if (S.twist === 'ralphie' && i < open.length) { grid[open[i].r][open[i].c] = 'R'; i++; }
      const seen = new Set(['1,1']), q = [{ c: 1, r: 1 }];
      while (q.length) { const n = q.shift(); for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const c = n.c + dc, r = n.r + dr; if (grid[r][c] === '#' || seen.has(c + ',' + r)) continue; seen.add(c + ',' + r); q.push({ c, r }); } }
      let ok = true; for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) if (grid[r][c] !== '#' && !seen.has(c + ',' + r)) ok = false;
      if (ok) break;
    }
    if (S.twist === 'mirror') grid = grid.map((row) => row.slice().reverse());
    let hero = { c: 1, r: 1 }; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] === 'S') hero = { c, r };
    return { grid, hero: { c: hero.c, r: hero.r, x: hero.c, y: hero.r }, path: [], walkT: 0, opened: new Set(), seen: new Set([hero.c + ',' + hero.r]), ralphie: false, hintTokens: 0, bonus: !!opts.bonus, pending: null, stats: { locks: 0, first: 0, assisted: 0, board: 0, ms: 0, t0: Date.now(), topics: {} } };
  }
  const tile = (c, r) => (S.room && S.room.grid[r] && S.room.grid[r][c]) || '#';
  const isLockCh = (ch) => ch === 'D' || ch === 'V' || ch === 'C' || ch === 'R';
  const key = (c, r) => c + ',' + r;
  function passable(c, r) { const ch = tile(c, r); if (ch === '#') return false; if (isLockCh(ch) && !S.room.opened.has(key(c, r))) return false; return true; }
  function bfs(from, goalFn) {
    const prev = new Map([[key(from.c, from.r), null]]); const q = [from];
    while (q.length) { const n = q.shift(); if (goalFn(n)) { const p = []; let k = key(n.c, n.r); while (k) { const [c, r] = k.split(',').map(Number); p.unshift({ c, r }); k = prev.get(k); } return p; }
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const c = n.c + dc, r = n.r + dr, k = key(c, r); if (prev.has(k) || !passable(c, r)) continue; prev.set(k, key(n.c, n.r)); q.push({ c, r }); } }
    return null;
  }
  function startRoom(bonus) {
    const lieutenant = S.floorIdx === 2 && !bonus;
    S.seed = hash32(CHILD_ID + '|' + S.date + '|' + S.worldIdx + '|' + S.floorIdx + '|' + S.roomIdx + (bonus ? '|bonus' : ''));
    S.room = makeRoom(S.seed, { bonus, lieutenant });
    S.mode = 'play'; saveLocal();
    Music.start(S.worldIdx, S.seed);
  }
  function restoreRoom(saved) {
    S.seed = saved.seed; const lieutenant = S.floorIdx === 2 && !saved.bonus;
    S.room = makeRoom(S.seed, { bonus: saved.bonus, lieutenant });
    S.room.opened = new Set(saved.opened || []); S.room.seen = new Set(saved.seen || []); S.room.ralphie = !!saved.ralphie; S.room.hintTokens = saved.hintTokens || 0;
    if (saved.stats) { S.room.stats = Object.assign(S.room.stats, saved.stats, { t0: Date.now() - (saved.stats.ms || 0) }); }
    if (saved.hero) { S.room.hero = { c: saved.hero.c, r: saved.hero.r, x: saved.hero.c, y: saved.hero.r }; }
    S.mode = 'play'; Music.start(S.worldIdx, S.seed);
  }

  // ------------------------------------------------------------------ input
  const cv = $('game'), ctx = cv.getContext('2d');
  cv.addEventListener('pointerdown', (e) => {
    if (S.mode !== 'play' || !S.room) return;
    const rct = cv.getBoundingClientRect(); const x = (e.clientX - rct.left) / rct.width * W, y = (e.clientY - rct.top) / rct.height * H;
    const c = Math.floor((x - OX) / T), r = Math.floor((y - OY) / T); const ch = tile(c, r); if (ch === '#') return;
    const h = S.room.hero;
    if (isLockCh(ch) && !S.room.opened.has(key(c, r))) {
      if (Math.abs(h.c - c) + Math.abs(h.r - r) === 1) { openProblem({ c, r, ch }); return; }
      const p = bfs({ c: h.c, r: h.r }, (n) => Math.abs(n.c - c) + Math.abs(n.r - r) === 1);
      if (p) { S.room.path = p.slice(1); S.room.pending = { c, r, ch }; S.sel = key(c, r); } else Music.sfx('soft');
      return;
    }
    const p = bfs({ c: h.c, r: h.r }, (n) => n.c === c && n.r === r);
    if (p) { S.room.path = p.slice(1); S.room.pending = null; S.sel = null; } else Music.sfx('soft');
  });
  window.addEventListener('keydown', (e) => { if (S.mode === 'prob') { if (/^[0-9]$/.test(e.key)) typeDigit(e.key); else if (e.key === 'Backspace') typeDigit('del'); else if (e.key === 'Enter') check(); } });

  // ------------------------------------------------------------------ problem modal
  function openProblem(target, mode) {
    S.probMode = mode || 'lock'; S.sel = target ? key(target.c, target.r) : null; S.tries = 0; S.typed = ''; S.workOpen = false; S.boardBeforeAnswer = false; S.mode = 'prob';
    let q, kindLabel;
    if (S.probMode === 'warmup') { q = makeQuestion('weak'); kindLabel = `Warm-up ${S.warmupDone + 1} of ${WARMUP_N}`; }
    else if (S.probMode === 'debrief') { const m = S.misses.length ? S.misses[S.debriefDone % S.misses.length] : null; q = m && GEN[m] ? GEN[m]() : makeQuestion('weak'); kindLabel = `Debrief ${S.debriefDone + 1}`; }
    else { const ch = target.ch; q = ch === 'C' ? makeQuestion('fact') : ch === 'R' ? makeQuestion('fact') : makeQuestion('world'); kindLabel = ch === 'C' ? 'Treasure crate · bonus' : ch === 'V' ? `${WORLDS[S.worldIdx].vil}'s vault lock` : ch === 'R' ? "Ralphie's cage" : 'Door lock'; S.room.stats.locks++; }
    S.q = q; S.target = target || null;
    $('prob-kind').textContent = kindLabel; $('prompt').textContent = q.prompt; $('prompt').classList.toggle('small', q.prompt.length > 22);
    $('prob-hint').textContent = q.start; $('answer').textContent = ' '; $('answer').className = 'answer';
    $('work').hidden = true; $('work-btn').textContent = 'Show my work'; renderWork(0);
    $('ralphie-btn').hidden = !(S.room && S.room.ralphie && S.room.hintTokens > 0 && S.probMode === 'lock');
    $('prob-ov').hidden = false;
    Voice.say(q.say);
  }
  function typeDigit(d) { if (d === 'del') S.typed = S.typed.slice(0, -1); else if (S.typed.length < 3) S.typed += d; $('answer').textContent = S.typed || ' '; }
  function check() {
    if (!S.typed || S.mode !== 'prob') return; const v = parseInt(S.typed, 10); const q = S.q;
    if (v === q.answer) {
      $('answer').className = 'answer ok'; Music.sfx('good'); const first = S.tries === 0; S.mode = 'resolving';
      if (S.probMode === 'lock') {
        const st = S.room.stats; if (first) { st.first++; S.firstTryToday++; } if (S.tries >= 3) { st.assisted++; S.assistedToday++; } if (S.boardBeforeAnswer) { st.board++; S.boardToday++; }
        st.topics[q.topic] = st.topics[q.topic] || { n: 0, first: 0 }; st.topics[q.topic].n++; if (first) st.topics[q.topic].first++;
        S.locksToday++; S.topics[q.topic] = (S.topics[q.topic] || 0) + 1; recordTopic(q.topic, first);
        const isCrate = S.target.ch === 'C', isRalphie = S.target.ch === 'R'; const gems = isCrate ? (first ? 6 : 3) : isRalphie ? 5 : (first ? 4 : 2); S.gemsToday += gems; setGems();
        const praise = first ? ['Yes! First try.', 'That is it, Nigel!', 'Opened. Nice work.', 'Perfect.'][rnd(0, 3)] : (S.tries >= 3 ? 'There it is. You typed it, so it is yours now.' : 'You got it. The board helped, and that counts.');
        setTimeout(() => {
          $('prob-ov').hidden = true; S.room.opened.add(S.sel); const p = tilePos(S.target.c, S.target.r); burst(p.x, p.y, C.gold, 34); burst(p.x, p.y, C.mint, 14); S.floats.push({ x: p.x, y: p.y - 30, txt: `+${gems} ◆`, col: C.gold, life: 1.3 }); Music.sfx('gem');
          if (isRalphie) { S.room.ralphie = true; S.room.hintTokens = 1; Voice.say('Ralphie is free! He will follow you, and he can give you one hint on any lock. Tap Ask Ralphie when you want it.'); }
          else Voice.say(praise, { maxMs: 6000 });
          S.mode = 'play'; saveLocal();
          if (S.target.ch === 'V' && allVaultsOpen()) { setTimeout(() => { burst(p.x, p.y, C.magenta, 40); Voice.say(`${WORLDS[S.worldIdx].vil} is beaten! The stairs are open, Nigel.`); }, 500); }
        }, 500);
      } else if (S.probMode === 'warmup') {
        S.warmupDone++; recordTopic(q.topic, first); if (!first) S.misses.push(q.kind);
        setTimeout(() => { $('prob-ov').hidden = true; S.mode = 'play'; saveLocal(); if (S.warmupDone >= WARMUP_N) { Voice.say('Warm-up done. Now the tower.'); setTimeout(startFloorsPhase, 900); } else { Voice.say(first ? 'Good.' : 'Got it.', { maxMs: 3000 }); setTimeout(() => openProblem(null, 'warmup'), 900); } }, 500);
      } else if (S.probMode === 'debrief') {
        S.debriefDone++; recordTopic(q.topic, first);
        setTimeout(() => { $('prob-ov').hidden = true; S.mode = 'play'; saveLocal(); if (S.debriefDone >= DEBRIEF_N && (elapsedMin() >= DEBRIEF_UNTIL_MIN || S.debriefDone >= DEBRIEF_MAX)) finishDay(); else { Voice.say(first ? 'That is one you missed earlier, and now you own it.' : 'Better every time.', { maxMs: 6000 }); setTimeout(() => openProblem(null, 'debrief'), 900); } }, 500);
      }
    } else {
      S.tries++; Music.sfx('soft'); $('answer').className = 'answer shake'; setTimeout(() => { $('answer').className = 'answer'; }, 350); S.typed = ''; $('answer').textContent = ' ';
      if (S.tries === 1) S.misses.push(q.kind);
      const lvl = Math.min(3, S.tries); $('prob-hint').textContent = q.hints[lvl - 1]; if (!S.workOpen) toggleWork(true); renderWork(lvl);
      Voice.say((lvl === 1 ? 'Not yet. ' : lvl === 2 ? 'Almost. ' : 'Let me show you. ') + q.hints[lvl - 1]);
    }
  }
  function toggleWork(force) { const before = S.workOpen; S.workOpen = force === undefined ? !S.workOpen : force; if (S.workOpen && !before && S.tries === 0) S.boardBeforeAnswer = true; $('work').hidden = !S.workOpen; $('work-btn').textContent = S.workOpen ? 'Hide my work' : 'Show my work'; }
  function askRalphie() { if (!S.room || S.room.hintTokens <= 0) return; S.room.hintTokens--; $('ralphie-btn').hidden = true; toggleWork(true); renderWork(1); $('prob-hint').textContent = S.q.hints[0]; Voice.say('Ralphie says: ' + S.q.hints[0]); }
  function renderWork(lvl) {
    const q = S.q, w = $('work'), k = q.work; const show = (x, at) => (lvl >= at ? x : '<span class="dim">?</span>');
    if (k.type === 'cols') {
      const os = k.ao + k.bo;
      w.innerHTML = `<h4>Tens and ones</h4><div class="cols"><div class="lab"></div><div class="lab">tens</div><div class="lab">ones</div><div class="lab"></div>
        <div class="carry"></div><div class="carry">${lvl >= 2 && k.c ? '1' : ''}</div><div class="carry"></div><div></div>
        <div></div><div>${k.at}</div><div>${k.ao}</div><div></div>
        <div>+</div><div>${k.bt}</div><div>${k.bo}</div><div></div>
        <div class="rule"></div>
        <div></div><div class="sum">${show(String(Math.floor(k.s / 10)), 3)}</div><div class="sum">${show(String(os % 10), 2)}</div><div></div></div>
        <div class="steps">${lvl >= 1 ? `<p class="${lvl === 1 ? 'now' : ''}">1. Ones: ${k.ao} + ${k.bo} = ${lvl >= 2 ? os : '?'}</p>` : ''}${lvl >= 2 ? `<p class="${lvl === 2 ? 'now' : ''}">2. ${k.c ? `Write ${os % 10}, carry 1. Tens: ${k.at} + ${k.bt} + 1 = ${lvl >= 3 ? k.at + k.bt + 1 : '?'}` : `Tens: ${k.at} + ${k.bt} = ${lvl >= 3 ? k.at + k.bt : '?'}`}</p>` : ''}${lvl >= 3 ? `<p class="now">3. ${k.a} + ${k.b} = ${k.s}</p>` : ''}</div>`;
    } else if (k.type === 'tenframe') {
      let dots = ''; for (let i = 0; i < 20; i++) dots += `<i class="${i < k.big ? 'a' : (i < k.big + k.sm ? 'b' : '')}"></i>`;
      w.innerHTML = `<h4>Make a ten</h4><div class="tenframe">${dots}</div><div class="steps" style="text-align:center;margin-top:6px">${k.big} blue fill the top row with ${k.need} pink. ${lvl >= 2 ? `10 + ${k.sm - k.need} = ${lvl >= 3 ? k.s : '?'}` : ''}</div>`;
    } else if (k.type === 'seq') {
      w.innerHTML = `<h4>Jumps of ${k.step}</h4><div class="seq"><span>${k.seq[0]}</span><small>+${k.step}</small><span>${k.seq[1]}</span><small>+${k.step}</small><span>${k.seq[2]}</span><small>+${k.step}</small><span class="q">${lvl >= 3 ? k.s : '?'}</span></div><div class="steps" style="text-align:center;margin-top:8px">${lvl >= 1 ? `${k.seq[2]} + ${k.step} = ${lvl >= 3 ? k.s : '?'}` : 'Every jump is the same size.'}</div>`;
    } else if (k.type === 'countup') {
      const j1 = k.toTen, j2 = k.c - k.mid;
      w.innerHTML = `<h4>Count up on the number line</h4><div class="seq"><span>${k.a}</span>${j1 ? `<small>+${lvl >= 2 ? j1 : '?'}</small><span>${lvl >= 2 ? k.mid : '?'}</span>` : ''}<small>+${lvl >= 2 ? j2 : '?'}</small><span>${k.c}</span></div><div class="steps" style="text-align:center;margin-top:8px">${lvl >= 2 ? (j1 ? `${j1} + ${j2} = ${lvl >= 3 ? k.s : '?'}` : `One jump of ${j2}`) : 'Jump to the next ten, then to the total. Add the jumps.'}</div>`;
    } else if (k.type === 'array') {
      let cells = ''; for (let r = 0; r < k.r; r++) for (let c = 0; c < k.c; c++) cells += `<i class="${lvl >= 1 ? 'a' : ''}"></i>`;
      w.innerHTML = `<h4>${k.r} rows × ${k.c}</h4><div class="tenframe" style="grid-template-columns:repeat(${k.c},1fr);max-width:${k.c * 30}px">${cells}</div><div class="steps" style="text-align:center;margin-top:6px">${lvl >= 1 ? Array(k.r).fill(k.c).join(' + ') + (lvl >= 3 ? ` = ${k.s}` : ' = ?') : 'Count one row, then add it for every row.'}</div>`;
    } else {
      w.innerHTML = `<h4>Steps</h4><div class="steps">${k.steps.map((s, i) => `<p class="${i < lvl ? (i === lvl - 1 ? 'now' : '') : 'dim'}">${i + 1}. ${i < lvl ? s : '…'}</p>`).join('')}</div>`;
    }
  }
  (function buildPad() { const p = $('pad'); ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'go'].forEach((k) => { const b = document.createElement('button'); b.type = 'button'; if (k === 'go') { b.className = 'go'; b.textContent = 'Open'; b.addEventListener('click', check); } else if (k === 'del') { b.className = 'del'; b.textContent = '⌫'; b.addEventListener('click', () => typeDigit('del')); } else { b.textContent = k; b.addEventListener('click', () => typeDigit(k)); } p.appendChild(b); }); })();
  $('work-btn').addEventListener('click', () => toggleWork());
  $('ralphie-btn').addEventListener('click', askRalphie);
  $('read-btn').addEventListener('click', () => { if (S.q) Voice.say(S.q.say); });
  function allVaultsOpen() { let ok = true; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (tile(c, r) === 'V' && !S.room.opened.has(key(c, r))) ok = false; return ok; }

  // ------------------------------------------------------------------ phases
  function showHQ() {
    if (!S.resumePhase) setPhase('hq'); else { $('phase-badge').textContent = 'Hero HQ'; $('clock-phase').textContent = 'Hero HQ'; }
    S.mode = 'hq'; const p = S.progress; setWorldBadge(); setGems();
    const map = $('hq-map'); map.innerHTML = ''; const doneFloors = (p.floors || []).length;
    for (let i = 0; i < 24; i++) { const s = document.createElement('span'); s.textContent = i + 1; if (i < doneFloors) s.classList.add('done'); else if (i === doneFloors) s.classList.add('now'); map.appendChild(s); }
    $('hq-rank').textContent = RANKS[rankFor(p.first_try_total)].n; $('hq-gems').textContent = p.gems; $('hq-locks').textContent = p.locks_total; $('hq-days').textContent = p.game_days;
    const cr = $('hq-crown'); cr.innerHTML = ''; for (let i = 0; i < 12; i++) { const s = document.createElement('i'); if ((p.crown || []).includes(i)) s.classList.add('on'); cr.appendChild(s); }
    const w = WORLDS[S.worldIdx]; const tw = TWISTS.find((t) => t.id === S.twist) || TWISTS[0];
    $('hq-today').textContent = `Today · World ${S.worldIdx + 1}, Floor ${S.floorIdx}`;
    $('hq-world-text').textContent = `${w.n} — ${w.std}. Twist: ${tw.label}.${S.floorIdx === 2 ? ` ${w.vil} guards the stairs.` : ''}`;
    const resumed = !!(S.resumePhase && S.resumePhase !== 'hq');
    const line = resumed ? `Welcome back, Nigel. You have ${Math.max(0, TOTAL_MIN - Math.floor(elapsedMin()))} minutes of Game Day left. Let's pick up where you were.`
      : `Happy Game Day, Nigel! Today we climb ${w.n}, floor ${S.floorIdx}. ${S.floorIdx === 2 ? w.vil + ' is waiting at the stairs. ' : ''}There is no clock on any lock. Take your time, and use the work board whenever you like.`;
    $('hq-say').textContent = line; $('hq-go').textContent = resumed ? 'Keep going' : 'Suit up';
    drawHQHero(); $('hq-ov').hidden = false; Voice.say(line);
  }
  function leaveHQ() {
    $('hq-ov').hidden = true; Voice.stop();
    if (S.resumePhase && S.resumePhase !== 'hq') { S.phase = S.resumePhase; S.resumePhase = null; resumePhase(); return; }
    S.resumePhase = null; startWarmup();
  }
  function showPhaseIntro(title, text, sayText, btn, onGo) { $('phase-title').textContent = title; $('phase-text').textContent = text; $('phase-say').textContent = sayText; $('phase-go').textContent = btn || "Let's go"; $('phase-ov').hidden = false; S.mode = 'intro'; Voice.say(sayText); $('phase-go').onclick = () => { $('phase-ov').hidden = true; Voice.stop(); onGo(); }; }
  function startWarmup() {
    setPhase('warmup'); S.warmupDone = 0; S.room = null; Music.start(S.worldIdx, hash32(S.date + 'warm'));
    showPhaseIntro('Warm-up', `Four quick ones on the board before the tower. Type your answer. The work board is right there if you want it.`, `Let's warm up first, Nigel. Four problems, no rush. Then the tower.`, 'Start warm-up', () => { S.mode = 'play'; openProblem(null, 'warmup'); });
  }
  function startFloorsPhase() {
    setPhase('floors'); S.roomIdx = S.roomIdx || 0; const w = WORLDS[S.worldIdx];
    showPhaseIntro(`${w.n} · Floor ${S.floorIdx}`, `Walk to a lock and solve it to open the door. Crates hold bonus gems. Find the stairs to clear the room.${S.floorIdx === 2 ? ` ${w.vil} has locked the stairs with three vault locks.` : ''}`, `Here we go, ${w.n}. Tap where you want to walk. When you reach a lock, I will read it to you.`, 'Enter', () => startRoom(false));
  }
  function roomCleared() {
    S.mode = 'roomend'; Music.stop(); const st = S.room.stats; st.ms = Date.now() - st.t0;
    const ratio = st.locks ? st.first / st.locks : 1; const stars = ratio >= 0.85 ? 3 : ratio >= 0.6 ? 2 : 1;
    recordRoomRun(S.room.bonus ? 'bonus' : 'floor', st, stars); Music.sfx('fanfare');
    [...$('room-stars').children].forEach((s, i) => s.classList.toggle('on', i < stars)); $('room-gems').textContent = S.gemsToday; $('room-locks').textContent = S.locksToday; $('room-first').textContent = `${st.first}/${st.locks}`;
    const m = elapsedMin(); let next;
    if (S.room.bonus) next = m >= 66 ? 'debrief' : 'bonus';
    else next = m < 42 ? 'room' : (m < 60 ? 'break' : 'debrief');
    const say = stars === 3 ? 'Every lock on the first try. That is real hero work, Nigel.' : stars === 2 ? 'Strong room. Remember the work board is your superpower.' : 'You opened every door, and that is what counts.';
    const btn = { room: 'Next room', break: 'Stretch break', debrief: 'Hero debrief', bonus: 'Another bonus room' }[next];
    $('room-title').textContent = S.room.bonus ? 'Bonus room cleared!' : `Room ${S.roomIdx + 1} cleared!`; $('room-say').textContent = say; $('room-go').textContent = btn; $('room-ov').hidden = false; Voice.say(say);
    $('room-go').onclick = () => { $('room-ov').hidden = true; Voice.stop(); if (next === 'room') { S.roomIdx++; S.room = null; saveLocal(); startRoom(false); } else if (next === 'bonus') { S.roomIdx++; S.room = null; saveLocal(); startRoom(true); } else if (next === 'break') startBreak(); else startDebrief(); };
  }
  function startBreak() {
    setPhase('break'); S.room = null; S.mode = 'break'; Music.stop(); S.breakLeft = 5 * 60; $('break-ov').hidden = false; $('break-timer').textContent = '5:00';
    Voice.say('Stretch break, Nigel. Stand up, shake it out, drink some water. I will call you back in five minutes.');
    clearInterval(S.breakTimer); S.breakTimer = setInterval(() => { S.breakLeft--; $('break-timer').textContent = `${Math.floor(S.breakLeft / 60)}:${String(S.breakLeft % 60).padStart(2, '0')}`; if (S.breakLeft <= 0) { clearInterval(S.breakTimer); endBreak(); } }, 1000);
    $('break-skip').onclick = () => { clearInterval(S.breakTimer); endBreak(); };
  }
  function endBreak() { $('break-ov').hidden = true; startBonus(); }
  function startBonus() {
    setPhase('bonus'); S.roomIdx++;
    showPhaseIntro('Bonus room', 'Crates everywhere. Each one is a quick fact, and each one pays double gems. Open as many as you want, then take the stairs.', 'Bonus room! These crates are quick ones, and they pay double. Grab what you can.', 'Open it', () => startRoom(true));
  }
  function startDebrief() {
    setPhase('debrief'); S.room = null; S.debriefDone = 0; Music.start(S.worldIdx, hash32(S.date + 'debrief'));
    const n = S.misses.length;
    showPhaseIntro('Hero debrief', n ? `A few problems like the ones that gave you trouble today. Show them who is boss.` : `A few last problems to finish strong.`, n ? `Last thing, Nigel. A few problems like the ones that tricked you today. This time, you know the moves.` : `Last few, Nigel. Finish strong.`, 'Start', () => { S.mode = 'play'; openProblem(null, 'debrief'); });
  }
  function resumePhase() {
    const saved = loadLocal(); setPhase(S.phase);
    if (S.phase === 'warmup') { if (S.warmupDone >= WARMUP_N) startFloorsPhase(); else { S.mode = 'play'; Music.start(S.worldIdx, hash32(S.date + 'warm')); openProblem(null, 'warmup'); } }
    else if (S.phase === 'floors' || S.phase === 'bonus') { const rm = (saved && saved.room) || S.savedRoom; S.savedRoom = null; if (rm) restoreRoom(rm); else startRoom(S.phase === 'bonus'); }
    else if (S.phase === 'break') startBonus();
    else if (S.phase === 'debrief') { if (S.debriefDone >= DEBRIEF_N && (elapsedMin() >= DEBRIEF_UNTIL_MIN || S.debriefDone >= DEBRIEF_MAX)) finishDay(); else { S.mode = 'play'; openProblem(null, 'debrief'); } }
    else startWarmup();
  }
  function finishDay() {
    if (S.completed) return; S.completed = true; S.mode = 'done'; setPhase('debrief'); Music.stop(); Music.sfx('fanfare');
    const p = S.progress; const ratio = S.locksToday ? S.firstTryToday / S.locksToday : 1; const stars = ratio >= 0.85 ? 3 : ratio >= 0.6 ? 2 : 1;
    const patch = { gems: p.gems + S.gemsToday, first_try_total: p.first_try_total + S.firstTryToday, locks_total: p.locks_total + S.locksToday, game_days: p.game_days + 1, floors_add: { date: S.date, world: S.worldIdx, floor: S.floorIdx, stars } };
    if (S.floorIdx === 2) { patch.crown_add = S.worldIdx; patch.world_idx = Math.min(WORLDS.length - 1, S.worldIdx + 1); patch.floor_idx = S.worldIdx === WORLDS.length - 1 ? 2 : 1; } else patch.floor_idx = 2;
    rpc('ha_tower_save_progress', { p_child_id: CHILD_ID, p_patch: patch, p_season: SEASON });
    rpc('ha_record_session_signal', { p_child_id: CHILD_ID, p_zone: 'digit-tower', p_items_attempted: S.locksToday, p_items_correct_first_try: S.firstTryToday, p_longest_streak: 0 });
    // Same markers Class Time writes, so the home tile flips and Today's Mission counts it.
    try {
      const rawState = localStorage.getItem('hero_academy_state_v1'); const appState = rawState ? JSON.parse(rawState) : {}; appState.zoneProgress = appState.zoneProgress || {}; appState.zoneProgress['class-time'] = Math.min(100, (appState.zoneProgress['class-time'] || 0) + 25); localStorage.setItem('hero_academy_state_v1', JSON.stringify(appState));
      const k = `ha_mission_zones_done_${S.date}`; const done = JSON.parse(localStorage.getItem(k) || '[]'); if (!done.includes('class-time')) { done.push('class-time'); localStorage.setItem(k, JSON.stringify(done)); }
      localStorage.setItem('ha_class_time_' + S.date, JSON.stringify({ completedAt: new Date().toISOString(), courses_done: 4, total_courses: 4, game_day: true }));
    } catch (_) {}
    logEvent('class_time_complete', { reason: 'game-day', world: S.worldIdx, floor: S.floorIdx, gems: S.gemsToday, locks: S.locksToday, first_try: S.firstTryToday, minutes: Math.round(elapsedMin()) });
    saveLocal();
    const newRank = RANKS[rankFor(p.first_try_total + S.firstTryToday)].n, oldRank = RANKS[rankFor(p.first_try_total)].n;
    [...$('done-stars').children].forEach((s, i) => s.classList.toggle('on', i < stars)); $('done-gems').textContent = S.gemsToday; $('done-locks').textContent = S.locksToday; $('done-first').textContent = `${S.firstTryToday}/${S.locksToday}`; $('done-rank').textContent = newRank;
    const w = WORLDS[S.worldIdx];
    const say = (newRank !== oldRank ? `You are a ${newRank} now! ` : '') + (S.floorIdx === 2 ? `${w.vil} is beaten and a crown piece is yours. ` : `${w.n} floor one is done. `) + `That is Game Day, Nigel. ${S.floorIdx === 2 ? `Next time, ${WORLDS[Math.min(WORLDS.length - 1, S.worldIdx + 1)].n}.` : `Next time, floor two, and ${w.vil} will be waiting.`} See you then.`;
    $('done-say').textContent = say; $('done-ov').hidden = false; Voice.say(say);
    $('done-go').onclick = () => { window.location.href = '/'; };
  }

  // ------------------------------------------------------------------ drawing
  const tilePos = (c, r) => ({ x: OX + c * T + T / 2, y: OY + r * T + T / 2 });
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function burst(x, y, col, n) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = rnd(100, 380); S.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(5, 9) / 10, col, r: rnd(3, 8) }); } }
  function drawLock(kind, x, y, w, ch) {
    const a = w.acc, b = w.acc2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (ch === 'C') { ctx.fillStyle = '#8a5a2b'; roundRect(x - 26, y - 6, 52, 34, 7); ctx.fill(); ctx.fillStyle = a; ctx.fillRect(x - 26, y + 8, 52, 6); ctx.fillRect(x - 5, y - 6, 10, 34); ctx.fillStyle = C.cream; ctx.font = `700 11px ${FONT}`; ctx.fillText('BONUS', x, y - 18); return; }
    if (ch === 'R') { ctx.fillStyle = '#3f8f4f'; ctx.beginPath(); ctx.ellipse(x, y + 4, 24, 18, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#7bd389'; ctx.beginPath(); ctx.arc(x - 24, y + 2, 9, 0, 7); ctx.fill(); ctx.strokeStyle = C.cream; ctx.lineWidth = 3; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + i * 16, y - 30); ctx.lineTo(x + i * 16, y + 30); ctx.stroke(); } ctx.fillStyle = C.cream; ctx.font = `700 11px ${FONT}`; ctx.fillText('RALPHIE', x, y - 38); return; }
    switch (kind) {
      case 'lock': ctx.fillStyle = ch === 'V' ? C.violet : '#4a3a8a'; roundRect(x - 36, y - 38, 72, 76, 12); ctx.fill(); ctx.fillStyle = a; ctx.beginPath(); ctx.arc(x, y - 4, 13, 0, 7); ctx.fill(); ctx.fillStyle = '#4a3a8a'; ctx.beginPath(); ctx.arc(x, y - 6, 5, 0, 7); ctx.fill(); ctx.fillRect(x - 3, y - 6, 6, 13); break;
      case 'ice': ctx.fillStyle = 'rgba(255,255,255,.78)'; roundRect(x - 36, y - 36, 72, 72, 9); ctx.fill(); ctx.strokeStyle = ch === 'V' ? C.magenta : a; ctx.lineWidth = 4; ctx.stroke(); ctx.strokeStyle = 'rgba(11,79,122,.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 26, y - 16); ctx.lineTo(x - 4, y + 4); ctx.lineTo(x + 22, y - 12); ctx.moveTo(x - 4, y + 4); ctx.lineTo(x + 2, y + 26); ctx.stroke(); break;
      case 'vine': ctx.strokeStyle = '#8fd15a'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 34, y - 34); ctx.bezierCurveTo(x + 34, y - 26, x - 34, y + 26, x + 34, y + 34); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + 34, y - 34); ctx.bezierCurveTo(x - 34, y - 26, x + 34, y + 26, x - 34, y + 34); ctx.stroke(); ctx.fillStyle = ch === 'V' ? C.magenta : a; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fill(); break;
      case 'gear': ctx.fillStyle = '#8a8f9c'; for (let i = 0; i < 8; i++) { ctx.save(); ctx.translate(x, y); ctx.rotate(i * Math.PI / 4); ctx.fillRect(-8, -40, 16, 18); ctx.restore(); } ctx.beginPath(); ctx.arc(x, y, 29, 0, 7); ctx.fill(); ctx.fillStyle = ch === 'V' ? C.magenta : a; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fill(); break;
      case 'chest': ctx.fillStyle = '#7a4a1e'; roundRect(x - 36, y - 16, 72, 42, 7); ctx.fill(); ctx.fillStyle = '#8f5a26'; roundRect(x - 36, y - 36, 72, 26, 10); ctx.fill(); ctx.fillStyle = ch === 'V' ? C.magenta : a; ctx.fillRect(x - 36, y - 12, 72, 7); ctx.beginPath(); ctx.arc(x, y - 4, 8, 0, 7); ctx.fill(); break;
      case 'clock': ctx.fillStyle = C.cream; ctx.beginPath(); ctx.arc(x, y, 36, 0, 7); ctx.fill(); ctx.strokeStyle = ch === 'V' ? C.magenta : a; ctx.lineWidth = 5; ctx.stroke(); ctx.strokeStyle = '#2b1316'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 22); ctx.moveTo(x, y); ctx.lineTo(x + 15, y + 7); ctx.stroke(); break;
      case 'plank': ctx.fillStyle = '#8a5a2b'; for (let i = 0; i < 3; i++) { roundRect(x - 38, y - 30 + i * 21, 76, 16, 4); ctx.fill(); } ctx.fillStyle = ch === 'V' ? C.magenta : a; ctx.font = `700 15px ${FONT}`; ctx.fillText('cm', x, y + 2); break;
      case 'grid': for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { ctx.fillStyle = (r * 4 + c) < 7 ? (ch === 'V' ? C.magenta : a) : 'rgba(255,246,229,.15)'; ctx.beginPath(); ctx.arc(x - 28 + c * 19, y - 19 + r * 19, 7, 0, 7); ctx.fill(); } break;
      case 'shape': ctx.fillStyle = ch === 'V' ? C.magenta : a; ctx.beginPath(); ctx.moveTo(x, y - 38); ctx.lineTo(x + 36, y + 26); ctx.lineTo(x - 36, y + 26); ctx.closePath(); ctx.fill(); ctx.fillStyle = b; ctx.beginPath(); ctx.moveTo(x, y - 38); ctx.lineTo(x + 36, y + 26); ctx.lineTo(x, y + 26); ctx.closePath(); ctx.fill(); break;
      case 'chart': ctx.fillStyle = 'rgba(255,246,229,.12)'; roundRect(x - 38, y - 38, 76, 76, 7); ctx.fill(); [34, 55, 24, 45].forEach((h, i) => { ctx.fillStyle = i === 1 ? (ch === 'V' ? C.magenta : a) : b; ctx.fillRect(x - 31 + i * 17, y + 29 - h, 12, h); }); break;
      case 'lift': ctx.fillStyle = '#2f4c6e'; roundRect(x - 34, y - 40, 68, 80, 7); ctx.fill(); ctx.fillStyle = ch === 'V' ? C.magenta : a; ctx.beginPath(); ctx.moveTo(x, y - 26); ctx.lineTo(x + 16, y - 7); ctx.lineTo(x - 16, y - 7); ctx.closePath(); ctx.fill(); ctx.fillStyle = C.cream; ctx.font = `700 18px ${FONT_D}`; ctx.fillText('+100', x, y + 16); break;
      case 'skull': ctx.fillStyle = C.cream; ctx.beginPath(); ctx.arc(x, y - 7, 29, 0, 7); ctx.fill(); ctx.fillRect(x - 19, y + 9, 38, 19); ctx.fillStyle = ch === 'V' ? C.magenta : a; ctx.beginPath(); ctx.arc(x - 11, y - 9, 8, 0, 7); ctx.arc(x + 11, y - 9, 8, 0, 7); ctx.fill(); break;
    }
    if (ch === 'V') { ctx.fillStyle = C.cream; ctx.font = `700 11px ${FONT}`; ctx.fillText('VAULT', x, y + 42); }
  }
  function drawHero(x, y, rank, scale) {
    const Rk = RANKS[rank] || RANKS[0]; ctx.save(); ctx.translate(x, y); ctx.scale(scale || 1, scale || 1);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, 40, 26, 8, 0, 0, 7); ctx.fill();
    if (rank >= 4) { ctx.shadowColor = Rk.cape; ctx.shadowBlur = 30; }
    ctx.fillStyle = Rk.cape; ctx.beginPath(); ctx.moveTo(-16, -14); ctx.quadraticCurveTo(-36, 10, -28, 34); ctx.lineTo(28, 34); ctx.quadraticCurveTo(36, 10, 16, -14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = Rk.suit; roundRect(-18, -16, 36, 40, 12); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = C.ink; ctx.font = `700 20px ${FONT_D}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', 0, 4);
    if (rank >= 2) { ctx.fillStyle = C.gold; ctx.beginPath(); ctx.moveTo(-18, -16); ctx.lineTo(-26, -2); ctx.lineTo(-18, -4); ctx.closePath(); ctx.moveTo(18, -16); ctx.lineTo(26, -2); ctx.lineTo(18, -4); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#2a2470'; roundRect(-16, 22, 14, 14, 5); ctx.fill(); roundRect(2, 22, 14, 14, 5); ctx.fill();
    ctx.fillStyle = '#8d5a3b'; ctx.beginPath(); ctx.arc(0, -32, 18, 0, 7); ctx.fill(); ctx.fillStyle = '#1a0f0a'; roundRect(-18, -52, 36, 14, 7); ctx.fill();
    ctx.fillStyle = Rk.cape; roundRect(-18, -38, 36, 9, 4); ctx.fill(); ctx.fillStyle = C.cream; ctx.beginPath(); ctx.arc(-6, -33, 2.6, 0, 7); ctx.arc(6, -33, 2.6, 0, 7); ctx.fill();
    if (rank >= 3) { ctx.fillStyle = C.gold; ctx.beginPath(); ctx.moveTo(-10, -54); ctx.lineTo(-6, -64); ctx.lineTo(0, -56); ctx.lineTo(6, -64); ctx.lineTo(10, -54); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  function drawRalphie(x, y) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y + 22, 20, 6, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#3f8f4f'; ctx.beginPath(); ctx.ellipse(x, y + 4, 22, 16, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#2d6b3a'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x - 10 + i * 10, y + 2, 5, 0, 7); ctx.fill(); } ctx.fillStyle = '#7bd389'; ctx.beginPath(); ctx.arc(x - 22, y, 9, 0, 7); ctx.fill(); ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(x - 25, y - 2, 1.8, 0, 7); ctx.fill(); }
  function drawVillain(x, y, w) { const b = Math.sin(S.t * 2) * 4; ctx.fillStyle = w.acc; roundRect(x - 30, y - 26 + b, 60, 54, 12); ctx.fill(); ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(x - 12, y - 6 + b, 7, 0, 7); ctx.arc(x + 12, y - 6 + b, 7, 0, 7); ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 12, y + 14 + b); ctx.quadraticCurveTo(x, y + 4 + b, x + 12, y + 14 + b); ctx.stroke(); ctx.fillStyle = C.cream; ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(w.vil.toUpperCase(), x, y + 42); }
  function drawRoom() {
    const w = WORLDS[S.worldIdx], rm = S.room; ctx.fillStyle = w.wall; ctx.fillRect(0, 0, W, H);
    const h = rm.hero; const hp = { x: OX + h.x * T + T / 2, y: OY + h.y * T + T / 2 };
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = rm.grid[r][c], x = OX + c * T, y = OY + r * T, px = x + T / 2, py = y + T / 2, opened = rm.opened.has(key(c, r));
      if (ch === '#') { ctx.fillStyle = w.wall; ctx.fillRect(x, y, T, T); ctx.fillStyle = 'rgba(255,255,255,.06)'; for (let by = y + 8; by < y + T - 8; by += 24) for (let bx = x + (((by / 24) | 0) % 2 ? 16 : 4); bx < x + T - 8; bx += 34) ctx.fillRect(bx, by, 28, 17); continue; }
      ctx.fillStyle = (c + r) % 2 ? w.floor : w.floor2; ctx.fillRect(x, y, T, T); ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.strokeRect(x + .5, y + .5, T - 1, T - 1);
      if (S.twist === 'fog' && !rm.seen.has(key(c, r))) { ctx.fillStyle = 'rgba(11,12,34,.86)'; ctx.fillRect(x, y, T, T); continue; }
      if (ch === 'E') { ctx.fillStyle = w.acc2; roundRect(x + 18, y + 18, T - 36, T - 36, 10); ctx.fill(); ctx.fillStyle = w.dark ? C.cream : C.ink; ctx.font = `700 24px ${FONT_D}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('UP', px, py + 2); }
      if (ch === 'G' && !opened) { ctx.fillStyle = w.acc2; const gy = py + Math.sin(S.t * 3 + c) * 4; ctx.beginPath(); ctx.moveTo(px, gy - 18); ctx.lineTo(px + 15, gy - 5); ctx.lineTo(px, gy + 20); ctx.lineTo(px - 15, gy - 5); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.moveTo(px - 3, gy - 15); ctx.lineTo(px + 7, gy - 7); ctx.lineTo(px - 2, gy - 5); ctx.closePath(); ctx.fill(); }
      if (isLockCh(ch)) {
        if (!opened) { if (S.sel === key(c, r)) { ctx.strokeStyle = C.cyan; ctx.lineWidth = 4; roundRect(x + 6, y + 4, T - 12, T - 8, 14); ctx.stroke(); } drawLock(w.lock, px, py, w, ch); }
        else { ctx.strokeStyle = C.mint; ctx.lineWidth = 3; roundRect(x + 12, y + 8, T - 24, T - 16, 12); ctx.stroke(); }
      }
    }
    if (rm.path.length) { ctx.fillStyle = 'rgba(53,224,255,.35)'; for (const n of rm.path) { const p = tilePos(n.c, n.r); ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 7); ctx.fill(); } }
    if (S.twist === 'night') { const g = ctx.createRadialGradient(hp.x, hp.y, 70, hp.x, hp.y, 380); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.86)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (isLockCh(rm.grid[r][c]) && !rm.opened.has(key(c, r))) { const p = tilePos(c, r); ctx.fillStyle = 'rgba(255,199,44,.55)'; ctx.beginPath(); ctx.arc(p.x, p.y, 6 + Math.sin(S.t * 4) * 2, 0, 7); ctx.fill(); } }
    if (rm.ralphie) { const t = rm.trail || { x: h.x, y: h.y }; drawRalphie(OX + t.x * T + T / 2, OY + t.y * T + T / 2); }
    drawHero(hp.x, hp.y + Math.sin(S.t * 4) * 2, rankFor(S.progress ? S.progress.first_try_total + S.firstTryToday : 0));
    if (S.floorIdx === 2 && !rm.bonus) { let ex = 0, ey = 0; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (rm.grid[r][c] === 'E') { const p = tilePos(c, r); ex = p.x + (S.twist === 'mirror' ? T : -T); ey = p.y - T; } if (!allVaultsOpen()) drawVillain(ex, ey, w); }
    // header strip on canvas
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, W, 48); ctx.font = `700 22px ${FONT_D}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = w.acc; ctx.fillText(`${w.n.toUpperCase()} · FLOOR ${S.floorIdx} · ${rm.bonus ? 'BONUS ROOM' : 'ROOM ' + (S.roomIdx + 1)}`, 22, 24);
    ctx.textAlign = 'right'; ctx.fillStyle = C.cream; ctx.font = `700 14px ${FONT}`; const tw = TWISTS.find((t) => t.id === S.twist) || TWISTS[0]; ctx.fillText(`${tw.label.toUpperCase()}   ·   TAP A TILE TO WALK · TAP A LOCK TO SOLVE`, W - 22, 24);
  }
  function drawFX(dt) {
    S.particles = S.particles.filter((p) => (p.life -= dt) > 0); for (const p of S.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.col; ctx.fillRect(p.x, p.y, p.r, p.r); } ctx.globalAlpha = 1;
    S.floats = S.floats.filter((f) => (f.life -= dt) > 0); for (const f of S.floats) { f.y -= 50 * dt; ctx.globalAlpha = Math.min(1, f.life); ctx.font = `700 30px ${FONT_D}`; ctx.textAlign = 'center'; ctx.fillStyle = f.col; ctx.fillText(f.txt, f.x, f.y); } ctx.globalAlpha = 1;
  }
  function drawIdle() { const w = WORLDS[S.worldIdx]; const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, w.wall); g.addColorStop(1, w.floor); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  function drawHQHero() {
    const c2 = $('hq-hero'); if (!c2) return; const x2 = c2.getContext('2d'); const w = WORLDS[S.worldIdx];
    x2.fillStyle = w.floor; x2.fillRect(0, 0, c2.width, c2.height);
    drawHeroWith(x2, c2.width / 2, c2.height / 2 + 12, rankFor(S.progress.first_try_total), 1.15);
  }
  function drawHeroWith(c2, x, y, rank, scale) { // drawHero against another canvas (HQ card)
    const Rk = RANKS[rank] || RANKS[0]; const rr = (X, Y, Wd, Ht, r) => { c2.beginPath(); c2.moveTo(X + r, Y); c2.arcTo(X + Wd, Y, X + Wd, Y + Ht, r); c2.arcTo(X + Wd, Y + Ht, X, Y + Ht, r); c2.arcTo(X, Y + Ht, X, Y, r); c2.arcTo(X, Y, X + Wd, Y, r); c2.closePath(); };
    c2.save(); c2.translate(x, y); c2.scale(scale, scale);
    c2.fillStyle = 'rgba(0,0,0,.35)'; c2.beginPath(); c2.ellipse(0, 40, 26, 8, 0, 0, 7); c2.fill();
    if (rank >= 4) { c2.shadowColor = Rk.cape; c2.shadowBlur = 30; }
    c2.fillStyle = Rk.cape; c2.beginPath(); c2.moveTo(-16, -14); c2.quadraticCurveTo(-36, 10, -28, 34); c2.lineTo(28, 34); c2.quadraticCurveTo(36, 10, 16, -14); c2.closePath(); c2.fill();
    c2.fillStyle = Rk.suit; rr(-18, -16, 36, 40, 12); c2.fill(); c2.shadowBlur = 0;
    c2.fillStyle = C.ink; c2.font = `700 20px ${FONT_D}`; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText('N', 0, 4);
    if (rank >= 2) { c2.fillStyle = C.gold; c2.beginPath(); c2.moveTo(-18, -16); c2.lineTo(-26, -2); c2.lineTo(-18, -4); c2.closePath(); c2.moveTo(18, -16); c2.lineTo(26, -2); c2.lineTo(18, -4); c2.closePath(); c2.fill(); }
    c2.fillStyle = '#2a2470'; rr(-16, 22, 14, 14, 5); c2.fill(); rr(2, 22, 14, 14, 5); c2.fill();
    c2.fillStyle = '#8d5a3b'; c2.beginPath(); c2.arc(0, -32, 18, 0, 7); c2.fill(); c2.fillStyle = '#1a0f0a'; rr(-18, -52, 36, 14, 7); c2.fill();
    c2.fillStyle = Rk.cape; rr(-18, -38, 36, 9, 4); c2.fill(); c2.fillStyle = C.cream; c2.beginPath(); c2.arc(-6, -33, 2.6, 0, 7); c2.arc(6, -33, 2.6, 0, 7); c2.fill();
    if (rank >= 3) { c2.fillStyle = C.gold; c2.beginPath(); c2.moveTo(-10, -54); c2.lineTo(-6, -64); c2.lineTo(0, -56); c2.lineTo(6, -64); c2.lineTo(10, -54); c2.closePath(); c2.fill(); }
    c2.restore();
    c2.fillStyle = C.cream; c2.font = `700 13px ${FONT}`; c2.textAlign = 'center'; c2.fillText(`${Rk.n} · next rank at ${RANKS[Math.min(RANKS.length - 1, rank + 1)].at} first-try locks`, x, y + 62);
  }

  // ------------------------------------------------------------------ loop
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; S.t += dt;
    if (S.room && (S.mode === 'play' || S.mode === 'prob' || S.mode === 'resolving' || S.mode === 'roomend')) {
      const rm = S.room;
      if (S.mode === 'play' && rm.path.length) {
        rm.walkT += dt * 7;
        if (rm.walkT >= 1) {
          rm.walkT = 0; const n = rm.path.shift(); rm.trail = { x: rm.hero.c, y: rm.hero.r }; rm.hero.c = n.c; rm.hero.r = n.r; rm.hero.x = n.c; rm.hero.y = n.r; Music.sfx('step');
          for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (Math.abs(dr) + Math.abs(dc) <= 2) rm.seen.add(key(n.c + dc, n.r + dr));
          const ch = tile(n.c, n.r);
          if (ch === 'G' && !rm.opened.has(key(n.c, n.r))) { rm.opened.add(key(n.c, n.r)); S.gemsToday += 3; setGems(); const p = tilePos(n.c, n.r); burst(p.x, p.y, C.cyan, 22); S.floats.push({ x: p.x, y: p.y - 30, txt: '+3 ◆', col: C.cyan, life: 1.2 }); Music.sfx('gem'); saveLocal(); }
          if (ch === 'E') { rm.path = []; setTimeout(roomCleared, 300); }
          if (!rm.path.length && rm.pending) { const pd = rm.pending; rm.pending = null; if (!rm.opened.has(key(pd.c, pd.r))) setTimeout(() => openProblem(pd), 120); }
          if (!rm.path.length) saveLocal();
        } else { const n = rm.path[0]; rm.hero.x = rm.hero.c + (n.c - rm.hero.c) * rm.walkT; rm.hero.y = rm.hero.r + (n.r - rm.hero.r) * rm.walkT; }
      }
      drawRoom(); drawFX(dt);
    } else drawIdle();
    requestAnimationFrame(frame);
  }
  function fit() { const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  fit(); window.addEventListener('resize', fit);

  // ------------------------------------------------------------------ boot
  function rollTwist(gameDays) { const pool = TWISTS.filter((t) => gameDays >= t.from); const rng = mulberry(hash32(CHILD_ID + S.date + 'twist')); return gameDays === 0 ? 'none' : pool[Math.floor(rng() * pool.length)].id; }
  async function boot() {
    Voice.init();
    $('exit-btn').addEventListener('click', () => { saveLocal(); Voice.stop(); Music.stop(); window.location.href = '/'; });
    $('mute-btn').addEventListener('click', () => { Voice.muted = !Voice.muted; $('mute-btn').textContent = Voice.muted ? '🔇' : '🔊'; if (Voice.muted) Voice.stop(); try { if (NS.Humphrey && NS.Humphrey.isMuted() !== Voice.muted) NS.Humphrey.toggleMute(); } catch (_) {} });
    $('music-btn').addEventListener('click', () => { const on = Music.toggle(); $('music-btn').style.opacity = on ? '1' : '.4'; });
    $('hq-go').addEventListener('click', leaveHQ);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveLocal(); S.lastTick = Date.now(); });
    window.addEventListener('pagehide', saveLocal);

    const state = await rpc('ha_tower_get_state', { p_child_id: CHILD_ID, p_season: SEASON });
    S.progress = (state && state.progress) || { gems: 0, crown: [], floors: [], gadgets: {}, floor_idx: 1, game_days: 0, world_idx: 0, locks_total: 0, first_try_total: 0 };
    S.weakKinds = [...new Set(((state && state.weak_topics) || []).map((t) => weakKindFromTopic(t.topic_id)).filter(Boolean))]; if (!S.weakKinds.length) S.weakKinds = ['add2r'];
    S.worldIdx = Math.min(WORLDS.length - 1, S.progress.world_idx || 0); S.floorIdx = S.progress.floor_idx || 1;

    const saved = loadLocal();
    if (saved && saved.v === 1) {
      Object.assign(S, { phase: saved.phase, elapsedMs: saved.elapsedMs || 0, completed: !!saved.completed, roomIdx: saved.roomIdx || 0, twist: saved.twist || 'none', gemsToday: saved.gemsToday || 0, locksToday: saved.locksToday || 0, firstTryToday: saved.firstTryToday || 0, assistedToday: saved.assistedToday || 0, boardToday: saved.boardToday || 0, misses: saved.misses || [], topics: saved.topics || {}, warmupDone: saved.warmupDone || 0, debriefDone: saved.debriefDone || 0 });
      if (typeof saved.worldIdx === 'number') { S.worldIdx = saved.worldIdx; S.floorIdx = saved.floorIdx || 1; }
      S.resumePhase = saved.phase || 'hq'; S.savedRoom = saved.room || null;
    } else { S.twist = rollTwist(S.progress.game_days || 0); }
    S.lastTick = Date.now(); S.mode = 'hq'; $('boot-overlay').style.display = 'none';
    setWorldBadge(); setGems();
    if (S.completed) { S.mode = 'done'; $('done-ov').hidden = false; $('done-say').textContent = 'Game Day is already done today, Nigel. See you Thursday!'; $('done-go').onclick = () => { window.location.href = '/'; }; return; }
    showHQ();
  }
  requestAnimationFrame(frame);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  NS.DigitTower = { state: S, worlds: WORLDS, makeQuestion, _music: Music, _voice: Voice };
})();
