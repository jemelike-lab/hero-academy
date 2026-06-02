/**
 * Hero Academy — Discovery Dome (Science) session controller.
 *
 * Reuses the Number Lab problem-card chassis (same DOM ids, same CSS). For
 * each card: Ms. Humphrey reads the fact aloud, then Nigel picks the right
 * answer from four choices. 2-strike rule (handoff §0 pedagogy):
 *   1st wrong  -> wrong-answer-reading style line + try again
 *   2nd wrong  -> Ms. Humphrey scaffolds with the fact restated, then the
 *                  correct button pulses and unlocks
 *
 * Stats:
 *   ha_science_cards_seen — array of card ids ever shown (for variety)
 *   ha_science_topic_stats — { topic: { seen, correct }, ... }
 *   ha_science_session_count — bumps each session for spaced repetition
 *
 * Public surface: window.HeroAcademy.DiscoveryDome.{ boot, _session }.
 */
(function () {
  'use strict';
  var NS = (window.HeroAcademy = window.HeroAcademy || {});

  var CARDS_PER_SESSION = 6;
  var STORAGE_SEEN = 'ha_science_cards_seen';
  var STORAGE_TOPIC = 'ha_science_topic_stats';
  var STORAGE_SESSIONS = 'ha_science_session_count';
  var STATE_KEY = 'hero_academy_state_v1';

  var session = {
    queue: [],
    index: 0,
    current: null,            // current card object
    strikesOnCard: 0,
    correctThisSession: 0,
    cardsCompleted: 0,
    startedAt: 0,
  };

  // --- Tiny helpers --------------------------------------------------------

  function $(id) { return document.getElementById(id); }

  function safeJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function safeSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function getGlobalState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveGlobalState(s) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  // --- Card selection ------------------------------------------------------

  /**
   * Pick CARDS_PER_SESSION cards with a bias toward variety:
   *   1. Prefer unseen cards first.
   *   2. If we run out, fall back to least-recently-seen.
   *   3. Try to spread across topic clusters — no more than 2 from the same
   *      topic in one session unless we have to.
   */
  function pickSessionCards() {
    var SC = NS.ScienceCards;
    if (!SC) {
      console.error('[DiscoveryDome] ScienceCards data not loaded');
      return [];
    }
    var all = SC.all();
    var seen = safeJSON(STORAGE_SEEN, []);
    var seenSet = {};
    seen.forEach(function (id) { seenSet[id] = true; });

    // Bucket into unseen vs seen, shuffled.
    var unseen = shuffle(all.filter(function (c) { return !seenSet[c.id]; }));
    var seenCards = shuffle(all.filter(function (c) { return seenSet[c.id]; }));

    var pool = unseen.concat(seenCards);
    var picked = [];
    var topicCounts = {};

    for (var i = 0; i < pool.length && picked.length < CARDS_PER_SESSION; i++) {
      var c = pool[i];
      if ((topicCounts[c.topic] || 0) >= 2) continue;
      picked.push(c);
      topicCounts[c.topic] = (topicCounts[c.topic] || 0) + 1;
    }
    // Top up if topic cap left us short
    if (picked.length < CARDS_PER_SESSION) {
      var pickedIds = {};
      picked.forEach(function (c) { pickedIds[c.id] = true; });
      for (var j = 0; j < pool.length && picked.length < CARDS_PER_SESSION; j++) {
        if (!pickedIds[pool[j].id]) picked.push(pool[j]);
      }
    }
    return picked;
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // --- Rendering -----------------------------------------------------------

  function showCard(card) {
    session.current = card;
    session.strikesOnCard = 0;

    // Show problem panel, hide others
    $('exampleCard').hidden = true;
    $('problemCard').hidden = false;
    $('masteryCard').hidden = true;

    // Header / progress
    $('currentSkillName').textContent = NS.ScienceCards.topics[card.topic].label;
    $('problemNum').textContent = (session.index + 1) + ' / ' + session.queue.length;
    renderProgressDots();

    // The card itself — emoji + title + fact + question
    var pq = $('problemQuestion');
    pq.innerHTML =
      '<div class="dd-card-emoji" aria-hidden="true">' + card.emoji + '</div>' +
      '<div class="dd-card-title">' + escapeHTML(card.title) + '</div>' +
      '<div class="dd-card-fact">' + escapeHTML(card.fact) + '</div>' +
      '<div class="dd-card-question">' + escapeHTML(card.question) + '</div>';

    // Ralphie & state
    var r = $('labRalphie');
    r.src = 'assets/ralphie/ralphie_magnifying.webp';
    r.classList.remove('celebrate', 'shake');
    $('labSpeech').hidden = true;

    // Build answer buttons — shuffle order so the correct index isn't always
    // in the same slot. We remember which button is the correct one.
    var choices = card.choices.map(function (text, idx) { return { text: text, isCorrect: idx === card.answer }; });
    var ordered = shuffle(choices);
    var ch = $('answerChoices');
    ch.innerHTML = '';
    ordered.forEach(function (item) {
      var btn = document.createElement('button');
      btn.className = 'answer-btn';
      btn.textContent = item.text;
      btn.onclick = function () { handleAnswer(item.isCorrect, btn); };
      ch.appendChild(btn);
    });

    // Feedback + hint UI
    $('feedback').hidden = true;
    $('hintBtn').classList.remove('visible');
    $('hintDisplay').hidden = true;

    // Ms. Humphrey reads the fact aloud as soon as the card lands.
    var H = NS.Humphrey;
    if (H && typeof H.say === 'function') {
      // Use try-again-reading event to pick the right expression. Fact is the
      // text override so it plays as-written. Light expression: encouraging.
      H.say('try-again-reading', {
        kidName: 'Nigel',
        expression: 'encouraging',
        text: card.fact,
      });
    }
  }

  function renderProgressDots() {
    var c = $('masteryDots');
    if (!c) return;
    c.innerHTML = '';
    for (var i = 0; i < session.queue.length; i++) {
      var d = document.createElement('div');
      d.className = 'mastery-dot' + (i < session.index ? ' filled' : '');
      c.appendChild(d);
    }
  }

  function escapeHTML(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // --- Answer handling -----------------------------------------------------

  function handleAnswer(isCorrect, btn) {
    document.querySelectorAll('.answer-btn').forEach(function (b) { b.disabled = true; });
    if (isCorrect) handleCorrect(btn);
    else handleWrong(btn);
  }

  function handleCorrect(btn) {
    btn.classList.add('correct');
    var r = $('labRalphie');
    r.src = 'assets/ralphie/ralphie_cheering.webp';
    r.classList.add('celebrate');

    var fb = $('feedback');
    fb.className = 'feedback success';
    fb.innerHTML = '<span class="feedback-emoji">⚡</span>That\'s right!';
    fb.hidden = false;

    if (session.strikesOnCard === 0) {
      session.correctThisSession += 1;
      session.currentStreak += 1;
      if (session.currentStreak > session.longestStreakEver) session.longestStreakEver = session.currentStreak;
      bumpTopicStats(session.current.topic, true);
    } else {
      session.currentStreak = 0;
    }
    session.cardsCompleted += 1;
    markCardSeen(session.current.id);
    if (NS.Telemetry) {
      NS.Telemetry.recordAttempt(
        true,
        session.current && (session.current.title + ' — ' + session.current.question),
        session.current && session.current.choices[session.current.answer],
        btn && btn.textContent
      );
      // Mirror to per-card content bank so server-side seen_count + mastery
      // tracking advances. Static-fallback cards skip this branch.
      if (session.current && session.current.id && typeof NS.Telemetry.rpc === 'function') {
        NS.Telemetry.rpc('ha_mark_discovery_attempt', {
          p_item_id: session.current.id, p_correct: true
        }).catch(function () {});
      }
    }

    // Humphrey celebrates — reading-flavored variant works well for fact
    // recall ("Beautiful reading" not really fitting; use generic correct-answer
    // which has a wider variant pool for science recall too).
    var H = NS.Humphrey;
    if (H) H.say('correct-answer', { kidName: 'Nigel' });

    saveSession();
    setTimeout(advanceOrFinish, 1400);
  }

  function handleWrong(btn) {
    btn.classList.add('wrong');
    session.strikesOnCard += 1;
    var r = $('labRalphie');
    r.src = 'assets/ralphie/ralphie_sad.webp';
    r.classList.add('shake');
    setTimeout(function () { r.classList.remove('shake'); }, 500);

    var H = NS.Humphrey;
    var fb = $('feedback');

    if (session.strikesOnCard === 1 && (session.difficulty || 2) > 1) {
      session.currentStreak = 0;  // wrong answer resets the streak
      // First strike — gentle nudge, re-enable the non-wrong buttons
      if (NS.Telemetry) {
        NS.Telemetry.recordAttempt(
          false,
          session.current && (session.current.title + ' — ' + session.current.question),
          session.current && session.current.choices[session.current.answer],
          btn && btn.textContent
        );
        // Mirror miss to content bank — resets the 5-correct streak.
        if (session.current && session.current.id && typeof NS.Telemetry.rpc === 'function') {
          NS.Telemetry.rpc('ha_mark_discovery_attempt', {
            p_item_id: session.current.id, p_correct: false
          }).catch(function () {});
        }
      }
      if (H) H.say('wrong-answer-reading', { kidName: 'Nigel' });
      fb.className = 'feedback tryAgain';
      fb.innerHTML = '<span class="feedback-emoji">🤔</span>Take another look — you can find it.';
      fb.hidden = false;
      setTimeout(function () {
        document.querySelectorAll('.answer-btn').forEach(function (b) {
          if (!b.classList.contains('wrong')) b.disabled = false;
        });
      }, 1000);
    } else {
      // Second strike (or first strike at difficulty 1) — Ms. Humphrey
      // walks through the answer immediately and unlocks the correct button.
      session.currentStreak = 0;
      var card = session.current;
      var correctText = card.choices[card.answer];
      var scaffold = 'Let me help, Nigel. ' + card.fact + ' So the right answer is: ' + correctText + '. Tap it to lock it in.';
      if (H) H.say('try-again-reading', { kidName: 'Nigel', text: scaffold, expression: 'encouraging' });

      fb.className = 'feedback scaffold';
      fb.innerHTML =
        '<span class="feedback-emoji">👩‍🏫</span><strong>Let me show you, Nigel.</strong><br><br>' +
        escapeHTML(card.fact) + '<br><br>' +
        'The answer is <strong>' + escapeHTML(correctText) + '</strong>. Tap it to lock it in.';
      fb.hidden = false;

      bumpTopicStats(card.topic, false);

      setTimeout(function () {
        document.querySelectorAll('.answer-btn').forEach(function (b) {
          if (b.textContent === correctText) {
            b.disabled = false;
            b.style.animation = 'correct-pulse 1.2s ease-in-out infinite';
            b.style.borderColor = 'var(--gold)';
            b.style.boxShadow = '0 0 24px rgba(255,209,71,0.6)';
            b.onclick = function () {
              b.style.animation = '';
              b.classList.add('correct');
              session.cardsCompleted += 1;
              markCardSeen(card.id);
              saveSession();
              setTimeout(advanceOrFinish, 1000);
            };
          }
        });
      }, 1800);
    }
  }

  // --- Session lifecycle ---------------------------------------------------

  function advanceOrFinish() {
    session.index += 1;
    if (session.index >= session.queue.length) {
      showCompletion();
    } else {
      showCard(session.queue[session.index]);
    }
  }

  function showCompletion() {
    $('problemCard').hidden = true;
    $('masteryCard').hidden = false;

    var passed = session.correctThisSession;
    var total = session.queue.length;
    var pct = Math.round((passed / total) * 100);

    var titleEl = document.querySelector('.mastery-title');
    if (titleEl) titleEl.textContent = passed === total ? 'PERFECT SCORE!' : 'GREAT SESSION!';
    $('masterySkillName').textContent =
      'You got ' + passed + ' out of ' + total + ' on the first try.';

    // Roll into the dashboard zone progress so the discovery card on the home
    // page shows real progress over time. +15% per session, capped at 100.
    var g = getGlobalState();
    g.zoneProgress = g.zoneProgress || {};
    g.zoneProgress.discovery = Math.min(100, (g.zoneProgress.discovery || 0) + 15);
    g.coins = (g.coins || 0) + Math.max(3, passed);
    g.zonesCompletedToday = Math.min(3, (g.zonesCompletedToday || 0) + 1);
    saveGlobalState(g);

    // Session summary into Ms. Humphrey's memory so she remembers what they
    // covered. Powers "what did we do yesterday" recall later.
    persistSessionSummary(passed, total);

    // Mastery celebration line — Humphrey speaks once with topic context.
    var topicCounts = {};
    session.queue.forEach(function (c) { topicCounts[c.topic] = (topicCounts[c.topic] || 0) + 1; });
    var topTopic = Object.keys(topicCounts).sort(function (a, b) { return topicCounts[b] - topicCounts[a]; })[0];
    var topicLabel = topTopic ? NS.ScienceCards.topics[topTopic].label.toLowerCase() : 'science';

    var H = NS.Humphrey;
    if (H) {
      var line = passed === total
        ? 'A perfect score on ' + topicLabel + ', Nigel! Beautiful work.'
        : 'Great job, Nigel. You got ' + passed + ' out of ' + total + ' on ' + topicLabel + '. We will get the others next time.';
      H.say('mastery-achieved', { kidName: 'Nigel', topic: topicLabel, text: line });
    }
    burstConfetti();

    // Buttons
    var nextBtn = $('masteryNext');
    var restBtn = $('masteryRest');
    if (nextBtn) {
      nextBtn.textContent = 'ANOTHER ROUND!';
      nextBtn.onclick = function () {
        // Fresh session — try server first, fall back to static pick
        session = newSession();
        loadServerQueue().then(function (q) {
          session.queue = (q && q.length > 0) ? q : pickSessionCards();
          if (session.queue.length === 0) {
            showAllSeen();
            return;
          }
          session.index = 0;
          showCard(session.queue[0]);
          maybeTopUpDiscoveryPool();
        }).catch(function () {
          session.queue = pickSessionCards();
          if (session.queue.length === 0) {
            showAllSeen();
            return;
          }
          session.index = 0;
          showCard(session.queue[0]);
        });
      };
    }
    if (restBtn) {
      restBtn.textContent = 'TAKE A BREAK';
      restBtn.onclick = function () { window.location.href = 'index.html'; };
      restBtn.hidden = false;
    }

    // Fire character-progression check — may surface an episode unlock.
    if (NS.Characters && typeof NS.Characters.recordSessionComplete === 'function') {
      setTimeout(function () {
        NS.Characters.recordSessionComplete('discoverydome',{items_attempted:session.queue.length,items_correct_first_try:session.correctThisSession,longest_streak:session.longestStreakEver}).catch(function () {});
      }, 1500);
    }
  }

  function showAllSeen() {
    var titleEl = document.querySelector('.mastery-title');
    if (titleEl) titleEl.textContent = 'YOU\'VE SEEN THEM ALL!';
    $('masterySkillName').textContent =
      'Amazing, Nigel — you have explored all ' + NS.ScienceCards.count + ' science cards.';
    var nb = $('masteryNext');
    if (nb) {
      nb.textContent = 'BACK TO MAP';
      nb.onclick = function () { window.location.href = 'index.html'; };
    }
    var rb = $('masteryRest');
    if (rb) rb.hidden = true;
  }

  // --- Persistence ---------------------------------------------------------

  function markCardSeen(id) {
    var seen = safeJSON(STORAGE_SEEN, []);
    if (seen.indexOf(id) === -1) seen.push(id);
    safeSet(STORAGE_SEEN, seen);
  }

  function bumpTopicStats(topic, gotItRight) {
    var stats = safeJSON(STORAGE_TOPIC, {});
    if (!stats[topic]) stats[topic] = { seen: 0, correct: 0 };
    stats[topic].seen += 1;
    if (gotItRight) stats[topic].correct += 1;
    safeSet(STORAGE_TOPIC, stats);
  }

  function saveSession() {
    // Cheap incremental save — number of sessions started today
    var n = (safeJSON(STORAGE_SESSIONS, 0) || 0);
    if (session.index === 0 && session.cardsCompleted === 1) {
      safeSet(STORAGE_SESSIONS, n + 1);
    }
  }

  function persistSessionSummary(passed, total) {
    try {
      var M = NS.Memory;
      if (!M || typeof M.addCustomSummary !== 'function') return;
      var topics = {};
      session.queue.forEach(function (c) {
        topics[c.topic] = (topics[c.topic] || 0) + 1;
      });
      var topicNames = Object.keys(topics).map(function (t) {
        return NS.ScienceCards.topics[t].label.toLowerCase();
      });
      var summary =
        'Nigel did a Discovery Dome science session today. He answered ' +
        passed + ' out of ' + total + ' questions correctly. Topics covered: ' +
        topicNames.join(', ') + '.';
      M.addCustomSummary(summary);
    } catch (e) {
      console.warn('[DiscoveryDome] could not persist summary', e);
    }
  }

  // --- Boot ----------------------------------------------------------------

  function newSession() {
    return {
      queue: [],
      index: 0,
      current: null,
      strikesOnCard: 0,
      correctThisSession: 0,    // first-try correct count
      currentStreak: 0,         // running first-try streak
      longestStreakEver: 0,     // peak streak this session
      cardsCompleted: 0,
      difficulty: 2,            // loaded async from ha_get_difficulty
      startedAt: Date.now(),
    };
  }

  function boot() {
    if (!NS.ScienceCards) {
      console.error('[DiscoveryDome] science-cards.js did not load');
      return;
    }
    session = newSession();

    // Try the Supabase content bank first; fall back to static pick on any
    // failure or empty pool. The kid never waits — we render a holding
    // placeholder for ~250ms while the server resolves.
    loadServerQueue().then(function (q) {
      session.queue = (q && q.length > 0) ? q : pickSessionCards();
      if (session.queue.length === 0) {
        showAllSeen();
        return;
      }
      showCard(session.queue[0]);
      setupHumphreyIdleWatcher();
      wireHumphreyButton();
      maybeTopUpDiscoveryPool();
    }).catch(function () {
      session.queue = pickSessionCards();
      if (session.queue.length === 0) {
        showAllSeen();
        return;
      }
      showCard(session.queue[0]);
      setupHumphreyIdleWatcher();
      wireHumphreyButton();
    });
  }

  // --- Server content bank --------------------------------------------------

  // Map a server-shape row into the client-shape card the rest of the file
  // expects. Server uses answer_index (0-3); existing client cards use answer.
  function mapServerCard(row) {
    return {
      id: row.id,
      topic: row.topic,
      emoji: row.emoji || '',
      title: row.title || '',
      fact: row.fact || '',
      question: row.question || '',
      choices: Array.isArray(row.choices) ? row.choices.slice() : [],
      answer: Number.isInteger(row.answer_index) ? row.answer_index : 0,
      standard: row.standard || '',
      _server: true,
    };
  }

  function loadServerQueue() {
    var T = NS.Telemetry;
    if (!T || typeof T.rpc !== 'function') return Promise.resolve(null);
    // Block on pool warmup if unseen pool is critically thin; also fetch
    // the current difficulty level for adaptive scaffolds.
    var prep = Promise.resolve(true);
    if (typeof T.warmupPool === 'function') {
      prep = T.warmupPool({
        statusRpc: 'ha_discovery_pool_status',
        statusArgs: { p_child_id: T.childId(), p_topic: null },
        generatorPath: '/api/humphrey/generate-discovery-cards',
        generatorBody: { child_id: T.childId(), target_count: 20 },
      });
    }
    return prep.then(function () {
      return T.rpc('ha_get_difficulty', { p_child_id: T.childId(), p_zone: 'discoverydome' });
    }).then(function (dr) {
      if (dr && dr.ok) {
        return dr.json().then(function (dv) {
          session.difficulty = (typeof dv === 'number') ? dv : (Array.isArray(dv) && dv[0]) || 2;
        });
      }
    }).catch(function () {}).then(function () {
      return T.rpc('ha_get_discovery_cards', {
      p_child_id: T.childId(),
      p_n: 6,
      p_topic: null
    }).then(function (r) {
      if (!r || !r.ok) return null;
      return r.json();
    }).then(function (rows) {
      if (!Array.isArray(rows) || rows.length === 0) return null;
      return rows.map(mapServerCard);
    });
    });
  }

  function maybeTopUpDiscoveryPool() {
    var T = NS.Telemetry;
    if (!T || typeof T.rpc !== 'function') return;
    T.rpc('ha_discovery_pool_status', {
      p_child_id: T.childId(),
      p_topic: null
    }).then(function (r) {
      if (!r || !r.ok) return null;
      return r.json();
    }).then(function (rows) {
      var s = Array.isArray(rows) ? rows[0] : rows;
      if (!s) return;
      if ((s.unseen || 0) >= 30) return;
      fetch('/api/humphrey/generate-discovery-cards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          child_id: T.childId(),
          target_count: 10
        }),
        keepalive: true
      }).catch(function () {});
    }).catch(function () {});
  }

  function wireHumphreyButton() {
    var btn = $('humphreyBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      btn.classList.add('speaking');
      var H = NS.Humphrey;
      if (H) {
        var line = session.current
          ? 'Take your time, Nigel. Listen to the fact, then pick the answer you think fits best.'
          : 'Hi Nigel, I am Ms. Humphrey. Ready when you are.';
        H.say('intro', { kidName: 'Nigel', text: line });
      }
      setTimeout(function () { btn.classList.remove('speaking'); }, 2200);
    });
  }

  function setupHumphreyIdleWatcher() {
    var H = NS.Humphrey;
    if (!H || typeof H.startIdleWatcher !== 'function') return;
    var IDLE_MS = 15000;
    var cooldownUntil = 0;
    H.on('idle-too-long', async function () {
      try {
        if (!session.current) return;
        if (Date.now() < cooldownUntil) return;
        cooldownUntil = Date.now() + 30000;
        await H.say('idle-too-long-reading', { kidName: 'Nigel' });
      } catch (e) { console.warn('[idle handler]', e); }
    });
    H.startIdleWatcher(IDLE_MS, 'idle-too-long');
  }

  function burstConfetti() {
    var colors = ['#ffd147', '#ec4899', '#4287ff', '#2ec27e', '#a855f7', '#ff8b3d'];
    var ct = document.createElement('div');
    ct.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:200;overflow:hidden';
    for (var i = 0; i < 70; i++) {
      var p = document.createElement('div');
      var sz = 6 + Math.random() * 10;
      var cl = colors[Math.floor(Math.random() * colors.length)];
      var sx = 20 + Math.random() * 60;
      var dr = (Math.random() - 0.5) * 70;
      var rt = Math.random() * 720;
      var du = 1.5 + Math.random() * 1.2;
      p.style.cssText =
        'position:absolute;left:' + sx + '%;top:40%;width:' + sz + 'px;height:' + sz +
        'px;background:' + cl + ';border-radius:' + (Math.random() > 0.5 ? '50%' : '2px') +
        ';animation:confetti-fall ' + du + 's ' + Math.random() * 0.4 +
        's cubic-bezier(0.2,0.7,0.3,1) forwards;--drift:' + dr + 'vw;--rot:' + rt + 'deg;';
      ct.appendChild(p);
    }
    document.body.appendChild(ct);
    setTimeout(function () { ct.remove(); }, 3500);
  }

  // Inject confetti + card layout styles once
  (function injectStyles() {
    var s = document.createElement('style');
    s.textContent =
      '@keyframes confetti-fall{0%{transform:translate(0,-50vh) rotate(0);opacity:1}' +
      '100%{transform:translate(var(--drift),80vh) rotate(var(--rot));opacity:0}}' +
      '.dd-card-emoji{font-size:64px;line-height:1;text-align:center;margin:8px 0 6px}' +
      '.dd-card-title{font-family:Fredoka,system-ui,sans-serif;font-weight:700;' +
      'font-size:1.6rem;text-align:center;color:var(--gold,#ffd147);margin:0 0 12px}' +
      '.dd-card-fact{font-size:1.05rem;line-height:1.45;text-align:center;' +
      'padding:0 8px;margin-bottom:18px;color:var(--ink-on-dark,#f5e8c8)}' +
      '.dd-card-question{font-weight:700;font-size:1.15rem;text-align:center;' +
      'margin-top:8px;color:#fff}' +
      '#problemQuestion{text-align:center}';
    document.head.appendChild(s);
  })();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  NS.DiscoveryDome = { boot: boot, _session: function () { return session; } };
})();
