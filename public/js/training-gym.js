/**
 * Hero Academy — Training Gym (v189)
 *
 * 2-minute movement break: 4 exercises drawn from a pool of 8, mixing
 * timer-based holds (jumping jacks, marching) and rep-based moves (push-ups,
 * toe touches). Ms. Humphrey calls cadence between each exercise; Ralphie's
 * flexing portrait would feel right but the page intentionally stays
 * lightweight — kids on a Galaxy Tab don't need a Phaser scene just to
 * do jumping jacks.
 *
 * Counts toward the daily mission via the same pattern as other zones:
 *   localStorage  ha_zone_done_<YYYY-MM-DD> += { gym: true }
 *   NS.TodayMission.markVisited('gym')      (when available)
 *   NS.Telemetry.recordZoneComplete('gym')  (when available)
 */
(function () {
  'use strict';

  var NS = (window.HeroAcademy = window.HeroAcademy || {});

  // -------------------------------------------------------------------------
  // Exercise pool — 8 moves, 4 picked per session.
  //   mode === 'timer' → big visual countdown, auto-advances at 0
  //   mode === 'rep'   → big counter, kid taps once per rep
  // -------------------------------------------------------------------------
  var POOL = [
    { key: 'jumping_jacks', name: 'Jumping Jacks',     emoji: '🤸', mode: 'timer', duration: 30, cue: "Arms up, arms down, jump with your feet!" },
    { key: 'marching',      name: 'March in Place',    emoji: '🚶', mode: 'timer', duration: 30, cue: "Lift those knees high — left, right, left, right!" },
    { key: 'arm_circles',   name: 'Arm Circles',       emoji: '🙆', mode: 'timer', duration: 20, cue: "Big circles with your arms, forward then backward." },
    { key: 'high_knees',    name: 'High Knees',        emoji: '🏃', mode: 'timer', duration: 25, cue: "Knees up to your belly — go, go, go!" },
    { key: 'squat_hold',    name: 'Squat Hold',        emoji: '🦵', mode: 'timer', duration: 15, cue: "Sit like there's a chair behind you. Hold it strong!" },
    { key: 'wall_pushups',  name: 'Wall Push-ups',     emoji: '🧱', mode: 'rep',   reps: 8,      cue: "Hands on the wall, lean in, push back out. Tap for each one!" },
    { key: 'toe_touches',   name: 'Toe Touches',       emoji: '👇', mode: 'rep',   reps: 10,     cue: "Reach down for your toes, then stand up tall. Tap for each one!" },
    { key: 'star_jumps',    name: 'Star Jumps',        emoji: '⭐', mode: 'rep',   reps: 8,      cue: "Make yourself into a star when you jump! Tap for each one." },
  ];

  function pickFour() {
    // Shuffle copy of POOL and take the first 4. Always lead with a timer move
    // so the kid gets warmed up before counting reps.
    var arr = POOL.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    // Ensure first exercise is a timer move (warm-up)
    var firstTimerIdx = arr.findIndex(function (e) { return e.mode === 'timer'; });
    if (firstTimerIdx > 0) {
      var swap = arr[0]; arr[0] = arr[firstTimerIdx]; arr[firstTimerIdx] = swap;
    }
    return arr.slice(0, 4);
  }

  // -------------------------------------------------------------------------
  // DOM
  // -------------------------------------------------------------------------
  function $(id) { return document.getElementById(id); }

  var dom = {
    hero: null, exercise: null, complete: null,
    startBtn: null, counter: null,
    exerciseNum: null, exerciseName: null, exerciseEmoji: null,
    timerMode: null, timerNum: null, timerCircle: null,
    repMode: null, repCount: null, repGoal: null, repBtn: null,
    dots: null, completeSub: null,
  };

  function cacheDom() {
    dom.hero         = $('tgHero');
    dom.exercise     = $('tgExercise');
    dom.complete     = $('tgComplete');
    dom.startBtn     = $('tgStartBtn');
    dom.counter      = $('tgCounter');
    dom.exerciseNum  = $('tgExerciseNum');
    dom.exerciseName = $('tgExerciseName');
    dom.exerciseEmoji= $('tgExerciseEmoji');
    dom.timerMode    = $('tgTimerMode');
    dom.timerNum     = $('tgTimerNum');
    dom.timerCircle  = $('tgTimerCircle');
    dom.repMode      = $('tgRepMode');
    dom.repCount     = $('tgRepCount');
    dom.repGoal      = $('tgRepGoal');
    dom.repBtn       = $('tgRepBtn');
    dom.dots         = $('tgDots');
    dom.completeSub  = $('tgCompleteSub');
  }

  // -------------------------------------------------------------------------
  // Session state
  // -------------------------------------------------------------------------
  var session = {
    queue: [],
    index: 0,
    timerHandle: null,
    timerRemaining: 0,
    repCurrent: 0,
    repTarget: 0,
  };

  // -------------------------------------------------------------------------
  // Humphrey helper
  // -------------------------------------------------------------------------
  function H() {
    return (NS.Humphrey && typeof NS.Humphrey.say === 'function') ? NS.Humphrey : null;
  }
  function say(text, expression) {
    var h = H();
    if (!h) return Promise.resolve();
    try {
      return h.say('gym-cadence', { kidName: 'Nigel', text: text, expression: expression || 'encouraging' }) || Promise.resolve();
    } catch (e) { return Promise.resolve(); }
  }

  // -------------------------------------------------------------------------
  // Flow
  // -------------------------------------------------------------------------
  function boot() {
    cacheDom();
    if (!dom.startBtn) return;
    dom.startBtn.addEventListener('click', startSession);
    dom.repBtn.addEventListener('click', tickRep);
  }

  function startSession() {
    session.queue = pickFour();
    session.index = 0;
    renderDots();
    dom.hero.hidden = true;
    dom.exercise.hidden = false;
    dom.counter.hidden = false;
    say("Time to move your body, Nigel! Let's start with " + session.queue[0].name.toLowerCase() + ". " + session.queue[0].cue, 'cheering');
    showExercise(0);
  }

  function renderDots() {
    if (!dom.dots) return;
    dom.dots.innerHTML = '';
    for (var i = 0; i < session.queue.length; i++) {
      var d = document.createElement('div');
      d.className = 'tg-dot';
      if (i < session.index) d.classList.add('done');
      else if (i === session.index) d.classList.add('active');
      dom.dots.appendChild(d);
    }
  }

  function showExercise(idx) {
    var ex = session.queue[idx];
    if (!ex) { showCompletion(); return; }
    session.index = idx;
    dom.exerciseNum.textContent  = 'EXERCISE ' + (idx + 1) + ' OF ' + session.queue.length;
    dom.exerciseName.textContent = ex.name;
    dom.exerciseEmoji.textContent= ex.emoji;
    dom.counter.textContent      = (idx + 1) + ' / ' + session.queue.length;
    renderDots();

    if (ex.mode === 'timer') {
      dom.timerMode.hidden = false;
      dom.repMode.hidden   = true;
      startTimer(ex.duration);
    } else {
      dom.timerMode.hidden = true;
      dom.repMode.hidden   = false;
      session.repCurrent = 0;
      session.repTarget  = ex.reps;
      dom.repCount.textContent = '0';
      dom.repGoal.textContent  = 'of ' + ex.reps;
      dom.repBtn.disabled = false;
    }
  }

  // ----- timer mode --------------------------------------------------------
  function startTimer(seconds) {
    // Circle circumference for r=86 is 2*PI*86 ≈ 540.35
    var CIRC = 540.4;
    session.timerRemaining = seconds;
    dom.timerNum.textContent = seconds;
    dom.timerCircle.style.strokeDasharray = CIRC;
    dom.timerCircle.style.strokeDashoffset = 0;
    // After one rAF, set the offset so the transition runs over `seconds`
    requestAnimationFrame(function () {
      dom.timerCircle.style.transition = 'stroke-dashoffset ' + seconds + 's linear';
      dom.timerCircle.style.strokeDashoffset = CIRC;
    });
    clearInterval(session.timerHandle);
    session.timerHandle = setInterval(function () {
      session.timerRemaining -= 1;
      dom.timerNum.textContent = Math.max(0, session.timerRemaining);
      if (session.timerRemaining === 5) {
        say("Five more seconds, Nigel — you've got this!", 'cheering');
      }
      if (session.timerRemaining <= 0) {
        clearInterval(session.timerHandle);
        session.timerHandle = null;
        advance();
      }
    }, 1000);
  }

  // ----- rep mode ----------------------------------------------------------
  function tickRep() {
    session.repCurrent += 1;
    dom.repCount.textContent = session.repCurrent;
    if (session.repCurrent === Math.ceil(session.repTarget / 2)) {
      say("Halfway there, Nigel! Keep going.", 'encouraging');
    }
    if (session.repCurrent >= session.repTarget) {
      dom.repBtn.disabled = true;
      setTimeout(advance, 600);
    }
  }

  // ----- transitions -------------------------------------------------------
  function advance() {
    var next = session.index + 1;
    if (next >= session.queue.length) {
      showCompletion();
      return;
    }
    var nextEx = session.queue[next];
    say("Nice work! Next up: " + nextEx.name.toLowerCase() + ". " + nextEx.cue, 'cheering');
    setTimeout(function () { showExercise(next); }, 2200);
  }

  // ----- completion --------------------------------------------------------
  function showCompletion() {
    dom.exercise.hidden = true;
    dom.counter.hidden  = true;
    dom.complete.hidden = false;
    dom.completeSub.textContent = 'Four exercises down. Body strong, mind strong — that’s how heroes train.';
    say("Beautiful work, Nigel! That's a full training session done. Your body will thank you.", 'cheering');
    burstConfetti();
    markZoneDone();
  }

  function markZoneDone() {
    // 1) Cap-proof flag for Today's Mission checkmark
    try {
      var dk = 'ha_zone_done_' + new Date().toISOString().slice(0, 10);
      var df = JSON.parse(localStorage.getItem(dk) || '{}');
      df['gym'] = true;
      localStorage.setItem(dk, JSON.stringify(df));
    } catch (_) {}
    // 2) Mission API
    try {
      if (NS.TodayMission && typeof NS.TodayMission.markVisited === 'function') {
        NS.TodayMission.markVisited('gym');
      }
    } catch (_) {}
    // 3) Telemetry — zone session event so the Saturday email shows it.
    try {
      var T = NS.Telemetry;
      if (T && typeof T.rpc === 'function') {
        T.rpc('ha_record_event', {
          p_child_id: T.childId ? T.childId() : null,
          p_event_type: 'gym_session_complete',
          p_payload: {
            exercises: session.queue.map(function (e) { return e.key; }),
            completed_at: new Date().toISOString(),
          },
        }).catch(function () {});
      }
    } catch (_) {}
  }

  function burstConfetti() {
    var colors = ['#dc2626', '#ea580c', '#f59e0b', '#10b981', '#a855f7', '#3b82f6'];
    var ct = document.createElement('div');
    ct.className = 'tg-confetti';
    for (var i = 0; i < 70; i++) {
      var p = document.createElement('div');
      var sz = 6 + Math.random() * 12;
      var cl = colors[Math.floor(Math.random() * colors.length)];
      var sx = 10 + Math.random() * 80;
      var dr = (Math.random() - 0.5) * 60;
      var rt = Math.random() * 720;
      var du = 1.8 + Math.random() * 1.4;
      p.style.cssText =
        'position:absolute;left:' + sx + '%;top:-10vh;width:' + sz + 'px;height:' + sz +
        'px;background:' + cl + ';border-radius:' + (Math.random() > 0.5 ? '50%' : '3px') +
        ';animation:tg-confetti-fall ' + du + 's ' + (Math.random() * 0.4) +
        's cubic-bezier(0.2,0.7,0.3,1) forwards;--drift:' + dr + 'vw;--rot:' + rt + 'deg;';
      ct.appendChild(p);
    }
    document.body.appendChild(ct);
    setTimeout(function () { ct.remove(); }, 4000);
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  // Init Humphrey portrait with the gym welcome event
  try {
    if (NS.Humphrey && typeof NS.Humphrey.init === 'function') {
      NS.Humphrey.init({ welcomeEvent: 'welcome-gym', position: 'bottom-right' });
    }
  } catch (_) {}

  NS.TrainingGym = { _session: function () { return session; } };
})();
