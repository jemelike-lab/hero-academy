// =========================================================================
// js/clock-activity.js — v186
//
// TEACHING-MODE analog clock activity. Runs after the math course in Class
// Time, before the between-course break overlay.
//
// v186 rewrite: the prior version was a 5-question quiz that *tested* whether
// Nigel could already read a clock. He can't yet. This version TEACHES it
// from scratch across 5 guided stages, one hand at a time, with animated
// hands and the hand-being-discussed highlighted. The old quiz still exists
// as the "graduation" experience once the 2-week teaching window closes.
//
// Teaching window: first 14 days from FIRST_DAY (Mon 2026-06-15). During the
// window, start() runs the guided lesson (all 5 stages, every day —
// repetition is the teacher at this age). After the window, start() runs the
// legacy practice quiz (runQuiz, preserved below).
//
// Pedagogy (one hand at a time — never both until they're each understood):
//   Stage 1  Meet the hands     — name short/hour + long/minute, tap-to-ID
//   Stage 2  Hour hand alone    — minute hand HIDDEN, read short hand
//   Stage 3  Minute hand alone  — hour hand HIDDEN, sweep + count by 5s
//   Stage 4  o'clock (both)     — minute on 12 -> just read the hour
//   Stage 5  half past (both)   — minute on 6 -> "half past N"
//
// MD MCCRS 2.MD.C.7. Quarter past / quarter to are deferred to week 2+ in a
// later pass once o'clock + half-past are solid.
//
// API:
//   HeroAcademy.ClockActivity.start({ date, onComplete })
//     date: 'YYYY-MM-DD' (defaults to today). Drives teach-vs-quiz gating.
//     onComplete({ reason, ... }): called when finished or skipped.
// =========================================================================
(function () {
  'use strict';
  const NS = (window.HeroAcademy = window.HeroAcademy || {});

  // First teaching day = Monday 2026-06-15. 14-day window inclusive.
  const FIRST_DAY = '2026-06-15';
  const TEACH_WINDOW_DAYS = 14;

  // v187: generation token. Bumped whenever a run starts or is torn down
  // (Skip / complete / error). In-flight async reads check this and bail
  // if it changed, so a Skip mid-read stops Ms. Humphrey cleanly.
  let RUN_GEN = 0;

  // ---- date helpers ------------------------------------------------------
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function daysBetween(a, b) {
    const pa = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a);
    const pb = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b);
    if (!pa || !pb) return 0;
    const da = Date.UTC(+pa[1], +pa[2] - 1, +pa[3]);
    const db = Date.UTC(+pb[1], +pb[2] - 1, +pb[3]);
    return Math.round((db - da) / 86400000);
  }
  function inTeachingWindow(dateStr) {
    const delta = daysBetween(FIRST_DAY, dateStr);
    return delta >= 0 && delta < TEACH_WINDOW_DAYS;
  }

  // ---- small utils -------------------------------------------------------
  function pause(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function letterFor(i) { return String.fromCharCode(65 + i); }
  function formatTime(h, m) { return `${h}:${String(m).padStart(2, '0')}`; }

  function tts(text) {
    const H = NS.Humphrey;
    if (!H || typeof H.say !== 'function') return Promise.resolve();
    try {
      return Promise.resolve(
        H.say('clock-activity', { kidName: 'Nigel', text: String(text), priority: 'high' })
      );
    } catch (_) { return Promise.resolve(); }
  }

  function logEvent(eventType, payload) {
    if (NS.Telemetry && typeof NS.Telemetry.rpc === 'function') {
      try {
        NS.Telemetry.rpc('ha_record_event', {
          p_child_id: NS.Telemetry.childId ? NS.Telemetry.childId() : null,
          p_event_type: eventType,
          p_payload: payload || {},
        });
      } catch (_) {}
    }
  }

  // =======================================================================
  // SVG CLOCK with addressable parts so we can hide/show/highlight/animate
  // individual hands. viewBox 300x300. Hands are <line> elements rotated
  // about the center via CSS transforms.
  // =======================================================================
  function hourAngle(h, m) { return (h % 12) * 30 + (m / 60) * 30; }
  function minAngle(m) { return m * 6; }

  function buildClockMarkup() {
    const markers = [];
    for (let i = 0; i < 12; i++) {
      const a = (i * 30 - 90) * Math.PI / 180;
      const x1 = 150 + Math.cos(a) * 115, y1 = 150 + Math.sin(a) * 115;
      const x2 = 150 + Math.cos(a) * 130, y2 = 150 + Math.sin(a) * 130;
      markers.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#1e293b" stroke-width="4" stroke-linecap="round"/>`);
      const nx = 150 + Math.cos(a) * 98, ny = 150 + Math.sin(a) * 98;
      const label = i === 0 ? 12 : i;
      markers.push(`<text x="${nx.toFixed(1)}" y="${(ny + 8).toFixed(1)}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="24" font-weight="800" fill="#1e293b" class="ca-num" data-num="${label}">${label}</text>`);
    }
    const minPips = [];
    for (let i = 0; i < 60; i++) {
      if (i % 5 === 0) continue;
      const a = (i * 6 - 90) * Math.PI / 180;
      const x1 = 150 + Math.cos(a) * 125, y1 = 150 + Math.sin(a) * 125;
      const x2 = 150 + Math.cos(a) * 132, y2 = 150 + Math.sin(a) * 132;
      minPips.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#94a3b8" stroke-width="1.5"/>`);
    }
    // Hands drawn pointing up (to 12); rotated via CSS transform about center.
    return `
<svg id="ca-svg" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Teaching clock">
  <circle cx="150" cy="150" r="140" fill="#fffbeb" stroke="#b45309" stroke-width="4"/>
  <g id="ca-min-pips">${minPips.join('')}</g>
  <g id="ca-markers">${markers.join('')}</g>
  <line id="ca-min-hand" x1="150" y1="150" x2="150" y2="45"
        stroke="#7c3aed" stroke-width="5" stroke-linecap="round"
        style="transform-origin: 150px 150px; transition: transform 0.6s ease, opacity 0.35s ease;"/>
  <line id="ca-hour-hand" x1="150" y1="150" x2="150" y2="80"
        stroke="#1e293b" stroke-width="9" stroke-linecap="round"
        style="transform-origin: 150px 150px; transition: transform 0.6s ease, opacity 0.35s ease;"/>
  <circle cx="150" cy="150" r="9" fill="#1e293b"/>
  <circle cx="150" cy="150" r="3" fill="#fbbf24"/>
</svg>`;
  }

  function svgEl(id) { return document.getElementById(id); }
  function handEl(which) { return svgEl(which === 'hour' ? 'ca-hour-hand' : 'ca-min-hand'); }

  function setHand(which, angleDeg, animate) {
    const el = handEl(which);
    if (!el) return;
    el.style.transition = animate
      ? 'transform 0.6s ease, opacity 0.35s ease'
      : 'opacity 0.35s ease';
    el.style.transform = `rotate(${angleDeg}deg)`;
  }
  function showHand(which, show) {
    const el = handEl(which);
    if (!el) return;
    el.style.opacity = show ? '1' : '0';
  }
  function dimHand(which, dim) {
    const el = handEl(which);
    if (!el) return;
    el.style.opacity = dim ? '0.15' : '1';
  }
  function pulseHand(which, on) {
    const el = handEl(which);
    if (!el) return;
    el.classList.toggle('ca-pulse', !!on);
  }
  function highlightNum(n, on) {
    document.querySelectorAll('#ca-markers .ca-num').forEach((t) => {
      if (parseInt(t.getAttribute('data-num'), 10) === n) {
        t.style.fill = on ? '#dc2626' : '#1e293b';
        t.setAttribute('font-size', on ? '30' : '24');
      }
    });
  }
  function clearHighlights() {
    document.querySelectorAll('#ca-markers .ca-num').forEach((t) => {
      t.style.fill = '#1e293b'; t.setAttribute('font-size', '24');
    });
  }

  // =======================================================================
  // OVERLAY
  // =======================================================================
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
          padding: 20px; gap: 14px; overflow: hidden;
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
          font-variant-numeric: tabular-nums; font-weight: 600; color: #6d28d9; min-width: 90px; text-align: right;
        }
        #clock-activity-overlay .ca-skip {
          background: rgba(255,255,255,0.78); border: 1px solid rgba(91,33,182,0.22); border-radius: 12px;
          padding: 6px 12px; color: #1e293b; font-size: 13px; cursor: pointer;
        }
        #clock-activity-overlay .ca-stage {
          flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
          gap: 14px; width: 100%; max-width: 880px;
        }
        #clock-activity-overlay .ca-clock { width: 300px; height: 300px; max-width: 56vh; max-height: 56vh; }
        #clock-activity-overlay #ca-svg .ca-pulse { animation: ca-hand-pulse 1.1s ease-in-out infinite; }
        @keyframes ca-hand-pulse { 0%,100% { stroke-width: 5; } 50% { stroke-width: 13; } }
        #clock-activity-overlay .ca-say {
          font-size: 21px; font-weight: 700; color: #1e293b; text-align: center; margin: 0;
          min-height: 56px; line-height: 1.3; max-width: 680px;
        }
        #clock-activity-overlay .ca-options {
          display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;
          width: 100%; max-width: 660px;
        }
        #clock-activity-overlay .ca-opt {
          background: rgba(255,255,255,0.9); border: 2px solid rgba(91,33,182,0.22); border-radius: 14px;
          padding: 16px 18px; font-size: 19px; font-weight: 700; color: #1e293b; cursor: pointer;
          display: flex; align-items: center; gap: 12px; text-align: left;
          transition: transform .12s ease, box-shadow .12s ease, background .12s ease;
        }
        #clock-activity-overlay .ca-opt:not(:disabled):hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(91,33,182,0.18); background: #fff; }
        #clock-activity-overlay .ca-opt:disabled { opacity: 0.55; cursor: default; }
        #clock-activity-overlay .ca-opt.is-correct { background: #dcfce7; border-color: #16a34a; }
        #clock-activity-overlay .ca-opt.is-wrong { background: #fee2e2; border-color: #dc2626; }
        #clock-activity-overlay .ca-opt.ca-opt-reading {
          background: #fef3c7; border-color: #d97706;
          box-shadow: 0 0 0 3px rgba(217,119,6,0.25); transform: translateY(-1px);
        }
        #clock-activity-overlay .ca-opt .letter {
          display: inline-flex; align-items: center; justify-content: center;
          width: 30px; height: 30px; border-radius: 8px; background: rgba(124,58,237,0.12);
          color: #6d28d9; font-weight: 800; font-size: 15px; flex: 0 0 auto;
        }
        #clock-activity-overlay .ca-next {
          background: linear-gradient(180deg, #7c3aed, #6d28d9); color: #fff; border: none;
          border-radius: 14px; padding: 14px 32px; font-size: 18px; font-weight: 800; cursor: pointer;
          box-shadow: 0 4px 14px rgba(109,40,217,0.35); transition: transform .12s ease;
        }
        #clock-activity-overlay .ca-next:hover { transform: translateY(-1px); }
        #clock-activity-overlay .ca-feedback { min-height: 22px; font-size: 16px; font-weight: 700; color: #6d28d9; }
        #clock-activity-overlay .ca-hand-key { display: flex; gap: 18px; font-size: 13px; color: #475569; font-weight: 600; flex-wrap: wrap; justify-content: center; }
        #clock-activity-overlay .ca-hand-key span { display: inline-flex; align-items: center; gap: 6px; }
        #clock-activity-overlay .ca-swatch { width: 22px; height: 5px; border-radius: 3px; display: inline-block; }
      </style>
      <div class="ca-header">
        <div class="ca-title">🕒 Learning the Clock <span class="badge" id="ca-stage-badge">Lesson</span></div>
        <div class="ca-progress" id="ca-progress"></div>
        <button class="ca-skip" id="ca-skip-btn">Skip</button>
      </div>
      <div class="ca-stage">
        <div class="ca-clock" id="ca-clock"></div>
        <div class="ca-hand-key" id="ca-hand-key">
          <span><i class="ca-swatch" style="background:#1e293b;height:8px;"></i> short hand = hour</span>
          <span><i class="ca-swatch" style="background:#7c3aed;"></i> long hand = minutes</span>
        </div>
        <p class="ca-say" id="ca-say"></p>
        <div class="ca-options" id="ca-options"></div>
        <button class="ca-next" id="ca-next" style="display:none;">Next →</button>
        <div class="ca-feedback" id="ca-feedback"></div>
      </div>
    `;
    document.body.appendChild(el);
    return el;
  }

  function waitForNext(overlay, label) {
    return new Promise((resolve) => {
      const btn = overlay.querySelector('#ca-next');
      btn.textContent = label || 'Next →';
      btn.style.display = '';
      btn.disabled = false;
      const handler = () => { btn.style.display = 'none'; btn.removeEventListener('click', handler); resolve(); };
      btn.addEventListener('click', handler);
    });
  }

  // v187: read each option aloud (with letter + highlight) BEFORE enabling
  // taps — same pattern as the MC quiz's readQuestionWithHighlights. The kid
  // is a non-reader, so silent options were useless to him. Buttons stay
  // disabled while Ms. Humphrey reads; a generation token (RUN_GEN) cancels
  // an in-flight read if the kid hits Skip or the lesson tears down.
  function askMC(overlay, opts) {
    return new Promise((resolve) => {
      const wrap = overlay.querySelector('#ca-options');
      const fb = overlay.querySelector('#ca-feedback');
      fb.textContent = '';
      wrap.innerHTML = '';
      const myGen = RUN_GEN;

      const buttons = opts.choices.map((c, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ca-opt';
        btn.disabled = true; // locked until she finishes reading
        btn.innerHTML = `<span class="letter">${letterFor(i)}</span><span class="text">${c}</span>`;
        btn.addEventListener('click', async () => {
          if (btn.disabled) return;
          const isRight = i === opts.correctIndex;
          if (isRight) {
            buttons.forEach((b) => { b.disabled = true; });
            btn.classList.add('is-correct');
            fb.textContent = '✓ ' + (opts.rightWord || 'Yes!');
            if (opts.onRight) { try { await opts.onRight(); } catch (_) {} }
            await tts(opts.rightSay || "That's right!");
            await pause(250);
            wrap.innerHTML = '';
            fb.textContent = '';
            resolve();
          } else {
            btn.classList.add('is-wrong');
            btn.disabled = true;
            fb.textContent = opts.wrongWord || 'Try again';
            if (opts.onWrong) { try { await opts.onWrong(); } catch (_) {} }
            await tts(opts.wrongSay || 'Not quite — try the other one.');
          }
        });
        wrap.appendChild(btn);
        return btn;
      });

      // Read the options aloud, highlighting each as she says it, then unlock.
      (async () => {
        try {
          await pause(300); // small beat after the question
          for (let i = 0; i < opts.choices.length; i++) {
            if (myGen !== RUN_GEN) return; // Skip pressed / torn down
            buttons[i].classList.add('ca-opt-reading');
            try {
              await tts(`${letterFor(i)}. ${opts.choices[i]}.`);
            } finally {
              buttons[i].classList.remove('ca-opt-reading');
            }
            if (myGen !== RUN_GEN) return;
            await pause(220);
          }
        } catch (e) {
          console.warn('[clock-activity] option read error', e);
        }
        if (myGen !== RUN_GEN) return;
        buttons.forEach((b) => { b.disabled = false; });
      })();
    });
  }

  async function say(overlay, text, opts) {
    overlay.querySelector('#ca-say').textContent = text;
    if (!opts || opts.speak !== false) await tts(text);
  }

  function setBadge(overlay, text) {
    const b = overlay.querySelector('#ca-stage-badge');
    if (b) b.textContent = text;
  }

  // ---- choice helpers ----------------------------------------------------
  function shuffleWithCorrect(list, correct) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return { list: arr, idx: arr.indexOf(correct) };
  }
  function mcForVal(correct, vals) {
    const labels = vals.map((v) => `${v} minutes`);
    const s = shuffleWithCorrect(labels, `${correct} minutes`);
    return { choices: s.list, correctIndex: s.idx };
  }

  // =======================================================================
  // STAGE DEFINITIONS — guided teaching
  // =======================================================================

  // Stage 1 — meet the two hands.
  async function stageMeetHands(overlay) {
    setBadge(overlay, 'Stage 1 · The Hands');
    showHand('hour', true); showHand('min', true);
    setHand('hour', hourAngle(3, 0), false);
    setHand('min', minAngle(0), false);
    await pause(200);

    await say(overlay, 'A clock has two hands. Let me show you each one.');
    await pause(300);

    dimHand('min', true); pulseHand('hour', true);
    await say(overlay, 'This SHORT, fat hand is the HOUR hand. It tells us the hour.');
    pulseHand('hour', false);
    await pause(200);

    dimHand('min', false); dimHand('hour', true); pulseHand('min', true);
    await say(overlay, 'This LONG, skinny hand is the MINUTE hand. It tells us the minutes.');
    pulseHand('min', false); dimHand('hour', false);
    await pause(200);

    await say(overlay, 'Quick check! Which hand tells us the HOUR?');
    await askMC(overlay, {
      choices: ['The short, fat hand', 'The long, skinny hand'],
      correctIndex: 0,
      rightWord: 'Yes!', rightSay: 'Yes! The short fat hand is the hour hand.',
      wrongWord: 'The hour hand is the SHORT one', wrongSay: 'Remember, the short fat hand is the hour hand. Try again.',
      onRight: async () => { pulseHand('hour', true); setTimeout(() => pulseHand('hour', false), 1200); },
    });

    await say(overlay, 'And which hand tells us the MINUTES?');
    await askMC(overlay, {
      choices: ['The short, fat hand', 'The long, skinny hand'],
      correctIndex: 1,
      rightWord: 'You got it!', rightSay: 'You got it! The long skinny hand is the minute hand.',
      wrongWord: 'The minute hand is the LONG one', wrongSay: 'The long skinny hand is the minute hand. Try again.',
      onRight: async () => { pulseHand('min', true); setTimeout(() => pulseHand('min', false), 1200); },
    });

    logEvent('clock_lesson_stage', { stage: 1, name: 'meet_hands' });
  }

  // Stage 2 — hour hand alone.
  async function stageHourHand(overlay) {
    setBadge(overlay, 'Stage 2 · The Hour');
    showHand('min', false);
    showHand('hour', true); dimHand('hour', false);
    await say(overlay, "Let's hide the minute hand for now. Just the hour hand.");
    await pause(300);

    setHand('hour', hourAngle(3, 0), true);
    await pause(650);
    highlightNum(3, true);
    await say(overlay, 'The hour hand points right at the 3. That means 3 o\'clock!');
    highlightNum(3, false);
    await pause(200);

    setHand('hour', hourAngle(8, 0), true);
    await pause(650);
    highlightNum(8, true);
    await say(overlay, "Now it points at the 8. That's 8 o'clock.");
    highlightNum(8, false);

    await hourCheck(overlay, 6);
    await hourCheck(overlay, 10);

    logEvent('clock_lesson_stage', { stage: 2, name: 'hour_hand' });
  }

  async function hourCheck(overlay, h) {
    setHand('hour', hourAngle(h, 0), true);
    await pause(650);
    await say(overlay, 'What hour is the hand pointing at?');
    const correct = `${h} o'clock`;
    const d1 = `${(h % 12) + 1} o'clock`;
    const d2 = `${((h + 10) % 12) + 1} o'clock`;
    const s = shuffleWithCorrect([correct, d1, d2], correct);
    await askMC(overlay, {
      choices: s.list, correctIndex: s.idx,
      rightWord: 'Nice!', rightSay: `Yes! ${h} o'clock.`,
      wrongWord: 'Look at the number it points to', wrongSay: 'Look where the hour hand points, and read that number. Try again.',
      onRight: async () => { highlightNum(h, true); setTimeout(() => highlightNum(h, false), 1200); },
    });
  }

  // Stage 3 — minute hand alone + counting by 5s.
  async function stageMinuteHand(overlay) {
    setBadge(overlay, 'Stage 3 · The Minutes');
    showHand('hour', false);
    showHand('min', true); dimHand('min', false);
    setHand('min', minAngle(0), false);
    await say(overlay, "Now let's hide the hour hand. Just the minute hand.");
    await pause(300);

    await say(overlay, 'The minute hand counts by fives. Watch — count with me!');
    await pause(300);

    const counts = [{ num: 1, val: 5 }, { num: 2, val: 10 }, { num: 3, val: 15 }];
    for (const c of counts) {
      setHand('min', minAngle(c.val), true);
      await pause(650);
      highlightNum(c.num, true);
      await say(overlay, `${c.val}!`);
      highlightNum(c.num, false);
      await pause(150);
    }
    await say(overlay, 'See? Each number is 5 more minutes. The 3 means 15 minutes.');
    await pause(200);

    setHand('min', minAngle(10), true);
    await pause(650);
    await say(overlay, 'The minute hand points at the 2. How many minutes is that?');
    const mc = mcForVal(10, [10, 5, 20]);
    await askMC(overlay, {
      choices: mc.choices, correctIndex: mc.correctIndex,
      rightWord: 'Yes!', rightSay: 'Yes! The 2 means 10 minutes. Count by fives: 5, 10.',
      wrongWord: 'Count by fives', wrongSay: 'Count by fives: 5 for the 1, 10 for the 2. Try again.',
    });

    logEvent('clock_lesson_stage', { stage: 3, name: 'minute_hand' });
  }

  // Stage 4 — o'clock (both hands, minute on 12).
  async function stageOClock(overlay) {
    setBadge(overlay, "Stage 4 · O'clock");
    showHand('hour', true); showHand('min', true);
    dimHand('hour', false); dimHand('min', false);
    setHand('min', minAngle(0), true);
    setHand('hour', hourAngle(5, 0), true);
    await pause(650);
    await say(overlay, 'Both hands now! When the LONG hand points at 12, we just read the hour.');
    await pause(300);
    highlightNum(12, true);
    await say(overlay, "The long hand is on 12, and the short hand is on the 5. That's 5 o'clock!");
    highlightNum(12, false);

    await oClockCheck(overlay, 2);
    await oClockCheck(overlay, 9);

    logEvent('clock_lesson_stage', { stage: 4, name: 'oclock' });
  }

  async function oClockCheck(overlay, h) {
    setHand('min', minAngle(0), true);
    setHand('hour', hourAngle(h, 0), true);
    await pause(650);
    await say(overlay, 'The long hand is on 12. What time is it?');
    const correct = `${h} o'clock`;
    const s = shuffleWithCorrect([correct, `${(h % 12) + 1} o'clock`, `half past ${h}`], correct);
    await askMC(overlay, {
      choices: s.list, correctIndex: s.idx,
      rightWord: 'Great!', rightSay: `Yes! ${h} o'clock.`,
      wrongWord: "Long hand on 12 = o'clock", wrongSay: 'When the long hand is on 12, just read the short hand. Try again.',
      onRight: async () => { highlightNum(h, true); setTimeout(() => highlightNum(h, false), 1200); },
    });
  }

  // Stage 5 — half past (minute on 6).
  async function stageHalfPast(overlay) {
    setBadge(overlay, 'Stage 5 · Half Past');
    showHand('hour', true); showHand('min', true);
    dimHand('hour', false); dimHand('min', false);
    setHand('min', minAngle(0), false);
    setHand('hour', hourAngle(4, 0), false);
    await pause(200);
    await say(overlay, "When the long hand goes halfway around to the 6, that's HALF PAST.");
    await pause(300);
    setHand('min', minAngle(30), true);
    await pause(650);
    highlightNum(6, true);
    await say(overlay, "The long hand swept all the way to the 6. That's 30 minutes — half past.");
    highlightNum(6, false);
    setHand('hour', hourAngle(4, 30), true);
    await pause(650);
    await say(overlay, 'The short hand is just past the 4, so this is half past 4.');
    await pause(200);

    await halfPastCheck(overlay, 2);
    await halfPastCheck(overlay, 7);

    logEvent('clock_lesson_stage', { stage: 5, name: 'half_past' });
  }

  async function halfPastCheck(overlay, h) {
    setHand('min', minAngle(30), true);
    setHand('hour', hourAngle(h, 30), true);
    await pause(650);
    await say(overlay, 'The long hand is on the 6. What time is it?');
    const correct = `half past ${h}`;
    const s = shuffleWithCorrect([correct, `${h} o'clock`, `half past ${(h % 12) + 1}`], correct);
    await askMC(overlay, {
      choices: s.list, correctIndex: s.idx,
      rightWord: 'Perfect!', rightSay: `Yes! Half past ${h}.`,
      wrongWord: 'Long hand on 6 = half past', wrongSay: "When the long hand is on the 6, it's half past. Try again.",
      onRight: async () => { highlightNum(6, true); setTimeout(() => highlightNum(6, false), 1200); },
    });
  }

  // =======================================================================
  // TEACHING RUNNER
  // =======================================================================
  async function runLesson(opts) {
    const dateStr = (opts && opts.date) || todayStr();
    const onComplete = (opts && typeof opts.onComplete === 'function') ? opts.onComplete : function () {};

    const overlay = ensureOverlay();
    overlay.querySelector('#ca-hand-key').style.display = 'flex';
    overlay.querySelector('#ca-clock').innerHTML = buildClockMarkup();
    overlay.style.display = 'flex';

    const myGen = ++RUN_GEN; // v187: new run; cancels any prior in-flight reads

    let finished = false;
    const close = (reason) => {
      if (finished) return;
      finished = true;
      RUN_GEN++; // v187: stop any in-flight option reads
      overlay.style.display = 'none';
      try { onComplete({ reason: reason || 'done', mode: 'lesson' }); } catch (_) {}
    };
    overlay.querySelector('#ca-skip-btn').onclick = () => {
      logEvent('clock_lesson_skip', {});
      close('skipped');
    };

    const stages = [stageMeetHands, stageHourHand, stageMinuteHand, stageOClock, stageHalfPast];
    logEvent('clock_lesson_start', { date: dateStr, stages: stages.length });

    try {
      await tts("Today we are going to learn how to read a clock. Let's start!");
      for (let i = 0; i < stages.length; i++) {
        if (finished) return;
        overlay.querySelector('#ca-progress').textContent = `Stage ${i + 1} / ${stages.length}`;
        clearHighlights();
        await stages[i](overlay);
        if (finished) return;
        if (i < stages.length - 1) {
          await say(overlay, "Great job! Let's keep going.");
          await waitForNext(overlay, 'Keep going →');
        }
      }
      overlay.querySelector('#ca-options').innerHTML = '';
      await say(overlay, "You did it! You're learning to read the clock. Time for a break!");
      logEvent('clock_lesson_complete', { date: dateStr });
      await pause(400);
      close('completed');
    } catch (e) {
      console.warn('[clock-activity] lesson error', e);
      close('error');
    }
  }

  // =======================================================================
  // LEGACY PRACTICE QUIZ (post-graduation) — preserved from v180
  // =======================================================================
  const QUIZ_QUESTIONS = 5;
  const TIME_POOL = [
    { h: 3, m: 0 }, { h: 7, m: 30 }, { h: 9, m: 15 }, { h: 4, m: 45 },
    { h: 12, m: 0 }, { h: 1, m: 30 }, { h: 6, m: 15 }, { h: 10, m: 45 },
    { h: 2, m: 5 }, { h: 8, m: 35 }, { h: 5, m: 20 }, { h: 11, m: 50 },
  ];
  function describeTime(h, m) {
    if (m === 0) return `${h} o'clock`;
    if (m === 15) return `Quarter past ${h}`;
    if (m === 30) return `Half past ${h}`;
    if (m === 45) return `Quarter to ${h % 12 + 1}`;
    return `${h} ${String(m).padStart(2, '0')}`;
  }
  function quizSeed(dateStr) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
    if (!m) return Date.now() % 1000;
    return parseInt(m[1], 10) * 372 + parseInt(m[2], 10) * 31 + parseInt(m[3], 10);
  }
  function quizQuestions(dateStr) {
    const seed = quizSeed(dateStr);
    const used = new Set(); const out = [];
    for (let i = 0; i < QUIZ_QUESTIONS; i++) {
      let idx = (seed + i * 5) % TIME_POOL.length, tries = 0;
      while (used.has(idx) && tries < TIME_POOL.length) { idx = (idx + 1) % TIME_POOL.length; tries++; }
      used.add(idx);
      const t = TIME_POOL[idx];
      out.push(quizBuild(t.h, t.m, i + seed));
    }
    return out;
  }
  function quizBuild(h, m, salt) {
    const correct = describeTime(h, m);
    const cand = [
      describeTime(h, (m + 15) % 60),
      describeTime(((h % 12) + 1), m),
      describeTime(((h + 10) % 12) + 1, m),
      describeTime(h, m === 0 ? 30 : 0),
    ].filter((s) => s !== correct);
    const seen = new Set([correct]); const distractors = [];
    for (const c of cand) { if (!seen.has(c)) { seen.add(c); distractors.push(c); } if (distractors.length >= 3) break; }
    while (distractors.length < 3) distractors.push(describeTime((h + distractors.length + 2) % 12 || 12, m));
    const correctIdx = ((salt * 7) % 4 + 4) % 4;
    const options = distractors.slice(0, 3); options.splice(correctIdx, 0, correct);
    return { hour: h, minute: m, question: 'What time does this clock show?', options: options.slice(0, 4), correct_index: correctIdx, explanation: `This clock shows ${formatTime(h, m)} — ${correct.toLowerCase()}.` };
  }

  async function runQuiz(opts) {
    const dateStr = (opts && opts.date) || todayStr();
    const onComplete = (opts && typeof opts.onComplete === 'function') ? opts.onComplete : function () {};
    const overlay = ensureOverlay();
    overlay.querySelector('#ca-clock').innerHTML = buildClockMarkup();
    setBadge(overlay, 'Clock Practice');
    overlay.querySelector('#ca-hand-key').style.display = 'none';
    overlay.style.display = 'flex';

    const questions = quizQuestions(dateStr);
    let idx = 0, finished = false;
    const myGen = ++RUN_GEN; // v187
    const close = (reason) => { if (finished) return; finished = true; RUN_GEN++; overlay.style.display = 'none'; try { onComplete({ reason: reason || 'done', answered: idx, mode: 'quiz' }); } catch (_) {} };
    overlay.querySelector('#ca-skip-btn').onclick = () => { logEvent('clock_activity_skip', { answered: idx }); close('skipped'); };

    const renderQ = async () => {
      if (idx >= questions.length) {
        logEvent('clock_activity_complete', { answered: idx });
        await tts('Great work on the clock! Time to take a break.');
        close('completed'); return;
      }
      const q = questions[idx];
      overlay.querySelector('#ca-progress').textContent = `${idx} / ${questions.length}`;
      setHand('hour', hourAngle(q.hour, q.minute), false);
      setHand('min', minAngle(q.minute), false);
      showHand('hour', true); showHand('min', true); dimHand('hour', false); dimHand('min', false);
      await say(overlay, q.question);
      const wrap = overlay.querySelector('#ca-options'); wrap.innerHTML = '';
      const buttons = q.options.map((opt, i) => {
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'ca-opt'; btn.disabled = true;
        btn.innerHTML = `<span class="letter">${letterFor(i)}</span><span class="text">${opt}</span>`;
        btn.addEventListener('click', () => onPick(i, btn, q)); wrap.appendChild(btn); return btn;
      });
      const gen = ++renderQ._gen || (renderQ._gen = 1);
      try {
        await pause(250);
        for (let i = 0; i < q.options.length; i++) { if (gen !== renderQ._gen) return; await tts(`${letterFor(i)}. ${q.options[i]}.`); await pause(200); }
      } catch (_) {}
      buttons.forEach((b) => { b.disabled = false; });
    };
    const onPick = async (i, btn, q) => {
      if (btn.disabled) return;
      const buttons = overlay.querySelectorAll('.ca-opt'); buttons.forEach((b) => { b.disabled = true; });
      if (i === q.correct_index) {
        btn.classList.add('is-correct'); overlay.querySelector('#ca-feedback').textContent = '✓ Nice!';
        logEvent('clock_activity_answer', { idx, correct: true, time: `${q.hour}:${q.minute}` });
        await tts(q.explanation); await pause(300); idx++; renderQ();
      } else {
        btn.classList.add('is-wrong'); overlay.querySelector('#ca-feedback').textContent = 'Not quite — try again.';
        logEvent('clock_activity_answer', { idx, correct: false, time: `${q.hour}:${q.minute}` });
        await tts('Not quite. Look at the short hand for the hour and the long hand for the minutes.');
        buttons.forEach((b, j) => { if (j !== i) b.disabled = false; });
      }
    };
    logEvent('clock_activity_start', { count: questions.length, mode: 'quiz' });
    renderQ();
  }

  // =======================================================================
  // ENTRY POINT — pick teaching vs quiz by date window.
  // =======================================================================
  function start(opts) {
    const dateStr = (opts && opts.date) || todayStr();
    if (inTeachingWindow(dateStr)) {
      logEvent('clock_activity_mode', { mode: 'lesson', date: dateStr });
      return runLesson(opts);
    }
    logEvent('clock_activity_mode', { mode: 'quiz', date: dateStr });
    return runQuiz(opts);
  }

  NS.ClockActivity = { start, runLesson, runQuiz, inTeachingWindow };
  try { console.log('[clock-activity] v186 loaded (teaching mode through ' + FIRST_DAY + ' +14d)'); } catch (_) {}
})();
