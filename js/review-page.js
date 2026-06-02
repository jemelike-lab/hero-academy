/**
 * Hero Academy — Review page logic.
 *
 * Mode is read from `?mode=` query param:
 *   daily   (default) — loads SRS due items, up to adaptive count.
 *   friday            — loads cumulative quiz items (will be wired in next lane).
 *
 * For each item:
 *   - Renders question + choices via HeroAcademy.SRS.normalizeItem()
 *   - On answer: shows feedback, records review with quality {5, 3, 0}
 *   - q=5 if first-try correct, q=3 if correct after walkthrough,
 *     q=0 if wrong (in v1, single attempt allowed; wrong = q=0)
 *   - Advances on NEXT button click
 *
 * After the last item: shows score card; if mode=friday, posts to
 * ha_record_friday_quiz_result.
 */
(function () {
  'use strict';

  var NS = window.HeroAcademy = window.HeroAcademy || {};
  if (NS.ReviewPage) return;

  var state = {
    mode: 'daily',
    items: [],
    idx: 0,
    correctCount: 0,
    streak: 0,
    perZone: {},     // { numberlab: {total, correct}, ... }
    started: 0,
  };

  function $(id) { return document.getElementById(id); }

  function getMode() {
    var params = new URLSearchParams(window.location.search);
    var m = (params.get('mode') || 'daily').toLowerCase();
    return (m === 'friday') ? 'friday' : 'daily';
  }

  function setEyebrow(text) {
    var el = $('reviewEyebrow');
    if (el) el.textContent = text;
  }

  function show(id) { var el = $(id); if (el) el.hidden = false; }
  function hide(id) { var el = $(id); if (el) el.hidden = true; }

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------
  function init() {
    state.mode = getMode();
    setEyebrow(state.mode === 'friday' ? 'FRIDAY QUIZ' : 'DAILY PRACTICE');
    state.started = Date.now();
    if (!NS.SRS) {
      console.warn('[review-page] SRS module not loaded — bailing');
      hide('reviewLoading');
      show('reviewEmpty');
      return;
    }
    // For now both modes load due items only. Friday will expand in next lane.
    NS.SRS.loadDue(10).then(function (items) {
      state.items = (items || []).filter(function (it) {
        return NS.SRS.normalizeItem(it) != null;
      });
      hide('reviewLoading');
      if (state.items.length === 0) {
        show('reviewEmpty');
        return;
      }
      show('reviewCard');
      renderCurrent();
    });
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  function zoneKey(sourceTable) {
    if (sourceTable === 'ha_math_problems') return 'numberlab';
    if (sourceTable === 'ha_discovery_cards') return 'discovery';
    if (sourceTable === 'ha_word_tower_items') return 'wordtower';
    return 'other';
  }

  function kindLabel(kind) {
    return kind === 'math' ? 'MATH'
      : kind === 'discovery' ? 'SCIENCE'
      : kind === 'word' ? 'READING'
      : 'PRACTICE';
  }

  function renderCurrent() {
    if (state.idx >= state.items.length) {
      renderDone();
      return;
    }
    var row = state.items[state.idx];
    var item = NS.SRS.normalizeItem(row);
    if (!item) {
      state.idx++;
      renderCurrent();
      return;
    }

    $('reviewProgress').textContent = 'Item ' + (state.idx + 1) + ' of ' + state.items.length;
    $('reviewKindTag').textContent = kindLabel(item.kind);
    $('reviewKindTag').className = 'review-kind-tag review-kind-' + item.kind;
    $('reviewQuestion').textContent = item.question || '';

    var help = $('reviewHelp');
    if (item.helpText) {
      help.textContent = item.helpText;
      help.hidden = false;
    } else {
      help.hidden = true;
    }

    var choices = $('reviewChoices');
    choices.innerHTML = '';
    (item.choices || []).forEach(function (c) {
      var btn = document.createElement('button');
      btn.className = 'review-choice';
      btn.type = 'button';
      btn.textContent = c;
      btn.addEventListener('click', function () { handleChoice(c, item, row); });
      choices.appendChild(btn);
    });

    $('reviewFeedback').hidden = true;
    $('reviewNextBtn').hidden = true;
  }

  // ------------------------------------------------------------------
  // Grade + advance
  // ------------------------------------------------------------------
  function handleChoice(choiceText, item, srsRow) {
    var correct = (String(choiceText) === String(item.answer));

    // Lock choices
    var btns = document.querySelectorAll('.review-choice');
    btns.forEach(function (b) {
      b.disabled = true;
      var matchesAnswer = String(b.textContent) === String(item.answer);
      var wasPicked = String(b.textContent) === String(choiceText);
      if (matchesAnswer) b.classList.add('is-correct');
      else if (wasPicked) b.classList.add('is-wrong');
    });

    // Track per-zone for Friday quiz summary
    var zk = zoneKey(srsRow.source_table);
    if (!state.perZone[zk]) state.perZone[zk] = { total: 0, correct: 0 };
    state.perZone[zk].total++;
    if (correct) state.perZone[zk].correct++;

    // Feedback
    var fb = $('reviewFeedback');
    if (correct) {
      state.correctCount++;
      state.streak++;
      $('reviewStreak').textContent = String(state.streak);
      fb.textContent = pick(['Yes!', 'Got it!', 'Right on!', 'Nice work!']);
      fb.className = 'review-feedback is-correct';
    } else {
      state.streak = 0;
      $('reviewStreak').textContent = '0';
      fb.textContent = 'Almost — the answer was: ' + item.answer;
      fb.className = 'review-feedback is-wrong';
    }
    fb.hidden = false;

    // Record review (v1: q=5 if first-try correct, q=0 if wrong)
    if (NS.SRS && srsRow && srsRow.srs_id) {
      NS.SRS.recordReview(srsRow.srs_id, correct ? 5 : 0);
    }

    // Ms. Humphrey light narration (don't block)
    if (NS.Humphrey && typeof NS.Humphrey.say === 'function') {
      try {
        if (correct) NS.Humphrey.say('review-correct', pick(['You got it, Nigel.', 'Nice memory!', 'Yes!']));
        else NS.Humphrey.say('review-wrong', 'Not quite — we will see it again soon.');
      } catch (e) { /* silent */ }
    }

    $('reviewNextBtn').hidden = false;
    $('reviewNextBtn').focus();
  }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function nextItem() {
    state.idx++;
    renderCurrent();
  }

  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'reviewNextBtn') nextItem();
  });

  // ------------------------------------------------------------------
  // Done
  // ------------------------------------------------------------------
  function renderDone() {
    hide('reviewCard');
    show('reviewDone');
    var total = state.items.length;
    var pct = total ? Math.round((state.correctCount / total) * 100) : 0;
    $('reviewDoneScore').textContent = state.correctCount + ' of ' + total + ' (' + pct + '%)';

    var msg;
    if (pct >= 90) msg = 'Hero-mode unlocked! Your memory is rock solid.';
    else if (pct >= 70) msg = 'Solid work. A couple of these will come back soon.';
    else if (pct >= 50) msg = 'Good effort — we will keep practicing the tricky ones.';
    else msg = 'Tough round. We will see these again — that is how it sticks.';
    $('reviewDoneMsg').textContent = msg;

    if (state.mode === 'friday' && NS.SRS) {
      var weak = [];
      Object.keys(state.perZone).forEach(function (k) {
        var z = state.perZone[k];
        if (z.total > 0 && (z.correct / z.total) < 0.6) weak.push(k);
      });
      NS.SRS.recordFridayQuiz(total, state.correctCount, state.perZone, weak);
    }

    if (NS.Humphrey && typeof NS.Humphrey.say === 'function') {
      try { NS.Humphrey.say('review-done', 'All done, Nigel. Great brain workout.'); } catch (e) {}
    }
  }

  NS.ReviewPage = { init: init };
})();
