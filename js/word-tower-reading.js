/**
 * Hero Academy — Word Tower (v174c: TTS prompt → tap-the-word MC, no microphone)
 *
 * COMPLETE REWRITE from v107. Old flow recorded Nigel reading each word aloud
 * (mic open 4.5s) and shipped the audio to /api/humphrey/assess-reading for
 * scoring. Speech recognition on 7yo voice + the same false-negative pattern
 * Class Time and Story Time had.
 *
 * NEW FLOW (v174c):
 *   Per word:
 *     1. Big card asks "Which word is this?"
 *     2. Humphrey TTS reads the target word (Nigel HEARS it).
 *     3. 4 word cards show: target + 3 distractors. Distractors come from the
 *        same-or-related digraph pattern so it's challenging but fair (e.g.
 *        target 'ship' → distractors 'shop', 'chip', 'sheep'-ish from the pool).
 *     4. Nigel taps a card.
 *        Correct → green flash + 4s pause + next word.
 *        Wrong  → red on tapped card + hint from word data + retry.
 *        Wrong twice → reveal correct card + soft advance.
 *     5. After 8 words → end card with score.
 *
 * Pedagogical reasoning: this is sound-to-spelling matching, the inverse
 * (and arguably better) practice of reading aloud. Kid must (a) hear and
 * parse the spoken word, (b) read 4 written words, (c) match. No mic, no
 * voice judgment, no false negatives.
 *
 * Per-word telemetry kept (same localStorage key) so future spaced-repetition
 * passes still prefer struggled words.
 */
