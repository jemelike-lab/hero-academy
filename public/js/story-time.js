/**
 * Hero Academy — Story Time (v174b: read-along + MC comprehension)
 *
 * COMPLETE REWRITE from v107. The old flow used the microphone to record
 * Nigel reading aloud sentence-by-sentence and shipped his audio to
 * /api/humphrey/assess-sentence + /api/humphrey/assess-comprehension for
 * scoring. Speech recognition was unreliable, the assessment was harsh
 * on a 7yo's voice, and the listening UI itself was fragile.
 *
 * NEW FLOW (v174b):
 *   1) Generate passage + 3 MC questions in ONE Haiku call.
 *   2) Show the full passage. Tap "🔊 Listen along" → TTS reads the
 *      passage while each word HIGHLIGHTS in sync. Fluency by EXAMPLE —
 *      Nigel sees the word-by-word pacing of a fluent reader without
 *      having to read aloud himself.
 *   3) After the read-along, the comprehension panel appears with the
 *      first MC question. 3-4 options, tap to pick. Wrong → hint via
 *      TTS, retry. Wrong twice → reveal correct + soft advance.
 *   4) Cycle through all MC questions, then end card.
 *
 * No listener, no mic, no /api/humphrey/assess-*. Pure visual + tap.
 *
 * Endpoints used:
 *   POST /api/humphrey/generate-passage  (now also returns mcQuestions[])
 */
