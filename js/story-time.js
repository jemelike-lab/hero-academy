/**
 * Hero Academy — Story Time session controller.
 *
 * Flow per passage:
 *   1) Generate a personalized passage via /api/humphrey/generate-passage
 *      (3 sentences + comprehension question, using Nigel's profile)
 *   2) For each sentence:
 *        show passage with current sentence highlighted
 *        kid taps mic -> Listener records -> kid taps Done to stop
 *        POST /api/humphrey/assess-sentence
 *          pass -> highlight green, advance after 1.5s
 *          miss 1 -> show correction, replay sentence slowly via TTS, Try Again
 *          miss 2 -> gentle move on, mark struggled words
 *   3) Comprehension card: kid hears the question, taps mic, answers
 *        POST /api/humphrey/assess-comprehension
 *          pass -> celebrate, complete passage
 *          miss 1 -> hint, Try Again
 *          miss 2 -> gentle move on
 *   4) End card: stats, button to read another passage or finish
 *   5) Session summary written to Memory.addCustomSummary
 *
 * Expected DOM ids:
 *   #st-title              — passage title
 *   #st-passage            — container; sentences rendered as .st-sentence spans
 *   #st-sentence-current   — text of the active sentence (large)
 *   #st-counter            — "Sentence X of N" / "Question"
 *   #st-mic-btn / #st-done-btn / #st-tryagain-btn
 *   #st-status             — feedback text
 *   #st-end-card / #st-end-stats / #st-restart-btn
 *   #st-loading
 */
