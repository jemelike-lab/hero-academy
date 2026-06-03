/**
 * Hero Academy — Real-world Quests (Build #7 v1).
 *
 * Ms. Humphrey issues a quest that takes Nigel OFF the screen for 30s-3min,
 * then back to report what he found. Anchors learning to the physical
 * world — the structural advantage homeschool has over pure-screen apps.
 *
 * V1 flow:
 *   1. Tap quest tile on home page
 *   2. Modal opens — Ms. Humphrey says the quest text aloud
 *   3. Nigel taps START → countdown timer begins
 *   4. He goes does the thing in real life
 *   5. Taps "I'm back!" → answer prompt (number or short text)
 *   6. Submits → Humphrey celebrates → recorded to ha_real_world_quests
 *
 * Public API:
 *   HeroAcademy.Quests.init({ container, tileId })
 *   HeroAcademy.Quests.openRandom()
 *   HeroAcademy.Quests.openQuest(questKey)
 *
 * Camera capture is intentionally OUT OF SCOPE for v1 — added in v2 once
 * iPad PWA permission UX is validated.
 */
(function () {
  'use strict';
  var NS = window.HeroAcademy = window.HeroAcademy || {};
  if (NS.Quests) return;

  // ---- Seed quest catalog ---------------------------------------------------
  // Each quest is age-7-appropriate and achievable in 30s–3 min indoors.
  // category drives the celebration tone + future Saturday-email grouping.
  var QUESTS = [
    { key: 'count_spoons',   text: 'Go count the spoons in the kitchen drawer.',         category: 'counting',    target_seconds:  90, answer_kind: 'number' },
    { key: 'find_blue',      text: 'Find something blue in your room.',                  category: 'color',       target_seconds:  60, answer_kind: 'text'   },
    { key: 'count_windows',  text: 'Count how many windows are in your house.',          category: 'counting',    target_seconds: 120, answer_kind: 'number' },
    { key: 'find_leaf',      text: 'Find a leaf with 5 points (or close!).',             category: 'observation', target_seconds: 180, answer_kind: 'text'   },
    { key: 'find_wheels',    text: 'Find something with 4 wheels (other than a car).',   category: 'observation', target_seconds: 120, answer_kind: 'text'   },
    { key: 'count_books',    text: 'Count how many books are on one of your shelves.',   category: 'counting',    target_seconds:  90, answer_kind: 'number' },
    { key: 'letter_s',       text: 'Find something that starts with the letter S.',      category: 'letter',      target_seconds:  60, answer_kind: 'text'   },
    { key: 'find_rock',      text: 'Find a rock smaller than your thumb (outside).',     category: 'observation', target_seconds: 180, answer_kind: 'text'   },
    { key: 'count_chairs',   text: 'Count the chairs at the dining table.',              category: 'counting',    target_seconds:  30, answer_kind: 'number' },
    { key: 'find_round',     text: 'Find something perfectly round in your house.',      category: 'observation', target_seconds:  90, answer_kind: 'text'   },
  ];

  function pickRandom() {
    // Avoid repeating the same quest twice in a row.
    var lastKey = null;
    try { lastKey = localStorage.getItem('ha_quest_last_key'); } catch (e) {}
    var pool = QUESTS.filter(function (q) { return q.key !== lastKey; });
    if (!pool.length) pool = QUESTS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function pickByKey(key) {
    return QUESTS.find(function (q) { return q.key === key; }) || null;
  }

  // ---- State ----------------------------------------------------------------
  var state = {
    inited:   false,
    tile:     null,
    overlay:  null,
    quest:    null,
    questId:  null,
    timer:    null,
    timerEndsAt: 0,
  };

  // ---- Modal UI -------------------------------------------------------------

  function buildOverlay() {
    if (state.overlay) return state.overlay;
    var ov = document.createElement('div');
    ov.id = 'questOverlay';
    ov.className = 'quest-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', 'Real-world quest');
    ov.innerHTML = [
      '<div class="quest-overlay__backdrop"></div>',
      '<div class="quest-overlay__card">',
      '  <button type="button" class="quest-overlay__close" aria-label="Close quest">\u2715</button>',
      '  <div class="quest-overlay__eyebrow">\ud83c\udf1f Real-world Quest</div>',
      '  <div class="quest-overlay__category" data-quest-category></div>',
      '  <h2 class="quest-overlay__text" data-quest-text></h2>',
      '  <div class="quest-overlay__timer" data-quest-timer hidden>',
      '    <div class="quest-overlay__timer-clock" data-quest-clock>00:00</div>',
      '    <div class="quest-overlay__timer-bar"><div class="quest-overlay__timer-fill" data-quest-fill></div></div>',
      '  </div>',
      '  <div class="quest-overlay__actions" data-quest-actions>',
      '    <button type="button" class="quest-overlay__cta" data-quest-start>Start the quest!</button>',
      '    <button type="button" class="quest-overlay__skip" data-quest-skip>Pick a different one</button>',
      '  </div>',
      '  <div class="quest-overlay__return" data-quest-return hidden>',
      '    <button type="button" class="quest-overlay__cta quest-overlay__cta--green" data-quest-done>I\u2019m back!</button>',
      '  </div>',
      '  <div class="quest-overlay__answer" data-quest-answer-block hidden>',
      '    <label class="quest-overlay__answer-label" for="questAnswerInput" data-quest-answer-label>How many did you find?</label>',
      '    <input type="text" id="questAnswerInput" class="quest-overlay__answer-input" data-quest-answer-input autocomplete="off" inputmode="text">',
      '    <button type="button" class="quest-overlay__cta" data-quest-submit>Tell Ms. Humphrey</button>',
      '  </div>',
      '  <div class="quest-overlay__done" data-quest-done-block hidden>',
      '    <div class="quest-overlay__done-emoji">\ud83c\udf89</div>',
      '    <div class="quest-overlay__done-headline">Awesome quest, Nigel!</div>',
      '    <div class="quest-overlay__done-sub" data-quest-done-sub></div>',
      '    <button type="button" class="quest-overlay__cta" data-quest-close>Back to home</button>',
      '  </div>',
      '</div>',
    ].join('');
    document.body.appendChild(ov);
    state.overlay = ov;

    // Wire close + skip + start + done + submit
    var $ = function (sel) { return ov.querySelector(sel); };
    $('.quest-overlay__close').addEventListener('click', closeOverlay);
    $('[data-quest-skip]').addEventListener('click', function () {
      var current = state.quest && state.quest.key;
      var next;
      // Pick a different one than current
      do { next = pickRandom(); } while (current && next.key === current && QUESTS.length > 1);
      renderQuest(next);
    });
    $('[data-quest-start]').addEventListener('click', startTimer);
    $('[data-quest-done]').addEventListener('click', stopTimer);
    $('[data-quest-submit]').addEventListener('click', submitAnswer);
    $('[data-quest-close]').addEventListener('click', closeOverlay);
    return ov;
  }

  function renderQuest(quest) {
    state.quest = quest;
    var ov = buildOverlay();
    ov.querySelector('[data-quest-text]').textContent = quest.text;
    ov.querySelector('[data-quest-category]').textContent =
      ({ counting: 'COUNTING', color: 'COLOR HUNT', letter: 'LETTER HUNT', observation: 'OBSERVATION' }[quest.category] || 'QUEST');
    // Reset phases
    ov.querySelector('[data-quest-actions]').hidden = false;
    ov.querySelector('[data-quest-return]').hidden = true;
    ov.querySelector('[data-quest-timer]').hidden = true;
    ov.querySelector('[data-quest-answer-block]').hidden = true;
    ov.querySelector('[data-quest-done-block]').hidden = true;
  }

  function openOverlay() {
    var ov = state.overlay;
    if (!ov) return;
    ov.classList.add('quest-overlay--in');
  }

  function closeOverlay() {
    var ov = state.overlay;
    if (!ov) return;
    ov.classList.remove('quest-overlay--in');
    clearInterval(state.timer); state.timer = null;
    // After fade-out, fully reset state for next time
    setTimeout(function () {
      state.quest = null;
      state.questId = null;
    }, 320);
  }

  // ---- Phase 2: timer -------------------------------------------------------
  function startTimer() {
    var ov = state.overlay;
    var quest = state.quest;
    if (!quest) return;
    // Hide the start actions, show timer + "I'm back" button
    ov.querySelector('[data-quest-actions]').hidden = true;
    ov.querySelector('[data-quest-timer]').hidden = false;
    ov.querySelector('[data-quest-return]').hidden = false;

    // Persist start in DB (fire-and-forget)
    persistStart(quest);

    // Humphrey announces the quest aloud
    speak('quest_start',
      'Okay Nigel \u2014 ' + quest.text + ' I will wait right here. Come back when you are ready.',
      'encouraging');

    // Countdown
    state.timerEndsAt = Date.now() + quest.target_seconds * 1000;
    updateTimer();
    state.timer = setInterval(updateTimer, 250);
  }

  function updateTimer() {
    var ov = state.overlay;
    var quest = state.quest;
    if (!quest) return;
    var remaining = Math.max(0, Math.round((state.timerEndsAt - Date.now()) / 1000));
    var mm = Math.floor(remaining / 60);
    var ss = remaining % 60;
    ov.querySelector('[data-quest-clock]').textContent =
      String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
    var pct = 100 * (1 - remaining / quest.target_seconds);
    ov.querySelector('[data-quest-fill]').style.width = pct + '%';
    if (remaining <= 0) {
      clearInterval(state.timer); state.timer = null;
      // Don't auto-stop — Nigel may still be looking. Just gently nudge.
      ov.querySelector('[data-quest-clock]').textContent = 'Time!';
    }
  }

  // ---- Phase 3: "I'm back" --------------------------------------------------
  function stopTimer() {
    clearInterval(state.timer); state.timer = null;
    var ov = state.overlay;
    var quest = state.quest;
    if (!quest) return;
    ov.querySelector('[data-quest-return]').hidden = true;
    ov.querySelector('[data-quest-answer-block]').hidden = false;
    var label = ov.querySelector('[data-quest-answer-label]');
    var input = ov.querySelector('[data-quest-answer-input]');
    if (quest.answer_kind === 'number') {
      label.textContent = 'How many did you find?';
      input.placeholder = 'e.g. 7';
      input.inputMode = 'numeric';
    } else {
      label.textContent = 'What did you find?';
      input.placeholder = 'Tell me what you saw...';
      input.inputMode = 'text';
    }
    input.value = '';
    setTimeout(function () { input.focus(); }, 100);
  }

  // ---- Phase 4: submit ------------------------------------------------------
  function submitAnswer() {
    var ov = state.overlay;
    var quest = state.quest;
    if (!quest) return;
    var input = ov.querySelector('[data-quest-answer-input]');
    var answer = (input.value || '').trim();
    if (!answer) { input.focus(); return; }

    // Fire-and-forget the DB completion
    persistComplete(answer);

    // Move to done screen
    ov.querySelector('[data-quest-answer-block]').hidden = true;
    ov.querySelector('[data-quest-done-block]').hidden = false;
    var sub = ov.querySelector('[data-quest-done-sub]');
    if (quest.answer_kind === 'number') {
      sub.textContent = 'You found ' + answer + '! That\u2019s your real-world win for today.';
    } else {
      sub.textContent = 'You found ' + answer + '. Real-world hero work!';
    }

    // Remember last key so we don't repeat next time
    try { localStorage.setItem('ha_quest_last_key', quest.key); } catch (e) {}

    // Humphrey celebrates
    speak('quest_complete',
      (quest.answer_kind === 'number'
        ? 'You found ' + answer + '! Wonderful counting, Nigel. That is real-world math.'
        : 'You found ' + answer + '! What a great find. I love how you noticed that.'),
      'cheering');
  }

  // ---- DB persistence -------------------------------------------------------
  function persistStart(quest) {
    try {
      var T = (window.HeroAcademy && window.HeroAcademy.Telemetry) || null;
      if (!T || typeof T.rpc !== 'function') return;
      T.rpc('ha_start_quest', {
        p_child_id:       T.childId(),
        p_quest_key:      quest.key,
        p_quest_text:     quest.text,
        p_category:       quest.category,
        p_target_seconds: quest.target_seconds,
        p_source:         'home_tile',
      }).then(function (r) {
        if (!r || !r.ok) return;
        return r.text();
      }).then(function (txt) {
        if (!txt) return;
        try {
          // RPC returns a quoted string UUID, e.g., "\"abc-123\""
          state.questId = JSON.parse(txt);
        } catch (e) {
          state.questId = String(txt).replace(/"/g, '');
        }
      }).catch(function () {});
    } catch (e) {}
  }

  function persistComplete(answer) {
    try {
      var T = (window.HeroAcademy && window.HeroAcademy.Telemetry) || null;
      if (!T || typeof T.rpc !== 'function') return;
      if (!state.questId) return;
      T.rpc('ha_complete_quest', {
        p_quest_id: state.questId,
        p_answer:   answer,
      }).catch(function () {});
    } catch (e) {}
  }

  // ---- Ms. Humphrey speech helper ------------------------------------------
  function speak(eventKey, text, expression) {
    try {
      var H = (window.HeroAcademy && window.HeroAcademy.Humphrey) || null;
      if (H && typeof H.say === 'function') {
        H.say(eventKey, { text: text, expression: expression || 'encouraging' });
      }
    } catch (e) {}
  }

  // ---- Public entry points -------------------------------------------------

  function init(opts) {
    if (state.inited) return;
    state.inited = true;
    opts = opts || {};
    var tile = opts.tile || document.getElementById(opts.tileId || 'realWorldQuestTile');
    if (!tile) return;
    state.tile = tile;
    tile.removeAttribute('hidden');
    tile.addEventListener('click', function (e) {
      e.preventDefault();
      openRandom();
    });
  }

  function openRandom() {
    var quest = pickRandom();
    renderQuest(quest);
    openOverlay();
  }

  function openQuest(key) {
    var quest = pickByKey(key);
    if (!quest) return false;
    renderQuest(quest);
    openOverlay();
    return true;
  }

  NS.Quests = {
    init:       init,
    openRandom: openRandom,
    openQuest:  openQuest,
    QUESTS:     QUESTS,
  };
})();
