/**
 * Hero Academy — Letter Lab (v102)
 *
 * Touch-friendly writing practice. Nigel writes a letter or number on the
 * canvas with his finger; Ms. Humphrey (Claude Haiku vision) looks at it and
 * gives warm, specific feedback. If he gets the first attempt wrong, she
 * offers to DEMONSTRATE the target by drawing it on her own canvas layer.
 *
 * v103: stroke-by-stroke demo animations via js/letter-strokes.js.
 *   When stroke data exists for the target (currently all 10 digits + A,B,C,D,E),
 *   Ms. Humphrey draws the letter one stroke at a time using the canvas's
 *   humphreyLayer. Multi-digit numbers animate each digit in sequence at
 *   smaller scale. Characters without stroke data fall back to the v102
 *   text-fade behavior.
 *
 * v102 changes:
 *   - Unified target pool: uppercase letters, lowercase letters, single
 *     digits, and double-digit numbers (Josh's son struggles with numbers).
 *   - Stratified picking: every session GUARANTEES 1 number + 1 letter, with
 *     a weighted 3rd slot biased toward multi-digit numbers (the hardest
 *     area). Net ~1.65 numbers + ~1.35 letters per session.
 *   - "Watch Ms. Humphrey draw it" demo flow on first wrong attempt — she
 *     renders the target letter/number on the humphreyLayer of the canvas
 *     and Nigel then gets to try again with a clean nigelLayer.
 *   - Prompt phrasing adapts to target kind (capital, lowercase, number).
 *
 * Session = 3 targets from the unified pool. After all 3 are submitted
 * (regardless of correctness), the session marks today complete via the
 * localStorage flag `ha_letter_lab_<yyyymmdd>` so the Daily Mission step
 * can render its checkmark.
 */
