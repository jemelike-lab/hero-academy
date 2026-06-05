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
    $('[data-ll-submit]').addEventListener('click', submitDrawing);
    $('[data-ll-next]').addEventListener('click', advance);
    $('[data-ll-finish]').addEventListener('click', finishSession);
    $('[data-ll-watch]').addEventListener('click', demoCurrentTarget);
    $('[data-ll-retry]').addEventListener('click', retryCurrentTarget);
    $('[data-ll-skip]').addEventListener('click', advance);

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
  }

  // v104: Replay the spoken target on demand. Used by the "Say it again"
  // button when Nigel missed what Humphrey said. Falls back gracefully if
  // there's no cached sentence yet.
  function replayPrompt() {
    if (!state.lastSpoken) return;
    humphreySay('letter_lab_replay', state.lastSpoken, 'encouraging');
  }

  function resetToDrawingPhase() {
    setHidden($('[data-ll-result]'), true);
    setHidden($('[data-ll-spinner]'), true);
    setHidden($('[data-ll-reaction-card]'), true);
    setHidden($('[data-ll-next]'), true);
    setHidden($('[data-ll-finish]'), true);
    setHidden($('[data-ll-watch]'), true);
    setHidden($('[data-ll-retry]'), true);
    setHidden($('[data-ll-skip]'), true);
    setHidden($('[data-ll-prompt-panel]'), false);
    setHidden($('[data-ll-action-bar]'), false);
    if (NS.Canvas) {
      if (NS.Canvas.clearNigelLayer) NS.Canvas.clearNigelLayer();
      if (NS.Canvas.humphreyClear)   NS.Canvas.humphreyClear();
    }
    state.submitting = false;
    $('[data-ll-submit]').disabled = false;
  }

  function submitDrawing() {
    if (state.submitting) return;
    state.submitting = true;
    state.attempts += 1;
    $('[data-ll-submit]').disabled = true;

    var target = state.targets[state.index];
    var dataUrl;
    try {
      dataUrl = NS.Canvas && NS.Canvas.getDataURL ? NS.Canvas.getDataURL() : null;
    } catch (e) { dataUrl = null; }

    if (!dataUrl) {
      showReaction('Hmm, I couldn\u2019t see what you drew. Tap Clear and try again, Nigel!', 'concerned', false, 0);
      return;
    }

    setHidden($('[data-ll-prompt-panel]'), true);
    setHidden($('[data-ll-action-bar]'), true);
    setHidden($('[data-ll-result]'), false);
    setHidden($('[data-ll-spinner]'), false);
    setHidden($('[data-ll-reaction-card]'), true);

    fetch('/api/humphrey/see-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image:         dataUrl,
        media_type:    'image/png',
        target_letter: target.char,
        target_kind:   target.kind,
      }),
    })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (json) {
        var reaction = (json && json.reaction) ||
          'I can see you worked hard on that, Nigel \u2014 great job!';
        var correct = !!(json && json.correct);
        var score = (json && typeof json.score === 'number') ? json.score : (correct ? 4 : 2);
        showReaction(reaction, correct ? 'cheering' : 'encouraging', correct, score);
        recordAttempt(target, json);
      })
      .catch(function (err) {
        var fallback = 'I had trouble seeing your writing clearly, but I can tell you worked hard! Let\u2019s keep going.';
        showReaction(fallback, 'encouraging', false, 0);
        recordAttempt(target, { error: err && err.message || 'unknown' });
      });
  }

  function showReaction(text, expression, correct, score) {
    setHidden($('[data-ll-spinner]'), true);
    setHidden($('[data-ll-reaction-card]'), false);
    $('[data-ll-reaction]').textContent = text;
    setHumphreyExpression(expression);

    var isLast = state.index >= state.targets.length - 1;
    var struggling = !correct && score < 4 && state.attempts === 1 && !state.showedDemoForCurrent;

    if (struggling) {
      setHidden($('[data-ll-next]'),   true);
      setHidden($('[data-ll-finish]'), true);
      setHidden($('[data-ll-watch]'),  false);
      setHidden($('[data-ll-skip]'),   false);
    } else {
      setHidden($('[data-ll-watch]'),  true);
      setHidden($('[data-ll-skip]'),   true);
      setHidden($('[data-ll-next]'),   isLast);
      setHidden($('[data-ll-finish]'), !isLast);
    }

    humphreySay('letter_lab_reaction', text, expression);
  }

  function demoCurrentTarget() {
    if (!NS.Canvas || !NS.Canvas.humphreyDrawText) {
      advance();
      return;
    }
    state.showedDemoForCurrent = true;
    var target = state.targets[state.index];

    setHidden($('[data-ll-result]'), true);
    setHidden($('[data-ll-prompt-panel]'), false);
    setHidden($('[data-ll-action-bar]'), true);
    setHidden($('[data-ll-retry]'), false);

    var spoken = 'Let me show you how to write ' + target.label + '. Watch carefully.';
    humphreySay('letter_lab_demo', spoken, 'encouraging');

    // v104: clear BOTH layers at demo start. Previously we left Nigel's
    // (wrong) drawing visible underneath so he could compare side-by-side.
    // In practice it overlapped the demo, especially the bottom of letters
    // on smaller canvases — Humphrey's strokes were obscured. Now the demo
    // gets a clean canvas; the "My turn again" button still wipes it again
    // when Nigel retries.
    if (NS.Canvas.clearNigelLayer) NS.Canvas.clearNigelLayer();
    NS.Canvas.humphreyClear();

    // v103: prefer stroke-by-stroke animation when stroke data is available.
    // For multi-digit targets, every digit must have stroke data; otherwise
    // we fall back to the v102 text-fade behavior. Single chars are checked
    // against LetterStrokes.has().
    var LS = NS.LetterStrokes;
    var canStroke = false;
    if (LS) {
      if (target.kind === 'multi-digit') {
        var allDigitsCovered = target.char.split('').every(function (c) { return LS.has(c); });
        canStroke = allDigitsCovered;
      } else {
        canStroke = LS.has(target.char);
      }
    }

    setTimeout(function () {
      if (canStroke) {
        // Stroke-by-stroke demo
        var p;
        if (target.kind === 'multi-digit') {
          p = LS.animateSequence(target.char.split(''), { color: '#ec4899' });
        } else {
          p = LS.animate(target.char, { color: '#ec4899' });
        }
        p.catch(function (err) {
          // Defensive: if stroke animation fails mid-flight, fall back to text.
          NS.Canvas.humphreyClear();
          fallbackTextDemo(target);
        });
      } else {
        fallbackTextDemo(target);
      }
    }, 700);
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

  function retryCurrentTarget() {
    if (NS.Canvas) {
      if (NS.Canvas.clearNigelLayer) NS.Canvas.clearNigelLayer();
      if (NS.Canvas.humphreyClear)   NS.Canvas.humphreyClear();
    }
    setHidden($('[data-ll-retry]'), true);
    setHidden($('[data-ll-action-bar]'), false);
    state.submitting = false;
    $('[data-ll-submit]').disabled = false;

    var target = state.targets[state.index];
    humphreySay('letter_lab_your_turn', 'Now you try ' + target.label + ' again.', 'encouraging');
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

    setHidden($('[data-ll-prompt-panel]'), true);
    setHidden($('[data-ll-action-bar]'), true);
    setHidden($('[data-ll-result]'), false);
    setHidden($('[data-ll-spinner]'), true);
    setHidden($('[data-ll-reaction-card]'), false);
    setHidden($('[data-ll-watch]'), true);
    setHidden($('[data-ll-skip]'), true);
    setHidden($('[data-ll-retry]'), true);
    setHidden($('[data-ll-next]'), true);
    setHidden($('[data-ll-finish]'), true);
    setHumphreyExpression('cheering');
    $('[data-ll-reaction]').textContent =
      'You practiced ' + state.targets.length + ' things with me today, Nigel! Beautiful work. ' +
      'See you back here next time.';

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
