/**
 * Hero Academy — Word Tower read-aloud session controller.
 *
 * Drives the read-aloud loop:
 *   show word -> kid taps mic -> Listener captures audio (4.5s)
 *   -> POST /api/humphrey/assess-reading with {expected, transcript, pattern}
 *   -> branch on passed:
 *        pass: Humphrey praises, confetti, advance
 *        miss (attempt 1): Humphrey corrects, replay expected word slowly,
 *                          show Try Again button
 *        miss (attempt 2+): mark for spaced repetition, gentle move-on
 *
 * Per-word data is persisted to localStorage so a future spaced-repetition
 * pass can prefer words that need more work.
 *
 * At session end (8 words or kid taps End), a one-line note is written to
 * Memory.addCustomSummary so it shows up in Ms. Humphrey's notebook on her
 * next conversation with Nigel.
 *
 * Expected DOM:
 *   #wt-word          — big word display
 *   #wt-counter       — "Word 1 of 8"
 *   #wt-pattern       — small phonics-pattern badge
 *   #wt-mic-btn       — "Read it!" button
 *   #wt-status        — line of text below mic (correction or hint)
 *   #wt-tryagain-btn  — secondary button (hidden by default)
 *   #wt-end-card      — end-of-session card (hidden by default)
 *   #wt-end-stats     — text inside end card
 */