(function () {
  'use strict';
  var NS = window.HeroAcademy = window.HeroAcademy || {};

  var LISTEN_MAX_MS_SENTENCE   = 12000;   // ceiling for sentence reading
  var LISTEN_MAX_MS_COMPREHEND = 8000;
  var COOLDOWN_MS              = 600;
  var ADVANCE_DELAY_MS         = 1500;
  var SENTENCES_PER_SESSION    = 3;       // matches generator output
  var TARGET_PASSAGES          = 3;       // mini-session of 3 passages

  var session = {
    passages: [],        // [{title, sentences, comprehensionQuestion, expectedAnswerHint}]
    currentPassage: 0,   // index into passages
    currentSentence: 0,  // index into current passage's sentences
    phase: 'reading',    // 'reading' | 'comprehension' | 'done'
    sentenceAttempts: 0,
    comprehensionAttempts: 0,
    stats: {
      passagesCompleted: 0,
      sentencesRead: 0,
      sentencesFirstTry: 0,
      comprehensionPassed: 0,
      struggledWords: []
    },
    inFlight: false,
    lastTap: 0
  };

  function debugOn() {
    try { return localStorage.getItem('ha_humphrey_debug') === '1'; } catch (_) { return false; }
  }
  function debug() {
    if (!debugOn()) return;
    var args = ['[StoryTime]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
  }

  function $(id) { return document.getElementById(id); }

  function say(text, opts) {
    opts = opts || {};
    var H = NS.Humphrey;
    if (!H || typeof H.say !== 'function') return Promise.resolve();
    return H.say(opts.event || 'try-again-reading', { kidName: 'Nigel', text: text });
  }

  // ---- Confetti -------------------------------------------------------
  function burstConfetti() {
    var colors = ['#ffd147', '#ec4899', '#4287ff', '#2ec27e', '#a855f7', '#ff8b3d'];
    var ct = document.createElement('div');
    ct.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:200;overflow:hidden';
    for (var i = 0; i < 50; i++) {
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
        ';animation:st-confetti ' + du + 's ' + (Math.random() * 0.3) +
        's cubic-bezier(0.2,0.7,0.3,1) forwards;--drift:' + dr + 'vw;--rot:' + rt + 'deg;';
      ct.appendChild(p);
    }
    document.body.appendChild(ct);
    setTimeout(function () { ct.remove(); }, 3200);
  }
  (function () {
    var s = document.createElement('style');
    s.textContent = '@keyframes st-confetti{0%{transform:translate(0,-50vh) rotate(0);opacity:1;}100%{transform:translate(var(--drift),80vh) rotate(var(--rot));opacity:0;}}';
    document.head.appendChild(s);
  })();

  // ---- Mic / Done buttons ----------------------------------------------
  function setMicState(state) {
    var btn = $('st-mic-btn');
    if (!btn) return;
    btn.classList.remove('listening', 'thinking', 'passed', 'failed');
    if (state) btn.classList.add(state);
    btn.disabled = (state === 'thinking');
    var label = btn.querySelector('.st-mic-label');
    if (label) {
      label.textContent = ({
        ready:     '🎤 Read it',
        listening: '🎙️ Listening… tap Done when finished',
        thinking:  '🤔 Listening…',
        passed:    '✅ Nice!',
        failed:    '🔁 Try again'
      }[state] || '🎤 Read it');
    }
    var doneBtn = $('st-done-btn');
    if (doneBtn) doneBtn.hidden = (state !== 'listening');
  }

  function setStatus(text, kind) {
    var el = $('st-status');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'st-status' + (kind ? ' st-status--' + kind : '');
    el.hidden = !text;
  }

  // ---- Render passage + current sentence -------------------------------
  function renderPassage() {
    var p = session.passages[session.currentPassage];
    if (!p) { showEnd(); return; }
    $('st-title').textContent = p.title || 'Story Time';
    var container = $('st-passage');
    container.innerHTML = '';
    p.sentences.forEach(function (s, i) {
      var span = document.createElement('span');
      span.className = 'st-sentence';
      if (i < session.currentSentence) span.classList.add('done');
      if (i === session.currentSentence) span.classList.add('current');
      span.textContent = s + ' ';
      container.appendChild(span);
    });
    if (session.phase === 'reading') {
      var s = p.sentences[session.currentSentence];
      $('st-sentence-current').textContent = s;
      $('st-counter').textContent = 'Sentence ' + (session.currentSentence + 1) + ' of ' + p.sentences.length;
    } else if (session.phase === 'comprehension') {
      $('st-sentence-current').textContent = p.comprehensionQuestion;
      $('st-counter').textContent = 'One question for you';
    }
    $('st-tryagain-btn').hidden = true;
    setStatus('', null);
    setMicState('ready');
  }

  // ---- Generate next passage -------------------------------------------
  function generatePassage() {
    var loading = $('st-loading');
    if (loading) loading.hidden = false;
    $('st-stage').hidden = true;
    setStatus('', null);

    var profile = null, recentSummaries = [];
    try {
      if (NS.Memory && typeof NS.Memory.getProfile === 'function') profile = NS.Memory.getProfile();
      if (NS.Memory && typeof NS.Memory.getRecentSummaries === 'function') recentSummaries = NS.Memory.getRecentSummaries();
    } catch (_) {}

    // Target words that match Nigel's current phonics level (consonant digraphs)
    var targetWords = (NS.WordLists && NS.WordLists.getLevel)
      ? (NS.WordLists.getLevel('digraphs').words || []).map(function (w) { return w.word; })
      : [];

    // Avoid repeating recent passage topics
    var excludeTopics = session.passages.map(function (p) { return p.title; }).filter(Boolean);

    return fetch('/api/humphrey/generate-passage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        profile: profile,
        pattern: 'digraphs',
        targetWords: targetWords,
        kidName: 'Nigel',
        excludeTopics: excludeTopics
      })
    }).then(function (r) { return r.json(); }).then(function (json) {
      debug('passage generated:', json.title, 'in', json.latency_ms, 'ms');
      var p = {
        title: json.title,
        sentences: json.sentences,
        comprehensionQuestion: json.comprehensionQuestion,
        expectedAnswerHint: json.expectedAnswerHint
      };
      session.passages.push(p);
      session.currentSentence = 0;
      session.sentenceAttempts = 0;
      session.comprehensionAttempts = 0;
      session.phase = 'reading';
      if (loading) loading.hidden = true;
      $('st-stage').hidden = false;
      renderPassage();
      // Read the passage aloud first so kid knows what they're reading
      var introLine = (session.passages.length === 1)
        ? 'Here is a little story, Nigel. I will read it to you first, and then you read it to me.'
        : 'Here is the next story. I will read it once, then you give it a try.';
      var passageRead = p.sentences.join(' ');
      say(introLine + ' ' + passageRead + " Now you try, starting with: " + p.sentences[0],
          { event: 'zone-enter' });
    }).catch(function (err) {
      debug('passage gen failed:', err);
      if (loading) loading.hidden = true;
      setStatus('Could not load a story. Tap Read More to try again.', 'error');
      $('st-stage').hidden = false;
    });
  }

  // ---- Mic flow -------------------------------------------------------
  function onMicTap() {
    if (session.inFlight) return;
    var now = Date.now();
    if (now - session.lastTap < COOLDOWN_MS) return;
    session.lastTap = now;

    var L = NS.Listener;
    if (!L || typeof L.listen !== 'function') {
      setStatus('Microphone module not loaded — refresh the page.', 'error');
      return;
    }

    session.inFlight = true;
    setMicState('listening');
    setStatus("I'm listening. Read it out loud, then tap Done.", 'hint');

    var maxMs = (session.phase === 'comprehension') ? LISTEN_MAX_MS_COMPREHEND : LISTEN_MAX_MS_SENTENCE;
    L.listen({
      maxMs: maxMs,
      onStart: function () { debug('mic on, maxMs=' + maxMs); },
      onStop:  function () { debug('mic off'); setMicState('thinking'); setStatus('Thinking…', 'hint'); }
    }).then(function (rec) {
      var transcript = (rec && rec.transcript) ? String(rec.transcript).trim() : '';
      var err = rec && rec.error;
      if (err === 'no-mic') {
        setStatus('I need permission to use your microphone, Nigel. Tap allow and try again.', 'error');
        setMicState('ready');
        session.inFlight = false;
        return;
      }
      if (err === 'already-recording') {
        setStatus('One thing at a time! Wait a moment then tap again.', 'hint');
        setMicState('ready');
        session.inFlight = false;
        return;
      }
      if (session.phase === 'reading') return assessSentence(transcript);
      if (session.phase === 'comprehension') return assessComprehension(transcript);
    }).catch(function (e) {
      debug('mic flow threw:', e && e.message);
      setStatus('Something went sideways. Tap to try again.', 'error');
      setMicState('ready');
      session.inFlight = false;
    });
  }

  function onDoneTap() {
    var L = NS.Listener;
    if (!L || typeof L.stop !== 'function') return;
    L.stop();
  }

  // ---- Assess a sentence read -----------------------------------------
  function assessSentence(transcript) {
    var p = session.passages[session.currentPassage];
    var sentence = p.sentences[session.currentSentence];
    session.sentenceAttempts += 1;
    debug('assess sentence #' + session.currentSentence + ' attempt=' + session.sentenceAttempts +
          ' transcript=' + JSON.stringify(transcript));

    fetch('/api/humphrey/assess-sentence', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        expected: sentence,
        transcript: transcript,
        attempt: session.sentenceAttempts,
        kidName: 'Nigel'
      })
    }).then(function (r) { return r.json(); }).then(function (json) {
      debug('assess result:', json);
      if (json.passed) {
        handleSentencePass(json);
      } else {
        handleSentenceMiss(json);
      }
    }).catch(function (err) {
      debug('assess fetch failed:', err);
      setStatus('My brain hiccupped. Tap to try once more.', 'error');
      setMicState('ready');
      session.inFlight = false;
    });
  }

  function handleSentencePass(json) {
    var p = session.passages[session.currentPassage];
    if (session.sentenceAttempts === 1) session.stats.sentencesFirstTry += 1;
    session.stats.sentencesRead += 1;

    setMicState('passed');
    setStatus(json.praiseLine || 'Beautiful!', 'pass');
    say(json.praiseLine || 'Yes! Beautiful reading.', { event: 'correct-answer-reading' });

    setTimeout(function () {
      session.currentSentence += 1;
      session.sentenceAttempts = 0;
      session.inFlight = false;
      if (session.currentSentence >= p.sentences.length) {
        // Move to comprehension
        session.phase = 'comprehension';
        renderPassage();
        // Ask the question aloud
        setTimeout(function () {
          say('One question, Nigel. ' + p.comprehensionQuestion, { event: 'zone-enter' });
        }, 350);
      } else {
        renderPassage();
      }
    }, ADVANCE_DELAY_MS);
  }

  function handleSentenceMiss(json) {
    var p = session.passages[session.currentPassage];
    var sentence = p.sentences[session.currentSentence];

    // Record any error words for spaced repetition (per-word storage)
    try {
      if (Array.isArray(json.errorWords) && json.errorWords.length) {
        var stats;
        try { stats = JSON.parse(localStorage.getItem('ha_word_tower_words') || '{}'); }
        catch (_) { stats = {}; }
        json.errorWords.forEach(function (ew) {
          var w = String(ew && ew.expected || '').toLowerCase();
          if (!w) return;
          var e = stats[w] || { attempts: 0, correct: 0, lastSlip: null, lastSeen: null };
          e.attempts += 1;
          e.lastSlip = ew.issue || 'sentence-miss';
          e.lastSeen = new Date().toISOString();
          stats[w] = e;
          if (session.stats.struggledWords.indexOf(w) === -1) session.stats.struggledWords.push(w);
        });
        try { localStorage.setItem('ha_word_tower_words', JSON.stringify(stats)); } catch (_) {}
      }
    } catch (_) {}

    if (session.sentenceAttempts >= 2) {
      // Two misses: gentle move-on
      var moveOnLine = "That sentence was a tricky one — we will see it again soon. The sentence was: " + sentence;
      setMicState('ready');
      setStatus(moveOnLine, 'hint');
      say(moveOnLine + ' Let us keep going.', { event: 'try-again-reading' });
      session.stats.sentencesRead += 1;
      setTimeout(function () {
        session.currentSentence += 1;
        session.sentenceAttempts = 0;
        session.inFlight = false;
        if (session.currentSentence >= p.sentences.length) {
          session.phase = 'comprehension';
          renderPassage();
          setTimeout(function () {
            say('One question, Nigel. ' + p.comprehensionQuestion, { event: 'zone-enter' });
          }, 350);
        } else {
          renderPassage();
        }
      }, ADVANCE_DELAY_MS + 1500);
      return;
    }

    // First miss: highlight problem words, speak correction + slow replay of the sentence
    highlightErrors(json.errorWords);
    setMicState('failed');
    var correction = json.correctionLine || ('Let us try the whole sentence again, Nigel.');
    setStatus(correction, 'fail');
    say(correction + ' Listen one more time: ' + sentence + ' Now you try.', { event: 'try-again-reading' })
      .then(function () {
        $('st-tryagain-btn').hidden = false;
        session.inFlight = false;
      });
  }

  function highlightErrors(errorWords) {
    if (!Array.isArray(errorWords) || !errorWords.length) return;
    var current = document.querySelector('.st-sentence.current');
    if (!current) return;
    var text = current.textContent;
    // Build word -> highlight set
    var bad = {};
    errorWords.forEach(function (e) {
      var w = String(e && e.expected || '').toLowerCase().replace(/[^a-z]/g, '');
      if (w) bad[w] = true;
    });
    // Re-render with span highlights
    var html = text.split(/(\s+)/).map(function (token) {
      var clean = token.toLowerCase().replace(/[^a-z]/g, '');
      if (clean && bad[clean]) {
        return '<span class="st-word-err">' + token + '</span>';
      }
      return token;
    }).join('');
    current.innerHTML = html;
  }

  // ---- Assess comprehension answer ------------------------------------
  function assessComprehension(transcript) {
    var p = session.passages[session.currentPassage];
    session.comprehensionAttempts += 1;
    debug('assess comprehension attempt=' + session.comprehensionAttempts + ' transcript=' + JSON.stringify(transcript));

    fetch('/api/humphrey/assess-comprehension', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question: p.comprehensionQuestion,
        expectedAnswerHint: p.expectedAnswerHint,
        transcript: transcript,
        passage: p.sentences,
        kidName: 'Nigel'
      })
    }).then(function (r) { return r.json(); }).then(function (json) {
      if (json.passed) {
        handleComprehensionPass(json);
      } else {
        handleComprehensionMiss(json);
      }
    }).catch(function (err) {
      debug('comprehension fetch failed:', err);
      setStatus('My brain hiccupped. Tap to try once more.', 'error');
      setMicState('ready');
      session.inFlight = false;
    });
  }

  function handleComprehensionPass(json) {
    session.stats.comprehensionPassed += 1;
    setMicState('passed');
    setStatus(json.feedbackLine || 'Yes!', 'pass');
    burstConfetti();
    say(json.feedbackLine || 'Yes, perfect, Nigel!', { event: 'correct-answer-reading' });
    session.stats.passagesCompleted += 1;
    setTimeout(advancePassageOrEnd, ADVANCE_DELAY_MS + 600);
  }

  function handleComprehensionMiss(json) {
    if (session.comprehensionAttempts >= 2) {
      // Move on without revealing answer outright
      setMicState('ready');
      setStatus(json.feedbackLine || 'That was a tricky one. Let us keep going.', 'hint');
      say((json.feedbackLine || 'That was a tricky one') + ' Let us read another story.',
          { event: 'try-again-reading' });
      session.stats.passagesCompleted += 1;
      setTimeout(advancePassageOrEnd, ADVANCE_DELAY_MS + 800);
      return;
    }
    setMicState('failed');
    setStatus(json.feedbackLine || 'Take another look at the story and try again.', 'fail');
    say(json.feedbackLine || 'Take another look at the story and try again.', { event: 'try-again-reading' })
      .then(function () {
        $('st-tryagain-btn').hidden = false;
        session.inFlight = false;
      });
  }

  function advancePassageOrEnd() {
    session.inFlight = false;
    session.currentPassage += 1;
    if (session.stats.passagesCompleted >= TARGET_PASSAGES) {
      showEnd();
    } else {
      generatePassage();
    }
  }

  // ---- End screen ------------------------------------------------------
  function showEnd() {
    $('st-stage').hidden = true;
    var card = $('st-end-card');
    if (!card) return;
    card.hidden = false;
    var s = session.stats;
    $('st-end-stats').innerHTML =
      '<div class="st-end-line"><strong>' + s.passagesCompleted + '</strong> stories read</div>' +
      '<div class="st-end-line"><strong>' + s.sentencesFirstTry + '</strong> sentences on the first try</div>' +
      '<div class="st-end-line"><strong>' + s.comprehensionPassed + '</strong> questions answered correctly</div>' +
      (s.struggledWords.length
        ? '<div class="st-end-line st-end-line--soft">Words to practice: ' + s.struggledWords.join(', ') + '</div>'
        : '<div class="st-end-line st-end-line--soft">No stumbles — beautiful reading!</div>');
    persistSessionSummary();
    var line = s.comprehensionPassed === s.passagesCompleted && s.struggledWords.length === 0
      ? "You read every story beautifully, Nigel, and you understood every one. I am so proud."
      : "Wonderful reading, Nigel. We will pick up right where we left off next time.";
    say(line, { event: 'correct-answer-reading' });
    burstConfetti();
  }

  function persistSessionSummary() {
    try {
      if (!NS.Memory || typeof NS.Memory.addCustomSummary !== 'function') return;
      var s = session.stats;
      var line = 'Nigel did a Story Time read-aloud session today. He read ' + s.passagesCompleted +
                 ' passages with ' + s.sentencesFirstTry + ' sentences nailed on the first try, and ' +
                 'answered ' + s.comprehensionPassed + ' comprehension questions correctly.' +
                 (s.struggledWords.length
                   ? ' He stumbled on these words: ' + s.struggledWords.join(', ') + '. Be ready to circle back to those.'
                   : ' No stumbles — he was on fire.');
      NS.Memory.addCustomSummary(line);
      debug('session summary saved:', line);
    } catch (e) { debug('summary save failed:', e && e.message); }
  }

  // ---- Buttons --------------------------------------------------------
  function onTryAgain() {
    $('st-tryagain-btn').hidden = true;
    setMicState('ready');
    setStatus('', null);
    // Re-render to clear error highlights
    renderPassage();
  }

  function onRestart() {
    session = {
      passages: [],
      currentPassage: 0,
      currentSentence: 0,
      phase: 'reading',
      sentenceAttempts: 0,
      comprehensionAttempts: 0,
      stats: {
        passagesCompleted: 0,
        sentencesRead: 0,
        sentencesFirstTry: 0,
        comprehensionPassed: 0,
        struggledWords: []
      },
      inFlight: false,
      lastTap: 0
    };
    $('st-end-card').hidden = true;
    generatePassage();
  }

  // ---- Boot -----------------------------------------------------------
  function boot() {
    var mic = $('st-mic-btn');     if (mic)     mic.addEventListener('click', onMicTap);
    var done = $('st-done-btn');   if (done)    done.addEventListener('click', onDoneTap);
    var ta = $('st-tryagain-btn'); if (ta)      ta.addEventListener('click', onTryAgain);
    var restart = $('st-restart-btn'); if (restart) restart.addEventListener('click', onRestart);

    generatePassage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  NS.StoryTime = { boot: boot, _session: session };
})();
