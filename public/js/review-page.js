/**
 * Hero Academy — Review page logic.
 *
 * v88 — Per-choice highlight sync (the visual-audio pedagogy feature).
 *   - speakItem now splits TTS into one "question + 'Your choices are:'" call,
 *     then a chained per-choice call for each answer.
 *   - Each per-choice call pulses the matching button with `.is-being-read`
 *     so Nigel SEES which choice he's HEARING. Class clears after the per-
 *     choice audio finishes.
 *   - If Nigel taps a choice mid-readthrough, the chain bails (state.itemResolved
 *     becomes true) and any active highlight is cleared.
 *   - Word Tower (kind:'word') self-report items bypass the per-choice loop —
 *     their "YES, I READ IT" / "NOT YET" buttons are meta and not read aloud.
 *
 * v87 — Ms. Humphrey actually "sees" the quiz.
 *   - All Humphrey.say() calls pass `{ text, expression, priority }` instead
 *     of bare strings (was hitting CATALOG[_default] → "Hmm, let me think
 *     about that one").
 *   - Reactions reference item.answer + item.helpText so she teaches, not
 *     just "Yes!"/"Almost".
 *   - Allows one retry on multi-choice items.
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
    perZone: {},
    started: 0,
    currentItem: null,
    currentRow: null,
    attempts: 0,
    wrongPicks: [],
    itemResolved: false,
    // v88: monotonic token so an in-flight choice-read sequence can detect that
    // a newer renderCurrent has replaced it and bail out.
    speakSeq: 0,
  };

  function $(id) { return document.getElementById(id); }
  function show(id) { var el = $(id); if (el) el.hidden = false; }
  function hide(id) { var el = $(id); if (el) el.hidden = true; }

  function getMode() {
    var params = new URLSearchParams(window.location.search);
    var m = (params.get('mode') || 'daily').toLowerCase();
    return (m === 'friday') ? 'friday' : 'daily';
  }

  function setEyebrow(text) {
    var el = $('reviewEyebrow');
    if (el) el.textContent = text;
  }

  function getH() {
    var H = (window.HeroAcademy && window.HeroAcademy.Humphrey) || null;
    if (!H || typeof H.say !== 'function') return null;
    if (typeof H.isMuted === 'function' && H.isMuted()) return null;
    return H;
  }

  /**
   * Always passes an object so resolveUtterance picks up `text`.
   * Returns the say() promise so callers can chain.
   */
  function speak(event, text, opts) {
    var H = getH();
    if (!H) return Promise.resolve(null);
    var payload = { text: text };
    opts = opts || {};
    if (opts.expression) payload.expression = opts.expression;
    if (opts.priority)   payload.priority   = opts.priority;
    try { return H.say(event, payload); }
    catch (e) { return Promise.resolve(null); }
  }

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------
  function init() {
    state.mode = getMode();
    setEyebrow(state.mode === 'friday' ? 'FRIDAY QUIZ' : 'DAILY PRACTICE');
    state.started = Date.now();

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
    // Cancel any in-flight choice-read chain from the previous item.
    state.speakSeq++;
    clearChoiceHighlights();

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

    state.attempts = 0;
    state.wrongPicks = [];
    state.itemResolved = false;

    $('reviewProgress').textContent = 'Item ' + (state.idx + 1) + ' of ' + state.items.length;
    $('reviewKindTag').textContent = kindLabel(item.kind, item.subject);
    $('reviewKindTag').className = 'review-kind-tag review-kind-' + item.kind;
    $('reviewQuestion').textContent = item.question || '';

    // v94: Always hide helpText pre-answer. The helpText often spoils the
    // answer (especially for math problems with explanatory help text).
    // It reappears after the kid answers, where it teaches instead of spoiling.
    var help = $('reviewHelp');
    help.textContent = '';
    help.hidden = true;

    var choices = $('reviewChoices');
    choices.innerHTML = '';
    (item.choices || []).forEach(function (c) {
      var btn = document.createElement('button');
      btn.className = 'review-choice';
      btn.type = 'button';
      // v88: store the choice value as a data-attribute so we can find this
      // button later by value (used by the per-choice highlight loop).
      btn.setAttribute('data-choice', String(c));
      btn.textContent = c;
      btn.addEventListener('click', function () { handleChoice(c, item, row, btn); });
      choices.appendChild(btn);
    });

    $('reviewFeedback').hidden = true;
    $('reviewFeedback').textContent = '';
    $('reviewFeedback').className = 'review-feedback';
    $('reviewNextBtn').hidden = true;

    state.currentItem = item;
    state.currentRow = row;

    speakItem(item, row);
  }

  // ------------------------------------------------------------------
  // v88: per-choice highlight management
  // ------------------------------------------------------------------
  function clearChoiceHighlights() {
    var nodes = document.querySelectorAll('.review-choice.is-being-read');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.remove('is-being-read');
    }
  }
  function findChoiceButton(choiceText) {
    // Prefer data-choice match (exact value) — safer than textContent which
    // may include surrounding whitespace.
    var byData = document.querySelector('.review-choice[data-choice="' + String(choiceText).replace(/"/g, '\\"') + '"]');
    if (byData) return byData;
    var btns = document.querySelectorAll('.review-choice');
    for (var i = 0; i < btns.length; i++) {
      if (String(btns[i].textContent) === String(choiceText)) return btns[i];
    }
    return null;
  }
  function highlightChoice(choiceText) {
    var btn = findChoiceButton(choiceText);
    if (!btn) return null;
    // Don't highlight a button already disabled by a prior tap (re-read via
    // Listen button after a wrong answer, etc.) — but DO if it's still active.
    if (btn.disabled) return null;
    btn.classList.add('is-being-read');
    return btn;
  }
  function unhighlightChoice(btn) {
    if (btn) btn.classList.remove('is-being-read');
  }

  /**
   * Speak the question, then chain through each choice while highlighting
   * the corresponding button. Bails out if a newer renderCurrent supersedes
   * this sequence (state.speakSeq) or if the item resolves mid-readthrough.
   */
  function speakItem(item, srsRow) {
    var H = getH();
    if (!H) return;

    // Reset highlights from any prior pass (e.g. tapping Listen mid-read).
    clearChoiceHighlights();

    // Bump the seq so any prior in-flight chain knows to stop.
    state.speakSeq++;
    var mySeq = state.speakSeq;

    var visual = String(item.question || '');
    var spoken = visual
      .replace(/^[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u27BF\uFE0F\u200D]+\s*/, '')
      .replace(/^(Reading|Math|Writing|Science|Social Studies|Social)\s+[\u2014\-]\s+/i, '');

    var subj = item.subject || zoneToSubject(srsRow && srsRow.source_table);
    var intro = subjectIntro(subj);

    var hasChoiceList =
      item.kind !== 'word' &&
      Array.isArray(item.choices) &&
      item.choices.length >= 2;

    if (!hasChoiceList) {
      // Word Tower yes/no etc — single TTS call, no choice highlighting.
      speak('review-question', intro + spoken, {
        expression: 'encouraging',
        priority: 'high',
      });
      return;
    }

    // Step 1: speak the question + "Your choices are:" preamble.
    var questionPart = intro + spoken + ' Your choices are:';
    var p = speak('review-question', questionPart, {
      expression: 'encouraging',
      priority: 'high',
    });

    // Step 2: chain through each choice, highlighting as we go.
    if (p && typeof p.then === 'function') {
      p.then(function () {
        if (mySeq !== state.speakSeq) return;        // newer item rendered
        if (state.itemResolved) return;              // user already answered
        speakChoicesSequentially(item.choices, 0, mySeq);
      });
    }
  }

  function speakChoicesSequentially(choices, i, mySeq) {
    if (mySeq !== state.speakSeq) return;
    if (state.itemResolved) { clearChoiceHighlights(); return; }
    if (i >= choices.length) return;

    var c = choices[i];
    var isLast = (i === choices.length - 1);
    var text = String(c) + (isLast ? '.' : ',');
    var btn = highlightChoice(c);

    var H = getH();
    if (!H) { unhighlightChoice(btn); return; }

    var p;
    try {
      // Use a distinct event key so this stream doesn't share variant state
      // with the main question. No `priority:'high'` here — letting the
      // queue play sequentially, since we awaited the prior promise.
      p = H.say('review-question-choice', {
        text: text,
        expression: 'encouraging',
      });
    } catch (e) {
      unhighlightChoice(btn);
      return;
    }

    if (p && typeof p.then === 'function') {
      p.then(function () {
        unhighlightChoice(btn);
        if (mySeq !== state.speakSeq) return;
        if (state.itemResolved) { clearChoiceHighlights(); return; }
        speakChoicesSequentially(choices, i + 1, mySeq);
      });
    } else {
      // Fallback: if no promise, just continue after a short delay.
      setTimeout(function () {
        unhighlightChoice(btn);
        speakChoicesSequentially(choices, i + 1, mySeq);
      }, 600);
    }
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
  // Question-aware praise + explanation builders
  // ------------------------------------------------------------------
  function quoteAnswer(item) {
    var a = String(item.answer || '').trim();
    if (!a) return '';
    if (item.kind === 'math' || /^[0-9.,+\-/×÷=]+$/.test(a)) return a;
    if (item.kind === 'word') return '';
    return '"' + a + '"';
  }
  function trimHelp(text) {
    var s = String(text || '').trim();
    if (!s) return '';
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
  function tryAgainLine() {
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
    if (state.itemResolved) return;

    // Tapping a choice cancels the read-along chain and clears highlights.
    state.speakSeq++;
    clearChoiceHighlights();

    state.attempts++;
    var isCorrect = (String(choiceText) === String(item.answer));
    var totalChoices = (item.choices || []).length;
    var revealThreshold = (totalChoices <= 2) ? 1 : 2;

    if (isCorrect) {
      resolveCorrect(item, srsRow, choiceText);
      return;
    }

    state.wrongPicks.push(String(choiceText));
    btn.disabled = true;
    btn.classList.add('is-wrong');

    var remaining = (item.choices || []).filter(function (c) {
      return state.wrongPicks.indexOf(String(c)) === -1;
    });

    if (state.attempts >= revealThreshold || remaining.length <= 1) {
      resolveReveal(item, srsRow);
      return;
    }

    var fb = $('reviewFeedback');
    fb.textContent = 'Try again, Nigel — pick a different one.';
    fb.className = 'review-feedback is-wrong';
    fb.hidden = false;

    speak('review-wrong', tryAgainLine(), {
      expression: 'concerned',
      priority: 'high',
    });
  }

  function resolveCorrect(item, srsRow, pickedText) {
    state.itemResolved = true;

    var btns = document.querySelectorAll('.review-choice');
    btns.forEach(function (b) {
      b.disabled = true;
      b.classList.remove('is-being-read');
      if (String(b.textContent) === String(item.answer)) b.classList.add('is-correct');
    });

    var firstTry = (state.attempts === 1);
    var quality = firstTry ? 5 : (state.attempts === 2 ? 3 : 2);

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

    // v94: kid has answered, so helpText is safe to reveal as visual
    // reinforcement of what Humphrey just said.
    if (item.helpText) {
      $('reviewHelp').textContent = item.helpText;
      $('reviewHelp').hidden = false;
    }

    $('reviewNextBtn').hidden = false;
    $('reviewNextBtn').focus();
  }

  function resolveReveal(item, srsRow) {
    state.itemResolved = true;

    var btns = document.querySelectorAll('.review-choice');
    btns.forEach(function (b) {
      b.disabled = true;
      b.classList.remove('is-being-read');
      if (String(b.textContent) === String(item.answer)) b.classList.add('is-correct');
    });

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

    // v94: post-answer reveal — show helpText now that it can't spoil.
    if (item.helpText) {
      $('reviewHelp').textContent = item.helpText;
      $('reviewHelp').hidden = false;
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