(function () {
  'use strict';
  var NS = window.HeroAcademy = window.HeroAcademy || {};

  // ----- Target pool ---------------------------------------------------------
  // Each target: { char, kind, label }
  // kind: 'upper' | 'lower' | 'digit' | 'multi-digit'
  // Skip ambiguous-looking shapes (O/Q, I/l, etc.) on first pass.
  var UPPER  = 'ABCDEFGHKLMNPRSTUWXYZ'.split('');
  var LOWER  = 'abcdefghkmnprstuwxyz'.split('');
  var DIGITS = '0123456789'.split('');
  var MULTI_DIGIT = ['10','12','13','15','17','20','21','25','30','37','42','50','67','75','84','91','100'];

  var TARGETS = [];
  UPPER.forEach(function (c) { TARGETS.push({ char: c, kind: 'upper',       label: 'capital '   + c }); });
  LOWER.forEach(function (c) { TARGETS.push({ char: c, kind: 'lower',       label: 'lowercase ' + c }); });
  DIGITS.forEach(function (c) { TARGETS.push({ char: c, kind: 'digit',      label: 'the number ' + c }); });
  MULTI_DIGIT.forEach(function (n) { TARGETS.push({ char: n, kind: 'multi-digit', label: 'the number ' + n }); });

  var SESSION_SIZE = 3;
  var PROMPT_PHRASES = [
    'Write {label} for me.',
    'Show me your best {label}.',
    'Let\'s practice writing {label}.',
    'Can you draw {label}?',
  ];

  var state = {
    targets:    [],
    index:      0,
    attempts:   0,
    submitting: false,
    showedDemoForCurrent: false,
    lastSpoken: '',   // v104: cached prompt sentence for the replay button
  };

  function $(sel) { return document.querySelector(sel); }
  function setHidden(el, hidden) { if (el) el.hidden = !!hidden; }

  // v105: scroll a target element into the visible viewport. On the parent
  // viewport (desktop laptop) the result card sits below the canvas and
  // below the fold — Nigel sees the reaction text but the Watch/Skip/Next
  // buttons are 400+ pixels offscreen. Auto-scroll to fix it. Smooth
  // scrolling so it doesn't jar him; block: 'center' keeps card mid-screen.
  function scrollIntoView(el) {
    if (!el || typeof el.scrollIntoView !== 'function') return;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      // Older browsers — fallback to instant scroll
      el.scrollIntoView();
    }
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function humphreySay(eventId, text, expression) {
    var H = (NS.Humphrey) || null;
    if (!H || typeof H.say !== 'function') return Promise.resolve();
    if (H.isMuted && H.isMuted()) return Promise.resolve();
    try {
      return H.say(eventId, { text: text, expression: expression || 'encouraging', priority: 'high' });
    } catch (e) { return Promise.resolve(); }
  }
  function setHumphreyExpression(expression) {
    var img = $('[data-ll-humphrey-portrait]');
    if (img) img.alt = 'Ms. Humphrey looks ' + (expression || 'happy');
  }

  // v102 (revised): stratified + weighted picking.
  //
  // Pure random was giving ~1.2 number-targets per 3-pick session, with no
  // guarantee Nigel sees any. Josh specifically called out double-digit
  // numbers as the hardest area, so we now:
  //
  //   Slot 1: GUARANTEED number  (60% multi-digit, 40% single digit)
  //   Slot 2: GUARANTEED letter  (50% upper, 50% lower)
  //   Slot 3: weighted wildcard  (40% multi-digit, 25% digit, 17.5% upper, 17.5% lower)
  //
  // Then shuffle so number isn't always position 1. Net expected mix per
  // session: ~1.65 numbers + ~1.35 letters, with multi-digit being the
  // single most-frequent kind (~1.0 per session).
  function pickTargets(n) {
    if (n !== 3) {
      // Defensive fallback for non-3 session sizes — uniform random.
      return uniformRandomPicks(n);
    }

    var picks = [];
    var used = {};   // by char to prevent dupes

    function takeFromPool(filterFn) {
      var subset = TARGETS.filter(function (t) {
        return filterFn(t) && !used[t.char + ':' + t.kind];
      });
      if (subset.length === 0) return null;
      var pick = subset[Math.floor(Math.random() * subset.length)];
      used[pick.char + ':' + pick.kind] = true;
      return pick;
    }

    // Slot 1: a number — weighted toward multi-digit (Josh's pain point).
    var slot1 = Math.random() < 0.6
      ? takeFromPool(function (t) { return t.kind === 'multi-digit'; }) ||
        takeFromPool(function (t) { return t.kind === 'digit'; })
      : takeFromPool(function (t) { return t.kind === 'digit'; }) ||
        takeFromPool(function (t) { return t.kind === 'multi-digit'; });
    if (slot1) picks.push(slot1);

    // Slot 2: a letter — 50/50 upper/lower.
    var slot2 = Math.random() < 0.5
      ? takeFromPool(function (t) { return t.kind === 'upper'; }) ||
        takeFromPool(function (t) { return t.kind === 'lower'; })
      : takeFromPool(function (t) { return t.kind === 'lower'; }) ||
        takeFromPool(function (t) { return t.kind === 'upper'; });
    if (slot2) picks.push(slot2);

    // Slot 3: weighted wildcard — 40% multi-digit, 25% digit, 17.5% each letter.
    var r = Math.random();
    var slot3Kind;
    if      (r < 0.40) slot3Kind = 'multi-digit';
    else if (r < 0.65) slot3Kind = 'digit';
    else if (r < 0.825) slot3Kind = 'upper';
    else                slot3Kind = 'lower';
    var slot3 = takeFromPool(function (t) { return t.kind === slot3Kind; });
    if (!slot3) slot3 = takeFromPool(function () { return true; });  // any unused
    if (slot3) picks.push(slot3);

    // Shuffle so the order is unpredictable (number isn't always first).
    for (var i = picks.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = picks[i]; picks[i] = picks[j]; picks[j] = tmp;
    }

    return picks;
  }

  // Fallback for unusual session sizes (not used by current flow).
  function uniformRandomPicks(n) {
    var pool = TARGETS.slice();
    var picks = [];
    for (var i = 0; i < n && pool.length > 0; i++) {
      var idx = Math.floor(Math.random() * pool.length);
      picks.push(pool.splice(idx, 1)[0]);
    }
    return picks;
  }

  function start() {
    state.targets = pickTargets(SESSION_SIZE);
    state.index = 0;
    mountCanvas();
    wireUI();
    renderCurrentTarget();
  }

  function mountCanvas() {
    var wrap = $('[data-ll-canvas-wrap]');
    if (!wrap || !NS.Canvas) return;
    NS.Canvas.mount(wrap, { showToolbar: false });
    if (NS.Canvas.setTool)  NS.Canvas.setTool('pen');
    if (NS.Canvas.setColor) NS.Canvas.setColor('#0a0b2e');
  }

  function wireUI() {
    var backBtn = $('[data-ll-back]');
    if (backBtn) backBtn.addEventListener('click', function () {
      window.location.href = 'index.html';
    });

    $('[data-ll-undo]').addEventListener('click', function () {
      if (NS.Canvas && NS.Canvas.undoNigel) NS.Canvas.undoNigel();
    });
    $('[data-ll-clear]').addEventListener('click', function () {
      if (NS.Canvas && NS.Canvas.clearNigelLayer) NS.Canvas.clearNigelLayer();
    });
    $('[data-ll-submit]').addEventListener('click', showReveal);

    // v174: self-assess buttons — Nigel is the only judge here.
    $('[data-ll-good]').addEventListener('click', function () {
      logSelfAssess(true);
      advance();
    });
    $('[data-ll-tryagain]').addEventListener('click', function () {
      logSelfAssess(false);
      retrySameTarget();
    });

    // v104: replay-prompt button (hidden target → memory practice)
    var replayBtn = $('[data-ll-replay]');
    if (replayBtn) replayBtn.addEventListener('click', replayPrompt);
  }

  function renderCurrentTarget() {
    var target = state.targets[state.index];
    if (!target) { finishSession(); return; }

    state.attempts = 0;
    state.showedDemoForCurrent = false;

    resetToDrawingPhase();

    // v104: Target is HIDDEN. Prompt text stays generic ("Listen...") and the
    // actual target name lives ONLY in the spoken sentence + state.lastSpoken.
    var phrase = PROMPT_PHRASES[Math.floor(Math.random() * PROMPT_PHRASES.length)];
    var spoken = phrase.replace('{label}', target.label);
    state.lastSpoken = spoken;

    $('[data-ll-progress]').textContent = (state.index + 1) + ' / ' + state.targets.length;

    humphreySay('letter_lab_prompt_' + target.kind + '_' + target.char, spoken, 'encouraging');

    // v105: bring the user back to the top of the page for the new target
    // (covers the case of advancing after a previous demo scroll).
    setTimeout(function () { window.scrollTo({ top: 0, behavior: 'smooth' }); }, 50);
  }

  // v104: Replay the spoken target on demand. Used by the "Say it again"
  // button when Nigel missed what Humphrey said. Falls back gracefully if
  // there's no cached sentence yet.
  function replayPrompt() {
    if (!state.lastSpoken) return;
    humphreySay('letter_lab_replay', state.lastSpoken, 'encouraging');
  }

  function resetToDrawingPhase() {
    // v174: there's no result card / spinner / vision check anymore. Just
    // toggle between the writing phase and the reveal phase.
    setHidden($('[data-ll-prompt-panel]'), false);
    setHidden($('[data-ll-action-bar]'), false);
    var reveal = $('[data-ll-reveal]');
    if (reveal) reveal.setAttribute('data-visible', '0');
    if (NS.Canvas) {
      if (NS.Canvas.clearNigelLayer) NS.Canvas.clearNigelLayer();
      if (NS.Canvas.humphreyClear)   NS.Canvas.humphreyClear();
    }
    state.submitting = false;
    $('[data-ll-submit]').disabled = false;
  }

  // v174: Trace + Reveal — replaces vision-judged submission entirely.
  //
  // OLD (v107): POST canvas to /api/humphrey/see-letter → AI vision returns
  // {correct, score, reaction} → branch on score → retry/watch/skip flow.
  //
  // NEW (v174): Capture Nigel's drawing → animate Humphrey's version on the
  // live canvas → show side-by-side reveal → Nigel SELF-ASSESSES. No vision
  // call, no AI judgment, no false negatives. The pedagogical value is in
  // the comparison + the stroke animation, not in the "right/wrong" verdict.
  function showReveal() {
    if (state.submitting) return;
    state.submitting = true;
    state.attempts += 1;
    $('[data-ll-submit]').disabled = true;

    var target = state.targets[state.index];

    // Capture Nigel's drawing as a thumbnail BEFORE we clear the canvas
    var nigelThumb;
    try {
      nigelThumb = NS.Canvas && NS.Canvas.getDataURL ? NS.Canvas.getDataURL() : null;
    } catch (e) { nigelThumb = null; }

    if (!nigelThumb) {
      // No drawing detected — bring back the writing phase with a friendly nudge
      humphreySay('letter_lab_empty',
        'Looks like you haven\'t drawn anything yet, Nigel. Tap and drag to write.', 'encouraging');
      state.submitting = false;
      $('[data-ll-submit]').disabled = false;
      return;
    }

    // Stash his thumb on the reveal panel + hide the writing UI
    $('[data-ll-img-mine]').src = nigelThumb;
    setHidden($('[data-ll-prompt-panel]'), true);
    setHidden($('[data-ll-action-bar]'), true);

    // Clear Nigel's layer so Humphrey has a clean canvas to draw on
    if (NS.Canvas && NS.Canvas.clearNigelLayer) NS.Canvas.clearNigelLayer();
    if (NS.Canvas && NS.Canvas.humphreyClear)   NS.Canvas.humphreyClear();

    humphreySay('letter_lab_reveal_intro',
      'Nice work, Nigel. Here\'s how I write ' + target.label + ':',
      'encouraging');

    var LS = NS.LetterStrokes;
    var canStroke = false;
    if (LS) {
      canStroke = target.kind === 'multi-digit'
        ? target.char.split('').every(function (c) { return LS.has(c); })
        : LS.has(target.char);
    }

    var animPromise;
    if (canStroke) {
      animPromise = target.kind === 'multi-digit'
        ? LS.animateSequence(target.char.split(''), { color: '#ec4899' })
        : LS.animate(target.char, { color: '#ec4899' });
    } else {
      animPromise = Promise.resolve().then(function () {
        fallbackTextDemo(target);
        return new Promise(function (r) { setTimeout(r, 1500); });
      });
    }

    animPromise.catch(function () {
      // Stroke animation failed — fall back to text fade
      NS.Canvas.humphreyClear();
      fallbackTextDemo(target);
    }).then(function () {
      // Animation complete — capture Humphrey's drawing as a thumbnail
      var herThumb;
      try {
        herThumb = NS.Canvas && NS.Canvas.getDataURL ? NS.Canvas.getDataURL() : null;
      } catch (e) { herThumb = null; }
      if (herThumb) $('[data-ll-img-hers]').src = herThumb;

      // Update the reveal title + button labels for context
      var isLast = state.index >= state.targets.length - 1;
      var attemptsRemaining = state.attempts < 2;
      var titleEl = $('[data-ll-reveal-title]');
      var goodBtn = $('[data-ll-good]');
      var tryBtn = $('[data-ll-tryagain]');

      if (titleEl) {
        titleEl.textContent = state.attempts === 1
          ? 'Nice work! How does yours look?'
          : 'Great practice! Ready to move on?';
      }
      if (goodBtn) {
        goodBtn.textContent = isLast ? '✓ Looks great! All done 🎉' : '✓ Looks great! Next →';
      }
      if (tryBtn) {
        // After 2 attempts, hide retry — let Nigel move on without pressure
        setHidden(tryBtn, !attemptsRemaining);
      }

      // Show the reveal panel
      var reveal = $('[data-ll-reveal]');
      if (reveal) reveal.setAttribute('data-visible', '1');
      setTimeout(function () { scrollIntoView($('[data-ll-reveal]')); }, 200);

      state.submitting = false;
      $('[data-ll-submit]').disabled = false;
      recordSelfAssessmentOpportunity(target);
    });
  }

  function fallbackTextDemo(target) {
    var fontSize = target.kind === 'multi-digit' ? 280 : 360;
    NS.Canvas.humphreyDrawText(500, 375, target.char, {
      color: '#ec4899',
      font:  'bold ' + fontSize + 'px "Fredoka", "SF Pro Rounded", system-ui, sans-serif',
      duration: 1400,
      align: 'center',
      baseline: 'middle',
    });
  }

  // v174: retry on the SAME target — clears both canvases, returns to writing
  // phase. The attempts counter persists so a 2nd retry attempt won't show
  // the retry button again.
  function retrySameTarget() {
    var reveal = $('[data-ll-reveal]');
    if (reveal) reveal.setAttribute('data-visible', '0');
    if (NS.Canvas) {
      if (NS.Canvas.clearNigelLayer) NS.Canvas.clearNigelLayer();
      if (NS.Canvas.humphreyClear)   NS.Canvas.humphreyClear();
    }
    setHidden($('[data-ll-prompt-panel]'), false);
    setHidden($('[data-ll-action-bar]'), false);
    state.submitting = false;
    $('[data-ll-submit]').disabled = false;

    var target = state.targets[state.index];
    humphreySay('letter_lab_try_again',
      'Give it another try, Nigel. You saw my version — now show me yours.',
      'encouraging');
    setTimeout(function () { window.scrollTo({ top: 0, behavior: 'smooth' }); }, 50);
  }

  function logSelfAssess(satisfied) {
    var target = state.targets[state.index];
    try {
      var T = NS.Telemetry;
      if (T && typeof T.rpc === 'function' && typeof T.childId === 'function') {
        T.rpc('ha_record_letter_practice', {
          p_child_id:      T.childId(),
          p_practice_date: todayKey(),
          p_letter:        target.char,
          p_kind:          target.kind,
          p_attempt:       state.attempts,
          p_score:         null,            // v174: no AI score
          p_correct:       satisfied,       // v174: self-assessment, not AI judgment
        }, { keepalive: true }).catch(function () {});
      }
    } catch (e) {}
  }

  // Telemetry-only — logs that Nigel reached the reveal phase for this target.
  // Distinct from logSelfAssess which fires only on his button tap.
  function recordSelfAssessmentOpportunity(target) {
    var key = 'ha_letter_lab_attempts_' + todayKey();
    var existing = [];
    try { var raw = localStorage.getItem(key); if (raw) existing = JSON.parse(raw) || []; }
    catch (e) { existing = []; }
    existing.push({
      target:  target.char,
      kind:    target.kind,
      attempt: state.attempts,
      ts:      Date.now(),
      phase:   'reveal_shown',  // v174 marker
    });
    try { localStorage.setItem(key, JSON.stringify(existing)); } catch (e) {}
  }

  function recordAttempt(target, result) {
    var key = 'ha_letter_lab_attempts_' + todayKey();
    var existing = [];
    try {
      var raw = localStorage.getItem(key);
      if (raw) existing = JSON.parse(raw) || [];
    } catch (e) { existing = []; }
    existing.push({
      target:  target.char,
      kind:    target.kind,
      attempt: state.attempts,
      ts:      Date.now(),
      score:   result && typeof result.score === 'number' ? result.score : null,
      correct: !!(result && result.correct),
      reaction:(result && result.reaction) || null,
      error:   result && result.error ? result.error : null,
    });
    try { localStorage.setItem(key, JSON.stringify(existing)); } catch (e) {}

    try {
      var T = NS.Telemetry;
      if (T && typeof T.rpc === 'function' && typeof T.childId === 'function') {
        T.rpc('ha_record_letter_practice', {
          p_child_id:      T.childId(),
          p_practice_date: todayKey(),
          p_letter:        target.char,
          p_kind:          target.kind,
          p_attempt:       state.attempts,
          p_score:         result && typeof result.score === 'number' ? result.score : null,
          p_correct:       !!(result && result.correct),
        }, { keepalive: true }).catch(function () {});
      }
    } catch (e) {}
  }

  function advance() {
    state.index += 1;
    if (state.index >= state.targets.length) finishSession();
    else                                      renderCurrentTarget();
  }

  function finishSession() {
    var doneKey = 'ha_letter_lab_' + todayKey();
    try {
      localStorage.setItem(doneKey, JSON.stringify({
        completed_at: Date.now(),
        targets:      state.targets.map(function (t) { return t.char; }),
        kinds:        state.targets.map(function (t) { return t.kind; }),
      }));
    } catch (e) {}

    // v174: simple wrap-up — hide writing phase + reveal phase, show a
    // celebratory header, then redirect home.
    setHidden($('[data-ll-prompt-panel]'), true);
    setHidden($('[data-ll-action-bar]'), true);
    var reveal = $('[data-ll-reveal]');
    if (reveal) reveal.setAttribute('data-visible', '0');

    var title = $('[data-ll-title]') || document.querySelector('.ll-title');
    if (title) title.textContent = '🎉 Beautiful work, Nigel!';

    humphreySay('letter_lab_finish',
      'You practiced ' + state.targets.length + ' things with me today, Nigel. Beautiful work!',
      'cheering');

    setTimeout(function () { window.location.href = 'index.html'; }, 3500);
  }

  NS.LetterLab = { start: start };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