(function () {
  'use strict';
  var NS = window.HeroAcademy = window.HeroAcademy || {};

  var SENTENCES_PER_SESSION = 3;
  var WORD_HIGHLIGHT_MS_PER_WORD = 380;  // 2nd-grade fluent pace
  var WRONG_HINT_DELAY_MS = 1200;
  var WRONG_REVEAL_DELAY_MS = 1800;
  // v175: wait for TTS to finish + pause, not a fixed race
  var POST_SPEECH_PAUSE_MS = 2000;
  var TTS_SAFETY_MS = 20000;

  var state = {
    title: '',
    sentences: [],
    questions: [],   // mcQuestions from the endpoint
    qIdx: 0,
    wrongAttempts: 0,
    inReadAlong: false,
    passagesRead: 0,
    correctOnFirstTry: 0,
    started: Date.now(),
  };

  function $(id) { return document.getElementById(id); }
  function hide(el) { if (el) el.hidden = true; }
  function show(el) { if (el) el.hidden = false; }

  function speakAndUnlock(text, expression) {
    try {
      var H = NS.Humphrey;
      if (H && typeof H.say === 'function') {
        return H.say('story-time', { kidName: 'Nigel', expression: expression || 'encouraging', text: String(text) });
      }
    } catch (_) {}
    return Promise.resolve();
  }
  // v175: wait for TTS to actually finish, then run callback after pause
  function waitForSpeechThenDo(ttsPromise, pauseMs, callback) {
    var done = false;
    var safety = setTimeout(function () {
      if (done) return; done = true;
      callback();
    }, TTS_SAFETY_MS);
    ttsPromise.then(function () {
      if (done) return;
      setTimeout(function () {
        if (done) return; done = true;
        clearTimeout(safety);
        callback();
      }, pauseMs);
    }).catch(function () {
      if (done) return; done = true;
      clearTimeout(safety);
      callback();
    });
  }

  // -------- Boot + passage generation --------
  function boot() {
    show($('st-loading'));
    hide($('st-stage'));
    hide($('st-end-card'));
    fetchPassage().then(function (data) {
      state.title = data.title || 'Story Time';
      state.sentences = data.sentences || [];
      state.questions = data.mcQuestions || [];
      state.qIdx = 0;
      state.wrongAttempts = 0;
      renderPassageStage();
    }).catch(function (e) {
      console.error('[story-time] generate failed', e);
      // Fallback: simple passage
      state.title = 'A Sunny Day';
      state.sentences = ['Nigel went outside to play.', 'The sun was bright and warm.', 'He smiled and ran fast.'];
      state.questions = [{
        q: 'Where did Nigel go?',
        kind: 'comp',
        options: ['outside', 'to school', 'home'],
        correct_index: 0,
        explanation: 'Nigel went outside to play.',
      }];
      renderPassageStage();
    });
  }

  function fetchPassage() {
    var body = { kidName: 'Nigel', pattern: 'digraphs' };
    return fetch('/api/humphrey/generate-passage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // -------- Passage display + read-along --------
  function renderPassageStage() {
    hide($('st-loading'));
    show($('st-stage'));
    hide($('st-mc-panel'));
    hide($('st-end-card'));

    $('st-title').textContent = state.title;
    $('st-counter').textContent = 'Passage';

    // Render passage as words with individual spans, ready for highlight sync.
    var container = $('st-passage');
    container.innerHTML = '';
    state.sentences.forEach(function (sentence, sIdx) {
      var sentEl = document.createElement('span');
      sentEl.className = 'st-sentence';
      var words = sentence.split(/\s+/).filter(Boolean);
      words.forEach(function (w, wIdx) {
        var wordEl = document.createElement('span');
        wordEl.className = 'st-word';
        wordEl.textContent = w + (wIdx < words.length - 1 ? ' ' : '');
        sentEl.appendChild(wordEl);
      });
      // Add a trailing space between sentences (except the last)
      if (sIdx < state.sentences.length - 1) sentEl.appendChild(document.createTextNode(' '));
      container.appendChild(sentEl);
    });

    // The current-sentence card from the old design — we now use it as a
    // "Tap Listen along to start" CTA panel.
    var currentEl = $('st-sentence-current');
    if (currentEl) currentEl.textContent = '🔊 Tap "Listen along" — follow the words.';

    // Repurpose the old mic button into the Listen Along trigger.
    var micBtn = $('st-mic-btn');
    if (micBtn) {
      micBtn.className = 'st-mic-btn';
      micBtn.innerHTML = '<span class="st-mic-label">🔊 Listen along</span>';
      micBtn.disabled = false;
      micBtn.onclick = startReadAlong;
    }
    // Hide done/tryagain — not used in v174b
    hide($('st-done-btn'));
    hide($('st-tryagain-btn'));
    hide($('st-status'));
  }

  function startReadAlong() {
    if (state.inReadAlong) return;
    state.inReadAlong = true;
    var micBtn = $('st-mic-btn');
    if (micBtn) { micBtn.disabled = true; micBtn.innerHTML = '<span class="st-mic-label">🌟 Reading…</span>'; }

    var words = Array.from(document.querySelectorAll('.st-word'));
    var totalMs = words.length * WORD_HIGHLIGHT_MS_PER_WORD;

    // Kick off TTS for the full passage
    var fullText = state.sentences.join(' ');
    speakAndUnlock(fullText, 'encouraging');

    // Highlight each word in sequence (fixed cadence — best-effort sync)
    words.forEach(function (wEl, i) {
      setTimeout(function () {
        words.forEach(function (w) { w.classList.remove('reading'); });
        wEl.classList.add('reading');
      }, i * WORD_HIGHLIGHT_MS_PER_WORD);
    });
    // Settle: clear final highlight + advance to comprehension
    setTimeout(function () {
      words.forEach(function (w) { w.classList.remove('reading'); });
      words.forEach(function (w) { w.classList.add('done'); });
      state.inReadAlong = false;
      enterComprehensionMode();
    }, totalMs + 700);
  }

  // -------- Comprehension MC --------
  function enterComprehensionMode() {
    var stage = $('st-stage');
    if (stage) {
      // Replace the action row with the MC panel
      var actionRow = stage.querySelector('.st-action-row');
      if (actionRow) actionRow.style.display = 'none';
      var currentCard = stage.querySelector('.st-current-card');
      if (currentCard) currentCard.style.display = 'none';
    }
    var mcPanel = $('st-mc-panel');
    if (!mcPanel) {
      // Inject the panel if it doesn't exist (defensive — HTML may not have it yet)
      mcPanel = document.createElement('section');
      mcPanel.id = 'st-mc-panel';
      mcPanel.className = 'st-mc-panel';
      mcPanel.innerHTML =
        '<h3 class="st-mc-title" id="st-mc-title">Let&rsquo;s check what you remember!</h3>' +
        '<p class="st-mc-question" id="st-mc-q"></p>' +
        '<div class="st-mc-options" id="st-mc-options"></div>' +
        '<p class="st-mc-feedback" id="st-mc-feedback"></p>' +
        '<button class="st-mc-replay" id="st-mc-replay" type="button">🔊 Hear it again</button>';
      ($('st-stage') || document.body).appendChild(mcPanel);
    }
    show(mcPanel);
    state.qIdx = 0;
    renderQuestion();
  }

  function renderQuestion() {
    var q = state.questions[state.qIdx];
    if (!q) { finishPassage(); return; }
    state.wrongAttempts = 0;
    $('st-mc-q').textContent = q.q;
    $('st-mc-feedback').textContent = '';
    $('st-counter').textContent = 'Question ' + (state.qIdx + 1) + ' of ' + state.questions.length;

    var box = $('st-mc-options');
    box.innerHTML = '';
    q.options.forEach(function (opt, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'st-mc-option';
      btn.textContent = String.fromCharCode(65 + idx) + '. ' + opt;
      btn.onclick = function () { onAnswerTap(idx, btn); };
      box.appendChild(btn);
    });

    // Replay button
    var replay = $('st-mc-replay');
    if (replay) replay.onclick = function () { speakAndUnlock(q.q, 'encouraging'); };

    // Speak the question after a tiny pause
    setTimeout(function () { speakAndUnlock(q.q, 'encouraging'); }, 300);
  }

  function onAnswerTap(idx, btn) {
    var q = state.questions[state.qIdx];
    if (!q) return;
    var allBtns = Array.from(document.querySelectorAll('.st-mc-option'));
    if (allBtns.every(function (b) { return b.disabled; })) return; // already resolved

    if (idx === q.correct_index) {
      btn.classList.add('correct');
      allBtns.forEach(function (b) { b.disabled = true; });
      $('st-mc-feedback').textContent = '✓ ' + q.explanation;
      $('st-mc-feedback').className = 'st-mc-feedback correct';
      if (state.wrongAttempts === 0) state.correctOnFirstTry += 1;
      var ttsP = speakAndUnlock('Yes! ' + q.explanation, 'cheering');
      waitForSpeechThenDo(ttsP, POST_SPEECH_PAUSE_MS, advanceQuestion);
      return;
    }

    state.wrongAttempts += 1;
    btn.classList.add('wrong');
    btn.disabled = true;

    if (state.wrongAttempts >= 2) {
      // Reveal correct + soft advance
      var correctBtn = allBtns[q.correct_index];
      if (correctBtn) correctBtn.classList.add('reveal');
      allBtns.forEach(function (b) { b.disabled = true; });
      $('st-mc-feedback').textContent = 'The answer is ' + q.options[q.correct_index] + '. ' + q.explanation;
      $('st-mc-feedback').className = 'st-mc-feedback reveal';
      var ttsP2 = speakAndUnlock('The answer is ' + q.options[q.correct_index] + '. ' + q.explanation, 'encouraging');
      waitForSpeechThenDo(ttsP2, POST_SPEECH_PAUSE_MS + 1000, advanceQuestion); // extra 1s for wrong-reveal
      return;
    }

    // First wrong attempt: hint + retry
    $('st-mc-feedback').textContent = 'Not quite — try again. Tap the answer you think is right.';
    $('st-mc-feedback').className = 'st-mc-feedback hint';
    speakAndUnlock('Not quite. Try again.', 'encouraging');
  }

  function advanceQuestion() {
    state.qIdx += 1;
    if (state.qIdx >= state.questions.length) finishPassage();
    else renderQuestion();
  }

  function finishPassage() {
    state.passagesRead += 1;

    // v199: cap-proof completion flag for Today's Mission checkmark.
    try {
      var dk = 'ha_zone_done_' + new Date().toISOString().slice(0, 10);
      var df = JSON.parse(localStorage.getItem(dk) || '{}');
      df['story-time'] = true;
      localStorage.setItem(dk, JSON.stringify(df));
    } catch (_) {}
    try {
      if (NS.TodayMission && typeof NS.TodayMission.markVisited === 'function') {
        NS.TodayMission.markVisited('story-time');
      }
    } catch (_) {}

    hide($('st-stage'));
    var mcPanel = $('st-mc-panel');
    if (mcPanel) hide(mcPanel);
    show($('st-end-card'));
    var statsEl = $('st-end-stats');
    if (statsEl) {
      statsEl.innerHTML =
        '<p>You answered <strong>' + state.correctOnFirstTry + ' of ' + state.questions.length +
        '</strong> on the first try!</p>' +
        '<p style="opacity:.7;font-size:14px;">Beautiful work, Nigel.</p>';
    }
    var restartBtn = $('st-restart-btn');
    if (restartBtn) restartBtn.onclick = function () {
      state.correctOnFirstTry = 0;
      state.qIdx = 0;
      boot();
    };
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 50);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }

  NS.StoryTime = { state: state };
})();
