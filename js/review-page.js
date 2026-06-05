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
    // v86: track the current rendered item + its srs row so the always-visible
    // LISTEN button can re-fire speakItem on tap.
    currentItem: null,
    currentRow: null,
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

    // v86: wire the always-visible LISTEN button. Tapping it re-reads the
    // current question + choices. Also doubles as the audio-unlock gesture
    // for PWA contexts where autoplay-policy blocks the auto-fire on Q1.
    var listenBtn = $('reviewListenBtn');
    if (listenBtn) {
      listenBtn.addEventListener('click', function () {
        if (state.currentItem) {
          speakItem(state.currentItem, state.currentRow);
        }
      });
    }

    if (!NS.SRS) {
      console.warn('[review-page] SRS module not loaded — bailing');
      hide('reviewLoading');
      show('reviewEmpty');
      return;
    }
    // Route by mode: daily uses due items, friday uses cumulative quiz set
    var loader = state.mode === 'friday'
      ? NS.SRS.loadFridayQuiz(10)
      : NS.SRS.loadDue(10);
    loader.then(function (items) {
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
  function zoneKey(sourceTable, payload) {
    if (sourceTable === 'ha_math_problems') return 'numberlab';
    if (sourceTable === 'ha_discovery_cards') return 'discovery';
    if (sourceTable === 'ha_word_tower_items') return 'wordtower';
    // v81: cross-subject quiz bank — bucket by subject so the Friday
    // results breakdown surfaces writing/social rates cleanly.
    if (sourceTable === 'ha_quiz_bank' || sourceTable === 'ha_weekly_quiz_items') {
      var s = payload && payload.subject;
      if (s === 'reading') return 'wordtower';
      if (s === 'math')    return 'numberlab';
      if (s === 'science') return 'discovery';
      if (s === 'writing') return 'writing';
      if (s === 'social')  return 'social';
      return 'quizbank';
    }
    return 'other';
  }

  function kindLabel(kind, subject) {
    // v81: prefer the explicit subject when normalizeItem provided one.
    if (subject) {
      if (subject === 'reading') return 'READING';
      if (subject === 'math')    return 'MATH';
      if (subject === 'writing') return 'WRITING';
      if (subject === 'science') return 'SCIENCE';
      if (subject === 'social')  return 'SOCIAL';
    }
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
    $('reviewKindTag').textContent = kindLabel(item.kind, item.subject);
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

    // v86: stash the current item so the LISTEN button can re-read it on tap.
    state.currentItem = item;
    state.currentRow = row;

    // v84: Ms. Humphrey reads every question aloud (Emory voice). This is the
    // core philosophy — Nigel is 7, and many quiz items use vocabulary above
    // his read-on-his-own level. She narrates question + choices on every
    // render so he can listen and tap. If audio is muted, this is a no-op.
    // v86: this auto-fire is best-effort; the always-visible LISTEN button is
    // the reliable manual fallback (PWA autoplay-policy can block this on Q1).
    speakItem(item, row);
  }

  /**
   * Compose a natural-sounding spoken version of the current item and hand
   * it to Ms. Humphrey. Strips the leading emoji + subject prefix that
   * normalizeItem prepended for the visual badge, then prepends a spoken
   * subject intro and reads the choices aloud at the end.
   */
  function speakItem(item, srsRow) {
    if (!NS.Humphrey || typeof NS.Humphrey.say !== 'function') return;
    // Respect the user's mute toggle (the speech-pipeline checks this too,
    // but bailing early avoids a queue churn).
    if (typeof NS.Humphrey.isMuted === 'function' && NS.Humphrey.isMuted()) return;

    var visual = String(item.question || '');
    // Strip leading emoji (and any ZWJ sequences) + the "Reading — " style
    // subject prefix. We re-introduce subject naturally in the spoken intro.
    var spoken = visual
      .replace(/^[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u27BF\uFE0F\u200D]+\s*/, '')
      .replace(/^(Reading|Math|Writing|Science|Social Studies|Social)\s+[\u2014\-]\s+/i, '');

    var subj = item.subject || zoneToSubject(srsRow && srsRow.source_table);
    var intro = subjectIntro(subj);

    // Read choices for non-self-report items. (kind === 'word' is the Word
    // Tower read-aloud yes/no — choices there are meta and shouldn't be read.)
    var choicesText = '';
    if (item.kind !== 'word' && Array.isArray(item.choices) && item.choices.length >= 2) {
      var c = item.choices.map(function (x) { return String(x); });
      if (c.length === 2) {
        choicesText = ' Your choices are: ' + c[0] + ', or ' + c[1] + '.';
      } else {
        choicesText = ' Your choices are: ' + c.slice(0, -1).join(', ') + ', or ' + c[c.length - 1] + '.';
      }
    }

    try {
      NS.Humphrey.say('review-question', {
        text: intro + spoken + choicesText,
        expression: 'encouraging',
        priority: 'high',   // interrupt the prior "Yes!"/"Almost" so the next Q starts cleanly
      });
    } catch (e) { /* never break the UI for narration */ }
  }

  function subjectIntro(subj) {
    if (subj === 'reading') return 'Reading question. ';
    if (subj === 'math')    return 'Math question. ';
    if (subj === 'writing') return 'Writing question. ';
    if (subj === 'science') return 'Science question. ';
    if (subj === 'social')  return 'Social studies question. ';
    return 'Question: ';
  }
  function zoneToSubject(srcTable) {
    if (srcTable === 'ha_math_problems')      return 'math';
    if (srcTable === 'ha_discovery_cards')    return 'science';
    if (srcTable === 'ha_word_tower_items')   return 'reading';
    // ha_quiz_bank and ha_weekly_quiz_items surface subject via item.subject directly.
    return null;
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
    var zk = zoneKey(srsRow.source_table, srsRow.payload);
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
