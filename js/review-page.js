/**
 * Hero Academy — Review page logic.
 *
 * Mode is read from `?mode=` query param:
 *   daily   (default) — loads SRS due items, up to adaptive count.
 *   friday            — loads the cumulative weekly quiz (Haiku-generated).
 *
 * v87 — Ms. Humphrey actually "sees" the quiz now.
 *   - All Humphrey.say() calls pass `{ text, expression, priority }` instead
 *     of bare strings. Previously the string fallthrough hit CATALOG[_default]
 *     ("Hmm, let me think about that one") so EVERY right-or-wrong answer
 *     spoke that single line. Confirmed live via console + sayLog.
 *   - Reactions are now question-aware: they reference `item.answer` and
 *     surface `item.helpText` so Humphrey teaches, not just "Yes!"/"Almost".
 *   - Allows one retry on multi-choice items: a wrong tap only disables the
 *     wrong button. After 2 wrongs (or when only 1 choice remains), the
 *     correct answer reveals and Humphrey explains.
 *
 * Quality scoring per item (passed to recordReview):
 *   q=5 first-try correct
 *   q=3 correct after one wrong attempt
 *   q=0 revealed (2+ wrong, or only-choice-left)
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
    // v86: track current item + srs row so the always-visible LISTEN button
    // can re-fire speakItem on tap.
    currentItem: null,
    currentRow: null,
    // v87: per-item retry state. Reset on every renderCurrent.
    attempts: 0,          // count of taps so far (right or wrong)
    wrongPicks: [],       // text of buttons already marked wrong
    itemResolved: false,  // true once item is locked (correct or revealed)
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

  function getH() {
    var H = (window.HeroAcademy && window.HeroAcademy.Humphrey) || null;
    if (!H || typeof H.say !== 'function') return null;
    if (typeof H.isMuted === 'function' && H.isMuted()) return null;
    return H;
  }

  /**
   * v87: safe wrapper around Humphrey.say() — always passes an object so
   * resolveUtterance() picks up our `text` and doesn't fall through to the
   * "Hmm, let me think about that one" _default. Wrapped in try/catch so
   * narration never breaks the UI.
   */
  function speak(event, text, opts) {
    var H = getH();
    if (!H) return;
    var payload = { text: text };
    opts = opts || {};
    if (opts.expression) payload.expression = opts.expression;
    if (opts.priority)   payload.priority   = opts.priority;
    try { H.say(event, payload); } catch (e) { /* never break UI for narration */ }
  }

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------
  function init() {
    state.mode = getMode();
    setEyebrow(state.mode === 'friday' ? 'FRIDAY QUIZ' : 'DAILY PRACTICE');
    state.started = Date.now();

    // v86: wire the always-visible LISTEN button. Tapping it re-reads the
    // current question + choices. Also doubles as audio-unlock gesture for
    // PWA contexts where autoplay-policy blocks the auto-fire on Q1.
    var listenBtn = $('reviewListenBtn');
    if (listenBtn) {
      listenBtn.addEventListener('click', function () {
        if (state.currentItem) speakItem(state.currentItem, state.currentRow);
      });
    }

    if (!NS.SRS) {
      console.warn('[review-page] SRS module not loaded — bailing');
      hide('reviewLoading');
      show('reviewEmpty');
      return;
    }
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

    // v87: reset per-item retry state.
    state.attempts = 0;
    state.wrongPicks = [];
    state.itemResolved = false;

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
      btn.addEventListener('click', function () { handleChoice(c, item, row, btn); });
      choices.appendChild(btn);
    });

    $('reviewFeedback').hidden = true;
    $('reviewFeedback').textContent = '';
    $('reviewFeedback').className = 'review-feedback';
    $('reviewNextBtn').hidden = true;

    // v86: stash so LISTEN button can re-read on tap.
    state.currentItem = item;
    state.currentRow = row;

    // v84: Ms. Humphrey reads every question aloud (Emory voice). On PWA cold
    // load this can be blocked by autoplay-policy on Q1 — v86 LISTEN button
    // is the kid-discoverable fallback.
    speakItem(item, row);
  }

  /**
   * Compose a natural-sounding spoken version of the current item and hand
   * it to Ms. Humphrey. Strips the leading emoji + subject prefix that
   * normalizeItem prepended for the visual badge, then prepends a spoken
   * subject intro and reads the choices aloud at the end.
   */
  function speakItem(item, srsRow) {
    var H = getH();
    if (!H) return;

    var visual = String(item.question || '');
    var spoken = visual
      .replace(/^[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u27BF\uFE0F\u200D]+\s*/, '')
      .replace(/^(Reading|Math|Writing|Science|Social Studies|Social)\s+[\u2014\-]\s+/i, '');

    var subj = item.subject || zoneToSubject(srsRow && srsRow.source_table);
    var intro = subjectIntro(subj);

    var choicesText = '';
    if (item.kind !== 'word' && Array.isArray(item.choices) && item.choices.length >= 2) {
      var c = item.choices.map(function (x) { return String(x); });
      if (c.length === 2) {
        choicesText = ' Your choices are: ' + c[0] + ', or ' + c[1] + '.';
      } else {
        choicesText = ' Your choices are: ' + c.slice(0, -1).join(', ') + ', or ' + c[c.length - 1] + '.';
      }
    }

    speak('review-question', intro + spoken + choicesText, {
      expression: 'encouraging',
      priority: 'high',
    });
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
    return null;
  }

  // ------------------------------------------------------------------
  // v87: question-aware praise + explanation builders.
  // These reference item.answer and item.helpText so Humphrey speaks the
  // ACTUAL content, not a generic "Yes!" or "we will see it again soon."
  // ------------------------------------------------------------------
  function quoteAnswer(item) {
    var a = String(item.answer || '').trim();
    if (!a) return '';
    // Math answers are usually numbers — say them naked.
    if (item.kind === 'math' || /^[0-9.,+\-/×÷=]+$/.test(a)) return a;
    // Word answers ("YES, I READ IT") — skip; they're meta.
    if (item.kind === 'word') return '';
    return '"' + a + '"';
  }
  function trimHelp(text) {
    var s = String(text || '').trim();
    if (!s) return '';
    // helpText is usually a fact or sentence — keep it short and add period if missing.
    if (!/[.!?]$/.test(s)) s += '.';
    return s;
  }
  function praiseLineFirstTry(item) {
    var q = quoteAnswer(item);
    var help = trimHelp(item.helpText);
    var starts = ['Yes!', 'You got it!', 'Right on!', 'Nice memory, Nigel!'];
    var lead = starts[Math.floor(Math.random() * starts.length)];
    if (!q) return lead + (help ? ' ' + help : '');
    return lead + ' ' + q + ' is right.' + (help ? ' ' + help : '');
  }
  function praiseLineAfterRetry(item) {
    var q = quoteAnswer(item);
    var help = trimHelp(item.helpText);
    if (!q) return 'You got there, Nigel.' + (help ? ' ' + help : '');
    return 'You got there, Nigel. ' + q + ' is the one.' + (help ? ' ' + help : '');
  }
  function tryAgainLine(item) {
    var picks = [
      'Not quite — listen again and try another one.',
      'Hmm, that is not it. Give it one more try, Nigel.',
      'Almost — pick a different one.',
    ];
    return picks[Math.floor(Math.random() * picks.length)];
  }
  function revealLine(item) {
    var q = quoteAnswer(item);
    var help = trimHelp(item.helpText);
    if (!q) return 'The answer is ' + String(item.answer || '') + '.' + (help ? ' ' + help : '') + ' We will see this one again.';
    return 'The answer is ' + q + '.' + (help ? ' ' + help : '') + ' We will see this one again soon.';
  }

  // ------------------------------------------------------------------
  // Grade + advance
  // ------------------------------------------------------------------
  function handleChoice(choiceText, item, srsRow, btn) {
    if (state.itemResolved) return;  // ignore late taps after lock

    state.attempts++;
    var isCorrect = (String(choiceText) === String(item.answer));
    var totalChoices = (item.choices || []).length;
    // Force-reveal threshold: max 2 attempts on items with 3+ choices, or as
    // soon as only the correct one remains for 2-choice items.
    var revealThreshold = (totalChoices <= 2) ? 1 : 2;

    if (isCorrect) {
      resolveCorrect(item, srsRow, choiceText);
      return;
    }

    // Wrong tap — mark this one wrong, but maybe allow retry.
    state.wrongPicks.push(String(choiceText));
    btn.disabled = true;
    btn.classList.add('is-wrong');

    var remaining = (item.choices || []).filter(function (c) {
      return state.wrongPicks.indexOf(String(c)) === -1;
    });

    if (state.attempts >= revealThreshold || remaining.length <= 1) {
      // Out of tries (or only correct remains) — reveal + record q=0.
      resolveReveal(item, srsRow);
      return;
    }

    // Allow retry: show a light feedback line, Humphrey says try again.
    var fb = $('reviewFeedback');
    fb.textContent = 'Try again, Nigel — pick a different one.';
    fb.className = 'review-feedback is-wrong';
    fb.hidden = false;

    speak('review-wrong', tryAgainLine(item), {
      expression: 'concerned',
      priority: 'high',
    });
  }

  function resolveCorrect(item, srsRow, pickedText) {
    state.itemResolved = true;

    // Highlight the correct button, lock all.
    var btns = document.querySelectorAll('.review-choice');
    btns.forEach(function (b) {
      b.disabled = true;
      if (String(b.textContent) === String(item.answer)) b.classList.add('is-correct');
    });

    var firstTry = (state.attempts === 1);
    var quality = firstTry ? 5 : (state.attempts === 2 ? 3 : 2);

    // Per-zone tracking (Friday quiz summary).
    var zk = zoneKey(srsRow.source_table, srsRow.payload);
    if (!state.perZone[zk]) state.perZone[zk] = { total: 0, correct: 0 };
    state.perZone[zk].total++;
    state.perZone[zk].correct++;

    state.correctCount++;
    state.streak++;
    $('reviewStreak').textContent = String(state.streak);

    var fb = $('reviewFeedback');
    fb.textContent = firstTry ? 'Yes!' : 'You got there!';
    fb.className = 'review-feedback is-correct';
    fb.hidden = false;

    if (NS.SRS && srsRow && srsRow.srs_id) {
      NS.SRS.recordReview(srsRow.srs_id, quality);
    }

    speak('review-correct',
      firstTry ? praiseLineFirstTry(item) : praiseLineAfterRetry(item),
      { expression: 'cheering', priority: 'high' }
    );

    $('reviewNextBtn').hidden = false;
    $('reviewNextBtn').focus();
  }

  function resolveReveal(item, srsRow) {
    state.itemResolved = true;

    // Highlight correct + lock all.
    var btns = document.querySelectorAll('.review-choice');
    btns.forEach(function (b) {
      b.disabled = true;
      if (String(b.textContent) === String(item.answer)) b.classList.add('is-correct');
    });

    // Per-zone tracking — counts as a miss.
    var zk = zoneKey(srsRow.source_table, srsRow.payload);
    if (!state.perZone[zk]) state.perZone[zk] = { total: 0, correct: 0 };
    state.perZone[zk].total++;

    state.streak = 0;
    $('reviewStreak').textContent = '0';

    var fb = $('reviewFeedback');
    fb.textContent = 'The answer was: ' + String(item.answer || '');
    fb.className = 'review-feedback is-wrong';
    fb.hidden = false;

    if (NS.SRS && srsRow && srsRow.srs_id) {
      NS.SRS.recordReview(srsRow.srs_id, 0);
    }

    speak('review-wrong', revealLine(item), {
      expression: 'concerned',
      priority: 'high',
    });

    $('reviewNextBtn').hidden = false;
    $('reviewNextBtn').focus();
  }

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

    var doneText = 'All done, Nigel. ' +
      'You got ' + state.correctCount + ' out of ' + total + '. ' + msg;
    speak('review-done', doneText, {
      expression: pct >= 70 ? 'cheering' : 'encouraging',
    });
  }

  NS.ReviewPage = { init: init };
})();