(function () {
  'use strict';
  var NS = window.HeroAcademy = window.HeroAcademy || {};

  // --- Tuning -----------------------------------------------------------
  var WORDS_PER_SESSION   = 8;     // session length
  var LISTEN_MAX_MS       = 4500;  // recording window for a single word
  var ADVANCE_DELAY_MS    = 1600;  // pause after a pass before next word
  var COOLDOWN_MS         = 800;
  var STORAGE_KEY         = 'ha_word_tower_words';
  // ---------------------------------------------------------------------

  var session = {
    level: null,
    queue: [],          // [{ word, pattern, hint }]
    index: 0,
    attemptsThisWord: 0,
    results: [],        // [{ word, passed, attempts, slip }]
    startedAt: 0,
    inFlight: false,
    lastTap: 0
  };

  function debugOn() {
    try { return localStorage.getItem('ha_humphrey_debug') === '1'; } catch (_) { return false; }
  }
  function debug() {
    if (!debugOn()) return;
    var args = ['[WordTower]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
  }

  function $(id) { return document.getElementById(id); }

  // ---- Per-word stats in localStorage ---------------------------------
  function loadWordStats() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) { return {}; }
  }
  function saveWordStats(stats) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stats)); } catch (_) {}
  }
  function recordWordResult(word, passed, slip) {
    var stats = loadWordStats();
    var entry = stats[word] || { attempts: 0, correct: 0, lastSlip: null, lastSeen: null };
    entry.attempts += 1;
    if (passed) entry.correct += 1;
    if (slip) entry.lastSlip = slip;
    entry.lastSeen = new Date().toISOString();
    stats[word] = entry;
    saveWordStats(stats);
  }

  // ---- Word selection -------------------------------------------------
  function pickWordsForSession(level) {
    var pool = level.words.slice();
    var stats = loadWordStats();
    // Prefer struggled words: those with <100% on prior attempts come first.
    var struggled = [];
    var fresh = [];
    pool.forEach(function (w) {
      var s = stats[w.word];
      if (s && s.attempts > 0 && s.correct < s.attempts) struggled.push(w);
      else fresh.push(w);
    });
    // Shuffle each bucket independently
    function shuffle(arr) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    }
    shuffle(struggled); shuffle(fresh);
    var queue = struggled.concat(fresh).slice(0, WORDS_PER_SESSION);
    debug('queue:', queue.map(function (q) { return q.word; }).join(' '));
    return queue;
  }

  // ---- Ms. Humphrey utterances ----------------------------------------
  function say(text, opts) {
    opts = opts || {};
    var H = NS.Humphrey;
    if (!H || typeof H.say !== 'function') return Promise.resolve();
    return H.say(opts.event || 'try-again-reading', {
      kidName: 'Nigel',
      text: text
    });
  }

  // ---- Confetti -------------------------------------------------------
  function burstConfetti() {
    var colors = ['#ffd147', '#ec4899', '#4287ff', '#2ec27e', '#a855f7', '#ff8b3d'];
    var ct = document.createElement('div');
    ct.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:200;overflow:hidden';
    for (var i = 0; i < 60; i++) {
      var p = document.createElement('div');
      var sz = 6 + Math.random() * 10;
      var cl = colors[Math.floor(Math.random() * colors.length)];
      var sx = 20 + Math.random() * 60;
      var dr = (Math.random() - 0.5) * 70;
      var rt = Math.random() * 720;
      var du = 1.4 + Math.random() * 1.0;
      p.style.cssText =
        'position:absolute;left:' + sx + '%;top:40%;width:' + sz + 'px;height:' + sz +
        'px;background:' + cl + ';border-radius:' + (Math.random() > 0.5 ? '50%' : '2px') +
        ';animation:wt-confetti ' + du + 's ' + (Math.random() * 0.3) +
        's cubic-bezier(0.2,0.7,0.3,1) forwards;--drift:' + dr + 'vw;--rot:' + rt + 'deg;';
      ct.appendChild(p);
    }
    document.body.appendChild(ct);
    setTimeout(function () { ct.remove(); }, 3200);
  }

  // ---- UI state -------------------------------------------------------
  function setMicState(state) {
    var btn = $('wt-mic-btn');
    if (!btn) return;
    btn.classList.remove('listening', 'thinking', 'passed', 'failed', 'disabled');
    if (state) btn.classList.add(state);
    btn.disabled = (state === 'thinking' || state === 'disabled');
    var label = btn.querySelector('.wt-mic-label');
    if (label) {
      label.textContent = ({
        ready:     '🎤 Read it!',
        listening: '🎙️ Listening...',
        thinking:  '🤔 Listening...',
        passed:    '✅ Yes!',
        failed:    '🔁 Try again',
        disabled:  ''
      }[state] || '🎤 Read it!');
    }
  }

  function setStatus(text, kind) {
    var el = $('wt-status');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'wt-status' + (kind ? ' wt-status--' + kind : '');
    el.hidden = !text;
  }

  function renderCurrentWord() {
    var w = session.queue[session.index];
    if (!w) { showEndCard(); return; }
    $('wt-word').textContent = w.word;
    $('wt-pattern').textContent = w.pattern || '';
    $('wt-pattern').hidden = !w.pattern;
    $('wt-counter').textContent = 'Word ' + (session.index + 1) + ' of ' + session.queue.length;
    $('wt-tryagain-btn').hidden = true;
    setStatus('', null);
    setMicState('ready');
    session.attemptsThisWord = 0;
  }

  function showEndCard() {
    var card = $('wt-end-card');
    var stats = $('wt-end-stats');
    if (!card || !stats) return;
    var total = session.results.length;
    var first = session.results.filter(function (r) { return r.passed && r.attempts === 1; }).length;
    var struggled = session.results.filter(function (r) { return !r.passed || r.attempts > 1; })
                                   .map(function (r) { return r.word; });
    stats.innerHTML =
      '<div class="wt-end-line"><strong>' + total + '</strong> words read</div>' +
      '<div class="wt-end-line"><strong>' + first + '</strong> on the first try</div>' +
      (struggled.length
        ? '<div class="wt-end-line wt-end-line--soft">Words to practice: ' + struggled.join(', ') + '</div>'
        : '<div class="wt-end-line wt-end-line--soft">No stumbles — incredible!</div>');
    $('wt-stage').hidden = true;
    card.hidden = false;
    // Persist a summary to Ms. Humphrey's memory so she remembers this session
    persistSessionSummary({ total: total, first: first, struggled: struggled });
    // Celebrate
    var line = first === total
      ? "You read every single word, Nigel! That was beautiful reading. I am so proud of you."
      : (first >= Math.ceil(total * 0.75)
          ? "Wonderful job, Nigel! You read so many of those on the first try. We can practice the tricky ones again next time."
          : "Good work, Nigel. Some of those were tricky and you stuck with it. That is what real readers do.");
    say(line, { event: 'correct-answer-reading' });
    burstConfetti();
  }

  function persistSessionSummary(stats) {
    try {
      var M = NS.Memory;
      if (!M || typeof M.addCustomSummary !== 'function') return;
      var line =
        'Nigel did a Word Tower read-aloud session today. He read ' + stats.total +
        ' words and got ' + stats.first + ' right on the first try.' +
        (stats.struggled.length
          ? ' He stumbled on: ' + stats.struggled.join(', ') + '. Be ready to revisit those next time.'
          : ' No stumbles — he was on fire.');
      M.addCustomSummary(line);
      debug('session summary saved:', line);
    } catch (e) { debug('summary save failed:', e && e.message); }
  }

  // ---- The read-attempt flow ------------------------------------------
  function onMicTap() {
    if (session.inFlight) return;
    var now = Date.now();
    if (now - session.lastTap < COOLDOWN_MS) return;
    session.lastTap = now;
    session.inFlight = true;

    var L = NS.Listener;
    if (!L || typeof L.listen !== 'function') {
      setStatus('Microphone module not loaded — refresh the page.', 'error');
      session.inFlight = false;
      return;
    }

    setMicState('listening');
    setStatus("I'm listening — say the word out loud.", 'hint');
    debug('listen start');

    L.listen({
      maxMs: LISTEN_MAX_MS,
      onStart: function () { debug('mic on'); },
      onStop:  function () { debug('mic off'); setMicState('thinking'); setStatus('Hmm, let me listen...', 'hint'); }
    }).then(function (rec) {
      var transcript = (rec && rec.transcript) ? String(rec.transcript).trim() : '';
      var err = rec && rec.error;
      debug('listen result:', JSON.stringify(transcript), 'err=', err);
      if (err === 'no-mic') {
        setStatus('I need permission to use your microphone, Nigel. Tap allow and try again.', 'error');
        setMicState('ready');
        session.inFlight = false;
        return;
      }
      if (err === 'already-recording') {
        setStatus('One thing at a time! Wait a moment, then tap again.', 'hint');
        setMicState('ready');
        session.inFlight = false;
        return;
      }
      assessAttempt(transcript);
    }).catch(function (e) {
      debug('mic flow threw:', e && e.message);
      setStatus('Something went sideways. Tap to try again.', 'error');
      setMicState('ready');
      session.inFlight = false;
    });
  }

  function assessAttempt(transcript) {
    var w = session.queue[session.index];
    session.attemptsThisWord += 1;
    debug('assessing word=' + w.word + ' transcript=' + JSON.stringify(transcript) + ' attempt=' + session.attemptsThisWord);

    fetch('/api/humphrey/assess-reading', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        expected: w.word,
        transcript: transcript,
        pattern: w.pattern || '',
        hint: w.hint || '',
        kidName: 'Nigel',
        attempt: session.attemptsThisWord
      })
    }).then(function (r) { return r.json(); }).then(function (json) {
      debug('assess result:', json);
      if (json.passed) {
        handlePass(w, json);
      } else {
        handleMiss(w, json);
      }
    }).catch(function (err) {
      debug('assess fetch failed:', err);
      // Be forgiving on backend errors
      setStatus('My brain hiccupped. Tap to try once more.', 'error');
      setMicState('ready');
      session.inFlight = false;
    });
  }

  function handlePass(w, json) {
    recordWordResult(w.word, true, null);
    if (window.HeroAcademy && window.HeroAcademy.Telemetry) {
      window.HeroAcademy.Telemetry.recordAttempt(true, w.word, w.word, w.word);
    }
    session.results.push({
      word: w.word,
      passed: true,
      attempts: session.attemptsThisWord,
      slip: null
    });
    setMicState('passed');
    setStatus(json.praise_line || 'Yes!', 'pass');
    burstConfetti();
    say(json.praise_line || ('Yes! That is right, Nigel.'), { event: 'correct-answer-reading' });
    setTimeout(function () {
      session.index += 1;
      session.inFlight = false;
      renderCurrentWord();
    }, ADVANCE_DELAY_MS);
  }

  function handleMiss(w, json) {
    recordWordResult(w.word, false, json.slip || 'miss');
    if (session.attemptsThisWord >= 2) {
      // Second miss — gentle move-on, mark for spaced repetition
      if (window.HeroAcademy && window.HeroAcademy.Telemetry) {
        window.HeroAcademy.Telemetry.recordAttempt(false, w.word, w.word, (json && json.slip) || 'miss');
      }
      session.results.push({
        word: w.word,
        passed: false,
        attempts: session.attemptsThisWord,
        slip: json.slip || 'miss'
      });
      setMicState('disabled');
      var moveOnLine = "That is a tricky one. Let us come back to it next time, Nigel. " +
                       "The word was " + w.word + ".";
      setStatus(moveOnLine, 'hint');
      say(moveOnLine, { event: 'try-again-reading' });
      setTimeout(function () {
        session.index += 1;
        session.inFlight = false;
        renderCurrentWord();
      }, ADVANCE_DELAY_MS + 1500);
      return;
    }

    // First miss — show correction, replay the word slowly via Ms. Humphrey
    setMicState('failed');
    var line = json.correction_line || ('Almost. Listen: ' + w.word + '. Say it with me.');
    setStatus(line, 'fail');
    say(line + ' ' + w.word + '. ' + w.word + '.', { event: 'try-again-reading' }).then(function () {
      $('wt-tryagain-btn').hidden = false;
      session.inFlight = false;
    });
  }

  function onTryAgain() {
    $('wt-tryagain-btn').hidden = true;
    setMicState('ready');
    setStatus('', null);
    // Re-enable the mic — the kid taps it again to attempt
  }

  function onEndSession() {
    showEndCard();
  }

  function onRestart() {
    session.index = 0;
    session.results = [];
    session.attemptsThisWord = 0;
    var level = NS.WordLists.getLevel(NS.WordLists.getDefaultLevelId());
    session.queue = pickWordsForSession(level);
    $('wt-end-card').hidden = true;
    $('wt-stage').hidden = false;
    renderCurrentWord();
  }

  // ---- Boot -----------------------------------------------------------
  function boot() {
    var WL = NS.WordLists;
    if (!WL) {
      console.error('[WordTower] word lists missing — js/word-lists.js not loaded?');
      return;
    }
    var level = WL.getLevel(WL.getDefaultLevelId());
    if (!level) {
      console.error('[WordTower] default level not found');
      return;
    }
    session.level = level;
    session.queue = pickWordsForSession(level);
    session.index = 0;
    session.results = [];
    session.startedAt = Date.now();

    // Bind buttons
    var mic = $('wt-mic-btn');
    if (mic) mic.addEventListener('click', onMicTap);
    var ta = $('wt-tryagain-btn');
    if (ta) ta.addEventListener('click', onTryAgain);
    var end = $('wt-end-btn');
    if (end) end.addEventListener('click', onEndSession);
    var restart = $('wt-restart-btn');
    if (restart) restart.addEventListener('click', onRestart);

    // First word
    renderCurrentWord();

    // Welcome line
    setTimeout(function () {
      say(
        "Welcome to the Word Tower, Nigel! I'll show you a word, and you read it out loud to me. " +
        "If you get stuck, I will help you sound it out. Tap the microphone when you are ready.",
        { event: 'zone-enter' }
      );
    }, 600);
  }

  // Confetti keyframes injected once
  (function injectConfettiStyles() {
    var s = document.createElement('style');
    s.textContent = '@keyframes wt-confetti{0%{transform:translate(0,-50vh) rotate(0);opacity:1;}100%{transform:translate(var(--drift),80vh) rotate(var(--rot));opacity:0;}}';
    document.head.appendChild(s);
  })();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  NS.WordTowerReading = { boot: boot, _session: session };
})();
