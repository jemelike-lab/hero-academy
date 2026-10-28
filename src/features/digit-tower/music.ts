// @ts-nocheck
// Ported verbatim from js/digit-tower.js v210: procedural per-world WebAudio loop + sfx.
import { WORLDS } from './config';
function mulberry(a: number) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const Music = (function () {
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
      // iPad suspends (or "interrupts") the context during sleep and app switches.
      resume() { if (ac && ac.state !== 'running' && ac.state !== 'closed') ac.resume().catch(() => {}); },
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
