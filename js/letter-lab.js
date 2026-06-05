/**
 * Hero Academy — Letter Lab (v99)
 *
 * Touch-friendly drawing practice for letters. Nigel writes a letter on the
 * canvas with his finger; Ms. Humphrey (Claude Haiku vision) looks at it and
 * gives warm, specific feedback.
 *
 * Session = 3 random letters from A-Z. After all 3 are submitted (regardless
 * of correctness — this is practice, not a quiz), the session marks today
 * complete via localStorage flag `ha_letter_lab_<yyyymmdd>` so the Daily
 * Mission step can render its ✅.
 *
 * Public hooks (rare — page is self-contained):
 *   HeroAcademy.LetterLab.start()  — auto-runs on DOMContentLoaded
 */
(function () {
  'use strict';
  var NS = window.HeroAcademy = window.HeroAcademy || {};

  // ----- Config --------------------------------------------------------------
  var SESSION_SIZE = 3;
  // Avoid ambiguous-looking pairs (O/Q, I/J/l) for v1. Easy to add back later.
  var ALPHABET = 'ABCDEFGHKLMNPRSTUWXYZ'.split('');
  // Cue phrasing rotation so Humphrey doesn't sound robotic.
  var PROMPT_PHRASES = [
    'Write a big capital ',
    'Show me your best capital ',
    'Let\'s practice the letter ',
    'Can you draw a capital ',
  ];

  // ----- State ---------------------------------------------------------------
  var state = {
    letters:    [],      // array of target letters for this session
    index:      0,       // which one we're on (0..SESSION_SIZE-1)
    submitting: false,
  };

  // ----- DOM helpers ---------------------------------------------------------
  function $(sel) { return document.querySelector(sel); }
  function setHidden(el, hidden) { if (el) el.hidden = !!hidden; }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  // ----- Humphrey wrapper ----------------------------------------------------
  // Tolerates Humphrey being unavailable (script missing or muted).
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
    if (!img) return;
    // We keep the static portrait simple — just swap the alt for screen readers.
    img.alt = 'Ms. Humphrey looks ' + (expression || 'happy');
  }

  // ----- Session setup -------------------------------------------------------
  function pickLetters(n) {
    var pool = ALPHABET.slice();
    var picks = [];
    for (var i = 0; i < n && pool.length > 0; i++) {
      var idx = Math.floor(Math.random() * pool.length);
      picks.push(pool.splice(idx, 1)[0]);
    }
    return picks;
  }

  function start() {
    state.letters = pickLetters(SESSION_SIZE);
    state.index = 0;
    mountCanvas();
    wireUI();
    renderCurrentLetter();
  }

  function mountCanvas() {
    var wrap = $('[data-ll-canvas-wrap]');
    if (!wrap || !NS.Canvas) return;
    // canvas.js exposes setTool/setColor; mount opts only accept showToolbar
    // + onChange. Hide its built-in toolbar since this page has its own buttons.
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
  }

  // ----- Per-letter render ---------------------------------------------------
  function renderCurrentLetter() {
    var letter = state.letters[state.index];
    if (!letter) { finishSession(); return; }

    // Reset UI to "drawing" phase
    setHidden($('[data-ll-result]'), true);
    setHidden($('[data-ll-spinner]'), true);
    setHidden($('[data-ll-reaction-card]'), true);
    setHidden($('[data-ll-next]'), true);
    setHidden($('[data-ll-finish]'), true);
    setHidden($('[data-ll-prompt-panel]'), false);
    setHidden($('[data-ll-action-bar]'), false);
    if (NS.Canvas && NS.Canvas.clearNigelLayer) NS.Canvas.clearNigelLayer();
    state.submitting = false;
    $('[data-ll-submit]').disabled = false;

    // Set prompt
    var phrase = PROMPT_PHRASES[Math.floor(Math.random() * PROMPT_PHRASES.length)];
    $('[data-ll-prompt-text]').innerHTML =
      escapeHTML(phrase) + '<strong>' + escapeHTML(letter) + '</strong>?';
    $('[data-ll-target]').textContent = letter;
    $('[data-ll-progress]').textContent = (state.index + 1) + ' / ' + state.letters.length;

    humphreySay('letter_lab_prompt_' + letter, phrase + letter + '?', 'encouraging');
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  // ----- Submit + vision -----------------------------------------------------
  function submitDrawing() {
    if (state.submitting) return;
    state.submitting = true;
    var btn = $('[data-ll-submit]');
    btn.disabled = true;

    var letter = state.letters[state.index];
    var dataUrl;
    try {
      dataUrl = NS.Canvas && NS.Canvas.getDataURL ? NS.Canvas.getDataURL() : null;
    } catch (e) { dataUrl = null; }

    if (!dataUrl) {
      showReaction('Hmm, I couldn\u2019t see what you drew. Tap Clear and try again, Nigel!', 'concerned', false);
      return;
    }

    // Enter result phase
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
        target_letter: letter,
      }),
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (json) {
        var reaction = (json && json.reaction) ||
          'I can see you worked hard on that, Nigel \u2014 great job!';
        var correct = !!(json && json.correct);
        showReaction(reaction, correct ? 'cheering' : 'encouraging', correct);
        recordAttempt(letter, json);
      })
      .catch(function (err) {
        var fallback = 'I had trouble seeing your letter clearly, but I can tell you worked hard! ' +
                       'Let\'s keep going.';
        showReaction(fallback, 'encouraging', false);
        recordAttempt(letter, { error: err && err.message || 'unknown' });
      });
  }

  function showReaction(text, expression, correct) {
    setHidden($('[data-ll-spinner]'), true);
    setHidden($('[data-ll-reaction-card]'), false);
    $('[data-ll-reaction]').textContent = text;
    setHumphreyExpression(expression);

    var isLast = state.index >= state.letters.length - 1;
    setHidden($('[data-ll-next]'),   isLast);
    setHidden($('[data-ll-finish]'), !isLast);

    humphreySay('letter_lab_reaction', text, expression);
  }

  // ----- Telemetry -----------------------------------------------------------
  function recordAttempt(letter, result) {
    var key = 'ha_letter_lab_attempts_' + todayKey();
    var existing = [];
    try {
      var raw = localStorage.getItem(key);
      if (raw) existing = JSON.parse(raw) || [];
    } catch (e) { existing = []; }
    existing.push({
      letter:  letter,
      ts:      Date.now(),
      score:   result && typeof result.score === 'number' ? result.score : null,
      correct: !!(result && result.correct),
      reaction:(result && result.reaction) || null,
      error:   result && result.error ? result.error : null,
    });
    try { localStorage.setItem(key, JSON.stringify(existing)); } catch (e) {}

    // Best-effort RPC. We do NOT block UI on this.
    try {
      var T = NS.Telemetry;
      if (T && typeof T.rpc === 'function' && typeof T.childId === 'function') {
        T.rpc('ha_record_letter_practice', {
          p_child_id:      T.childId(),
          p_practice_date: todayKey(),
          p_letter:        letter,
          p_score:         result && typeof result.score === 'number' ? result.score : null,
          p_correct:       !!(result && result.correct),
        }, { keepalive: true }).catch(function () {});
      }
    } catch (e) {}
  }

  // ----- Advance / finish ----------------------------------------------------
  function advance() {
    state.index += 1;
    if (state.index >= state.letters.length) {
      finishSession();
    } else {
      renderCurrentLetter();
    }
  }

  function finishSession() {
    // Mark today done so the Daily Mission step gets its ✅
    var doneKey = 'ha_letter_lab_' + todayKey();
    try {
      localStorage.setItem(doneKey, JSON.stringify({
        completed_at: Date.now(),
        letters:      state.letters,
      }));
    } catch (e) {}

    // Celebration screen — reuse the result card
    setHidden($('[data-ll-prompt-panel]'), true);
    setHidden($('[data-ll-action-bar]'), true);
    setHidden($('[data-ll-result]'), false);
    setHidden($('[data-ll-spinner]'), true);
    setHidden($('[data-ll-reaction-card]'), false);
    setHumphreyExpression('cheering');
    $('[data-ll-reaction]').textContent =
      'You practiced ' + state.letters.length + ' letters with me today, Nigel! Beautiful work. ' +
      'See you back here next time.';
    setHidden($('[data-ll-next]'),   true);
    setHidden($('[data-ll-finish]'), true);

    humphreySay('letter_lab_finish',
      'You practiced ' + state.letters.length + ' letters with me today, Nigel. Beautiful work!',
      'cheering');

    // Auto-route home after a moment so the mission card updates
    setTimeout(function () {
      window.location.href = 'index.html';
    }, 3500);
  }

  // ----- Bootstrap -----------------------------------------------------------
  NS.LetterLab = { start: start };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
