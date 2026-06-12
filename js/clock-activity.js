// =========================================================================
// js/clock-activity.js — v180
//
// 5-minute analog clock learning activity. Runs after the math course in
// Class Time, before the between-course break overlay. The kid sees an
// SVG analog clock, Ms. Humphrey reads the prompt + 4 options, then he
// taps an answer — same UX as the math/reading multiple-choice flow.
//
// MD MCCRS 2.MD.C.7: "Tell and write time from analog and digital clocks
// to the nearest five minutes, using a.m. and p.m." Five questions at
// ~60s each = the 5-minute window Josh asked for.
//
// API:
//   HeroAcademy.ClockActivity.start({ onComplete })
//     onComplete(): called when the kid finishes or skips the activity.
// =========================================================================
(function () {
  'use strict';
  const NS = (window.HeroAcademy = window.HeroAcademy || {});

  const ACTIVITY_QUESTIONS = 5;

  // ---- Time pool ---------------------------------------------------------
  // Spread across o'clock, half past, quarter past, quarter to, and a couple
  // five-minute reads so the kid gets both easy wins and stretch problems.
  const TIME_POOL = [
    { h: 3, m: 0 },   // 3 o'clock
    { h: 7, m: 30 },  // 7:30
    { h: 9, m: 15 },  // 9:15
    { h: 4, m: 45 },  // 4:45
    { h: 12, m: 0 },  // 12 o'clock
    { h: 1, m: 30 },  // 1:30
    { h: 6, m: 15 },  // 6:15
    { h: 10, m: 45 }, // 10:45
    { h: 2, m: 5 },   // 2:05
    { h: 8, m: 35 },  // 8:35
    { h: 5, m: 20 },  // 5:20
    { h: 11, m: 50 }, // 11:50
  ];

  function formatTime(h, m) {
    const mm = String(m).padStart(2, '0');
    return `${h}:${mm}`;
  }

  function describeTime(h, m) {
    if (m === 0) return `${h} o'clock`;
    if (m === 15) return `Quarter past ${h}`;
    if (m === 30) return `Half past ${h}`;
    if (m === 45) return `Quarter to ${h % 12 + 1}`;
    return `${h} ${String(m).padStart(2, '0')}`;
  }

  function dateSeed(dateStr) {
    if (!dateStr) return Date.now() % 1000;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!m) return 0;
    return parseInt(m[1], 10) * 372 + parseInt(m[2], 10) * 31 + parseInt(m[3], 10);
  }

  function pickQuestions(dateStr) {
    const seed = dateSeed(dateStr);
    const used = new Set();
    const out = [];
    for (let i = 0; i < ACTIVITY_QUESTIONS; i++) {
      // Walk the pool deterministically per day, skip dupes.
      let idx = (seed + i * 5) % TIME_POOL.length;
      let tries = 0;
      while (used.has(idx) && tries < TIME_POOL.length) {
        idx = (idx + 1) % TIME_POOL.length;
        tries++;
      }
      used.add(idx);
      const t = TIME_POOL[idx];
      out.push(buildQuestion(t.h, t.m, i + seed));
    }
    return out;
  }

  function buildQuestion(h, m, salt) {
    const correctLabel = describeTime(h, m);
    // Three plausible distractors:
    //   - same hour, different familiar minute
    //   - hour ± 1
    //   - swap hour and minute role (e.g. for 3:15, offer "Quarter past 4")
    const candidates = [
      describeTime(h, (m + 15) % 60),
      describeTime(((h % 12) + 1), m),
      describeTime(((h + 10) % 12) + 1, m),
      describeTime(h, m === 0 ? 30 : 0),
    ].filter((s) => s !== correctLabel);

    // De-dupe while keeping order
    const seen = new Set([correctLabel]);
    const distractors = [];
    for (const c of candidates) {
      if (!seen.has(c)) { seen.add(c); distractors.push(c); }
      if (distractors.length >= 3) break;
    }
    while (distractors.length < 3) distractors.push(describeTime((h + distractors.length + 2) % 12 || 12, m));

    const correctIdx = ((salt * 7) % 4 + 4) % 4;
    const options = distractors.slice(0, 3);
    options.splice(correctIdx, 0, correctLabel);

    return {
      hour: h,
      minute: m,
      question: 'What time does this clock show?',
      options: options.slice(0, 4),
      correct_index: correctIdx,
      explanation: `This clock shows ${formatTime(h, m)} — ${correctLabel.toLowerCase()}.`,
    };
  }

  // ---- SVG analog clock --------------------------------------------------
  // 300×300 viewbox; hour hand short and fat, minute hand long and thin,
  // 12 hour markers, 60 minute pips. Drawn from scratch so we don't bring
  // a new asset into the deploy chain.
  function renderClockSvg(h, m) {
    const hourAngle = ((h % 12) * 30 + (m / 60) * 30) - 90;
    const minAngle = (m * 6) - 90;

    const markers = [];
    for (let i = 0; i < 12; i++) {
      const a = (i * 30 - 90) * Math.PI / 180;
      const x1 = 150 + Math.cos(a) * 115;
      const y1 = 150 + Math.sin(a) * 115;
      const x2 = 150 + Math.cos(a) * 130;
      const y2 = 150 + Math.sin(a) * 130;
      markers.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#1e293b" stroke-width="4" stroke-linecap="round"/>`);
      // Hour number
      const nx = 150 + Math.cos(a) * 98;
      const ny = 150 + Math.sin(a) * 98;
      const label = i === 0 ? 12 : i;
      markers.push(`<text x="${nx.toFixed(1)}" y="${(ny + 7).toFixed(1)}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="22" font-weight="700" fill="#1e293b">${label}</text>`);
    }

    const minPips = [];
    for (let i = 0; i < 60; i++) {
      if (i % 5 === 0) continue;
      const a = (i * 6 - 90) * Math.PI / 180;
      const x1 = 150 + Math.cos(a) * 125;
      const y1 = 150 + Math.sin(a) * 125;
      const x2 = 150 + Math.cos(a) * 132;
      const y2 = 150 + Math.sin(a) * 132;
      minPips.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#94a3b8" stroke-width="1.5"/>`);
    }

    const hourRad = hourAngle * Math.PI / 180;
    const minRad = minAngle * Math.PI / 180;
    const hourX = 150 + Math.cos(hourRad) * 70;
    const hourY = 150 + Math.sin(hourRad) * 70;
    const minX = 150 + Math.cos(minRad) * 105;
    const minY = 150 + Math.sin(minRad) * 105;

    return `
<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Analog clock showing ${formatTime(h, m)}">
  <circle cx="150" cy="150" r="140" fill="#fffbeb" stroke="#b45309" stroke-width="4"/>
  ${minPips.join('')}
  ${markers.join('')}
  <line x1="150" y1="150" x2="${hourX.toFixed(1)}" y2="${hourY.toFixed(1)}" stroke="#1e293b" stroke-width="9" stroke-linecap="round"/>
  <line x1="150" y1="150" x2="${minX.toFixed(1)}" y2="${minY.toFixed(1)}" stroke="#7c3aed" stroke-width="5" stroke-linecap="round"/>
  <circle cx="150" cy="150" r="9" fill="#1e293b"/>
  <circle cx="150" cy="150" r="3" fill="#fbbf24"/>
</svg>`;
  }

  // ---- Overlay UI --------------------------------------------------------
  function ensureOverlay() {
    let el = document.getElementById('clock-activity-overlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'clock-activity-overlay';
    el.innerHTML = `
      <style>
        #clock-activity-overlay {
          position: fixed; inset: 0; z-index: 5000;
          background: linear-gradient(180deg, #fff7ed 0%, #fed7aa 45%, #c7d2fe 100%);
          display: none; flex-direction: column; align-items: center; justify-content: flex-start;
          padding: 24px; gap: 18px; overflow: hidden;
        }
        #clock-activity-overlay .ca-header {
          width: 100%; max-width: 880px; display: flex; align-items: center; justify-content: space-between;
        }
        #clock-activity-overlay .ca-title {
          font-weight: 700; font-size: 20px; color: #b45309; display: flex; align-items: center; gap: 10px;
        }
        #clock-activity-overlay .ca-title .badge {
          background: rgba(251,191,36,0.15); color: #b45309; padding: 2px 10px; border-radius: 999px; font-size: 12px;
        }
        #clock-activity-overlay .ca-progress {
          font-variant-numeric: tabular-nums; font-weight: 600; color: #6d28d9; min-width: 70px; text-align: right;
        }
        #clock-activity-overlay .ca-skip {
          background: rgba(255,255,255,0.78); border: 1px solid rgba(91,33,182,0.22); border-radius: 12px;
          padding: 6px 12px; color: #1e293b; font-size: 13px; cursor: pointer;
        }
        #clock-activity-overlay .ca-stage {
          flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 16px; width: 100%; max-width: 880px;
        }
        #clock-activity-overlay .ca-clock { width: 280px; height: 280px; max-width: 60vh; max-height: 60vh; }
        #clock-activity-overlay .ca-question {
          font-size: 22px; font-weight: 700; color: #1e293b; text-align: center; margin: 0;
        }
        #clock-activity-overlay .ca-status {
          font-size: 14px; color: #6d28d9; display: flex; align-items: center; gap: 8px;
        }
        #clock-activity-overlay .ca-status .ca-dot {
          width: 10px; height: 10px; border-radius: 50%; background: #fbbf24; animation: ca-pulse 1.2s ease-in-out infinite;
        }
        #clock-activity-overlay .ca-status.ready .ca-dot { background: #22c55e; animation: none; }
        @keyframes ca-pulse { 0%,100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.4); opacity: 1; } }
        #clock-activity-overlay .ca-options {
          display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;
          width: 100%; max-width: 700px;
        }
        #clock-activity-overlay .ca-opt {
          background: rgba(255,255,255,0.85); border: 2px solid rgba(91,33,182,0.22); border-radius: 14px;
          padding: 14px 16px; font-size: 18px; font-weight: 600; color: #1e293b; cursor: pointer;
          display: flex; align-items: center; gap: 10px; text-align: left;
          transition: transform .12s ease, box-shadow .12s ease, background .12s ease;
        }
        #clock-activity-overlay .ca-opt:not(:disabled):hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(91,33,182,0.18); background: #fff; }
        #clock-activity-overlay .ca-opt:disabled { opacity: 0.55; cursor: default; }
        #clock-activity-overlay .ca-opt.is-correct { background: #dcfce7; border-color: #16a34a; }
        #clock-activity-overlay .ca-opt.is-wrong { background: #fee2e2; border-color: #dc2626; }
        #clock-activity-overlay .ca-opt .letter {
          display: inline-flex; align-items: center; justify-content: center;
          width: 28px; height: 28px; border-radius: 8px; background: rgba(124,58,237,0.12);
          color: #6d28d9; font-weight: 800; font-size: 14px; flex: 0 0 auto;
        }
        #clock-activity-overlay .ca-feedback { min-height: 24px; font-size: 15px; color: #6d28d9; }
      </style>
      <div class="ca-header">
        <div class="ca-title">🕒 Clock Practice <span class="badge">5 min</span></div>
        <div class="ca-progress" id="ca-progress">0 / ${ACTIVITY_QUESTIONS}</div>
        <button class="ca-skip" id="ca-skip-btn">Skip</button>
      </div>
      <div class="ca-stage">
        <div class="ca-clock" id="ca-clock"></div>
        <h2 class="ca-question" id="ca-question">What time does this clock show?</h2>
        <div class="ca-status" id="ca-status"><span class="ca-dot"></span> Ms. Humphrey is reading…</div>
        <div class="ca-options" id="ca-options"></div>
        <div class="ca-feedback" id="ca-feedback"></div>
      </div>
    `;
    document.body.appendChild(el);
    return el;
  }

  function tts(text) {
    const H = NS.Humphrey;
    if (!H || typeof H.say !== 'function') return Promise.resolve();
    try { return Promise.resolve(H.say('clock-activity', { kidName: 'Nigel', text: String(text), priority: 'high' })); }
    catch (_) { return Promise.resolve(); }
  }
  function pause(ms) { return new Promise(r => setTimeout(r, ms)); }
  function letterFor(i) { return String.fromCharCode(65 + i); }

  async function run(opts) {
    const dateStr = (opts && opts.date) || (function () {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const onComplete = (opts && typeof opts.onComplete === 'function') ? opts.onComplete : function () {};

    const overlay = ensureOverlay();
    overlay.style.display = 'flex';
    const questions = pickQuestions(dateStr);
    let idx = 0;
    let finished = false;

    const close = (reason) => {
      if (finished) return;
      finished = true;
      overlay.style.display = 'none';
      try { onComplete({ reason: reason || 'done', answered: idx }); } catch (_) {}
    };

    const skipBtn = overlay.querySelector('#ca-skip-btn');
    skipBtn.onclick = () => {
      try { logEvent('clock_activity_skip', { answered: idx }); } catch (_) {}
      close('skipped');
    };

    const renderQuestion = async () => {
      if (idx >= questions.length) {
        try { logEvent('clock_activity_complete', { answered: idx }); } catch (_) {}
        await tts('Great work on the clock! Time to take a break.');
        close('completed');
        return;
      }
      const q = questions[idx];
      overlay.querySelector('#ca-progress').textContent = `${idx} / ${questions.length}`;
      overlay.querySelector('#ca-clock').innerHTML = renderClockSvg(q.hour, q.minute);
      overlay.querySelector('#ca-question').textContent = q.question;
      overlay.querySelector('#ca-feedback').textContent = '';

      const status = overlay.querySelector('#ca-status');
      status.classList.remove('ready');
      status.innerHTML = '<span class="ca-dot"></span> Ms. Humphrey is reading…';

      const optsWrap = overlay.querySelector('#ca-options');
      optsWrap.innerHTML = '';
      const buttons = q.options.map((opt, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ca-opt';
        btn.disabled = true;
        btn.innerHTML = `<span class="letter">${letterFor(i)}</span><span class="text">${opt}</span>`;
        btn.addEventListener('click', () => onPick(i, btn, q));
        optsWrap.appendChild(btn);
        return btn;
      });

      // Sequential read: question, then each option labeled.
      const readGen = ++renderQuestion._gen || (renderQuestion._gen = 1);
      try {
        await tts(q.question);
        if (readGen !== renderQuestion._gen) return;
        await pause(300);
        for (let i = 0; i < q.options.length; i++) {
          if (readGen !== renderQuestion._gen) return;
          await tts(`${letterFor(i)}. ${q.options[i]}.`);
          await pause(250);
        }
      } catch (e) {
        console.warn('[clock-activity] TTS error', e);
      }
      buttons.forEach((b) => { b.disabled = false; });
      status.classList.add('ready');
      status.innerHTML = '<span class="ca-dot"></span> Tap your answer →';
    };

    const onPick = async (i, btn, q) => {
      if (btn.disabled) return;
      const buttons = overlay.querySelectorAll('.ca-opt');
      buttons.forEach((b) => { b.disabled = true; });
      const isRight = i === q.correct_index;
      if (isRight) {
        btn.classList.add('is-correct');
        overlay.querySelector('#ca-feedback').textContent = '✓ Nice!';
        try { logEvent('clock_activity_answer', { idx, correct: true, time: `${q.hour}:${q.minute}` }); } catch (_) {}
        await tts(q.explanation);
        await pause(300);
        idx++;
        renderQuestion();
      } else {
        btn.classList.add('is-wrong');
        overlay.querySelector('#ca-feedback').textContent = 'Not quite — try again.';
        try { logEvent('clock_activity_answer', { idx, correct: false, time: `${q.hour}:${q.minute}` }); } catch (_) {}
        await tts(`Not quite. Look at the short hand for the hour and the long hand for the minutes.`);
        // Re-enable other buttons for a second try
        buttons.forEach((b, j) => { if (j !== i) b.disabled = false; });
      }
    };

    try { logEvent('clock_activity_start', { count: questions.length }); } catch (_) {}
    renderQuestion();
  }

  function logEvent(eventType, payload) {
    if (NS.Telemetry && typeof NS.Telemetry.rpc === 'function') {
      NS.Telemetry.rpc('ha_record_event', {
        p_child_id: NS.Telemetry.childId ? NS.Telemetry.childId() : null,
        p_event_type: eventType,
        p_payload: payload || {},
      });
    }
  }

  NS.ClockActivity = { start: run };
  try { console.log('[clock-activity] module loaded'); } catch (_) {}
})();