(function () {
  'use strict';
  var NS = window.HeroAcademy = window.HeroAcademy || {};

  var WORDS_PER_SESSION  = 8;
  // v175: wait for TTS to finish + pause, not a fixed race
  var POST_SPEECH_PAUSE_MS = 2000;
  var TTS_SAFETY_MS = 20000;
  var WRONG_REVEAL_DELAY_MS = 2200;
  var STORAGE_KEY = 'ha_word_tower_words';

  var session = {
    level: null,
    queue: [],          // [{ word, pattern, hint, distractors: [w1, w2, w3] }]
    index: 0,
    wrongAttempts: 0,
    results: [],
    startedAt: 0,
  };

  function $(id) { return document.getElementById(id); }
  function hide(el) { if (el) el.hidden = true; }
  function show(el) { if (el) el.hidden = false; }

  // ---- Per-word stats in localStorage (unchanged from v107) -----------
  function loadWordStats() {
    try { var raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : {}; }
    catch (_) { return {}; }
  }
  function saveWordStats(stats) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stats)); } catch (_) {}
  }
  function recordWordResult(word, passed) {
    var stats = loadWordStats();
    var entry = stats[word] || { attempts: 0, correct: 0, lastSeen: null };
    entry.attempts += 1;
    if (passed) entry.correct += 1;
    entry.lastSeen = new Date().toISOString();
    stats[word] = entry;
    saveWordStats(stats);
  }

  // ---- Distractor selection ------------------------------------------
  // Build 3 distractors from the same level pool, preferring same pattern.
  // Falls back to any other word if not enough same-pattern candidates.
  function pickDistractors(target, pool) {
    var samePattern = pool.filter(function (w) {
      return w.word !== target.word && w.pattern === target.pattern;
    });
    var different = pool.filter(function (w) {
      return w.word !== target.word && w.pattern !== target.pattern;
    });
    // Shuffle helpers
    function shuffle(a) { return a.slice().sort(function () { return Math.random() - 0.5; }); }
    var picks = shuffle(samePattern).slice(0, 3);
    if (picks.length < 3) {
      picks = picks.concat(shuffle(different).slice(0, 3 - picks.length));
    }
    return picks.map(function (w) { return w.word; });
  }

  // ---- Word queue selection (preserves struggled-words bias) ----------
  function pickWordsForSession(level) {
    var pool = level.words.slice();
    var stats = loadWordStats();
    var struggled = [];
    var fresh = [];
    pool.forEach(function (w) {
      var s = stats[w.word];
      if (s && s.attempts > 0 && s.correct < s.attempts) struggled.push(w);
      else fresh.push(w);
    });
    // Shuffle within each bucket
    function shuffle(a) { return a.slice().sort(function () { return Math.random() - 0.5; }); }
    struggled = shuffle(struggled);
    fresh = shuffle(fresh);
    var ordered = struggled.concat(fresh).slice(0, WORDS_PER_SESSION);
    return ordered.map(function (w) {
      return {
        word: w.word,
        pattern: w.pattern,
        hint: w.hint,
        distractors: pickDistractors(w, pool),
      };
    });
  }

  // ---- TTS wrapper ----------------------------------------------------
  function speak(text, expression) {
    try {
      var H = NS.Humphrey;
      if (H && typeof H.say === 'function') {
        return H.say('word-tower', { kidName: 'Nigel', expression: expression || 'encouraging', text: String(text) });
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

  // ---- Render the current word card + MC options ----------------------
  function renderCurrentWord() {
    var w = session.queue[session.index];
    if (!w) { finishSession(); return; }
    session.wrongAttempts = 0;

    $('wt-counter').textContent = 'Word ' + (session.index + 1) + ' of ' + session.queue.length;

    // v174c: word card now asks the question; the answer comes from the MC options below.
    var wordEl = $('wt-word');
    if (wordEl) wordEl.textContent = '🔊 Which word is this?';

    var patternBadge = $('wt-pattern');
    if (patternBadge) {
      patternBadge.hidden = false;
      patternBadge.textContent = w.pattern;
    }

    // Build the MC options (target + 3 distractors, shuffled)
    var allOptions = [w.word].concat(w.distractors);
    allOptions = allOptions.slice().sort(function () { return Math.random() - 0.5; });

    // Replace the mic button with an MC options grid (or update existing grid)
    var optsHost = $('wt-options');
    if (!optsHost) {
      optsHost = document.createElement('div');
      optsHost.id = 'wt-options';
      optsHost.className = 'wt-options';
      var micBtn = $('wt-mic-btn');
      if (micBtn && micBtn.parentNode) micBtn.parentNode.insertBefore(optsHost, micBtn);
    }
    optsHost.innerHTML = '';
    allOptions.forEach(function (optWord) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wt-option';
      btn.textContent = optWord;
      btn.onclick = function () { onWordTap(optWord, btn, w); };
      optsHost.appendChild(btn);
    });

    // Repurpose the old mic button as "Hear it again"
    var micBtn = $('wt-mic-btn');
    if (micBtn) {
      micBtn.className = 'wt-mic-btn';
      micBtn.innerHTML = '<span class="wt-mic-label">🔊 Hear it again</span>';
      micBtn.disabled = false;
      micBtn.onclick = function () { speak(w.word, 'encouraging'); };
    }

    // Hide old tryagain button (we use inline feedback now)
    hide($('wt-tryagain-btn'));
    hide($('wt-status'));

    // Speak the target word after a tiny pause so the UI settles
    setTimeout(function () { speak(w.word, 'encouraging'); }, 300);
  }

  function onWordTap(picked, btn, w) {
    if (btn.disabled) return;
    var allBtns = Array.from(document.querySelectorAll('.wt-option'));
    if (allBtns.every(function (b) { return b.disabled; })) return;

    if (picked === w.word) {
      btn.classList.add('correct');
      allBtns.forEach(function (b) { b.disabled = true; });
      var status = $('wt-status');
      if (status) {
        status.hidden = false;
        status.className = 'wt-status wt-status--pass';
        status.textContent = '✓ Yes — ' + w.word + '!';
      }
      var passed = session.wrongAttempts === 0;
      recordWordResult(w.word, passed);
      session.results.push({ word: w.word, passed: passed, attempts: session.wrongAttempts + 1 });
      var ttsP = speak('Yes! ' + w.word + '.', 'cheering');
      waitForSpeechThenDo(ttsP, POST_SPEECH_PAUSE_MS, advance);
      return;
    }

    session.wrongAttempts += 1;
    btn.classList.add('wrong');
    btn.disabled = true;

    if (session.wrongAttempts >= 2) {
      // Reveal + soft advance
      var correctBtn = allBtns.filter(function (b) { return b.textContent === w.word; })[0];
      if (correctBtn) correctBtn.classList.add('reveal');
      allBtns.forEach(function (b) { b.disabled = true; });
      var status = $('wt-status');
      if (status) {
        status.hidden = false;
        status.className = 'wt-status wt-status--hint';
        status.textContent = 'The word is ' + w.word + '. ' + (w.hint || '');
      }
      recordWordResult(w.word, false);
      session.results.push({ word: w.word, passed: false, attempts: session.wrongAttempts });
      var ttsP2 = speak('The word is ' + w.word + '. ' + (w.hint || ''), 'encouraging');
      waitForSpeechThenDo(ttsP2, POST_SPEECH_PAUSE_MS + 1000, advance); // extra 1s for wrong-reveal
      return;
    }

    // First wrong: hint + retry
    var statusEl = $('wt-status');
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.className = 'wt-status wt-status--hint';
      statusEl.textContent = '💡 ' + (w.hint || 'Try again — tap the word you heard.');
    }
    speak(w.hint || 'Try again.', 'encouraging');
  }

  function advance() {
    session.index += 1;
    if (session.index >= session.queue.length) finishSession();
    else renderCurrentWord();
  }

  function finishSession() {
    hide($('wt-stage'));
    var endCard = $('wt-end-card');
    if (!endCard) {
      endCard = document.createElement('section');
      endCard.id = 'wt-end-card';
      endCard.className = 'wt-end-card';
      document.body.appendChild(endCard);
    }
    endCard.hidden = false;
    var firstTry = session.results.filter(function (r) { return r.passed; }).length;
    endCard.innerHTML =
      '<h2 class="wt-end-title">🎉 Beautiful reading!</h2>' +
      '<p class="wt-end-line">You got <strong>' + firstTry + ' of ' + session.results.length + '</strong> on the first try.</p>' +
      '<p class="wt-end-line wt-end-line--soft">Want to try another set?</p>' +
      '<div class="wt-end-actions">' +
      '  <button class="wt-end-restart" id="wt-restart">Another set →</button>' +
      '  <a class="wt-end-home" href="index.html">Back home</a>' +
      '</div>';
    var rb = document.getElementById('wt-restart');
    if (rb) rb.onclick = function () {
      session.results = []; session.index = 0;
      hide(endCard);
      show($('wt-stage'));
      boot();
    };
  }

  function boot() {
    var WL = NS.WordLists;
    if (!WL) {
      console.error('[word-tower] WordLists module missing');
      return;
    }
    session.level = WL.getLevel(WL.getDefaultLevelId());
    session.queue = pickWordsForSession(session.level);
    session.index = 0;
    session.wrongAttempts = 0;
    session.results = [];
    session.startedAt = Date.now();
    show($('wt-stage'));
    renderCurrentWord();

    // Wire End button
    var endBtn = $('wt-end-btn');
    if (endBtn) endBtn.onclick = function () { finishSession(); };
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 50);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }

  NS.WordTower = { session: session };
})();
