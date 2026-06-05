/**
 * Hero Academy — Humphrey choice-readout with sync highlighting (v89).
 *
 * Shared helper used by every MCQ surface so behavior + visuals stay
 * consistent across zones:
 *   - Friday Quiz / Daily SRS (review-page.js)
 *   - Discovery Dome (science MCQ)
 *   - Number Lab (math MCQ)
 *
 * Pattern:
 *   1. Speak the question + "Your choices are:" preamble as one TTS call.
 *   2. When that audio finishes, sequentially speak each choice while
 *      pulsing the matching button (`.is-being-read` class). The class
 *      clears when the per-choice audio resolves.
 *   3. If the user taps a choice mid-readthrough, callers should invoke
 *      `cancel()` to bail out and clear highlights.
 *
 * Phaser-based zones (Cauldron Café, Diner Lanes) need a separate Phaser
 * tween implementation — this module is DOM-only.
 *
 * Usage:
 *   HeroAcademy.HumphreyChoices.speakWithHighlights({
 *     event: 'discovery-question',         // base event key for H.say
 *     questionText: 'Spiders weave silk. Which animal makes the strongest silk?',
 *     choices: ['ant', 'spider', 'bee', 'fly'],
 *     container: '#answerChoices',         // CSS selector (default '#answerChoices')
 *     choiceSelector: '.answer-btn',       // (default '.answer-btn')
 *     expression: 'encouraging',
 *     image: 'spider',                     // optional visual-aid query
 *   });
 *
 *   // On user tap, cancel the chain:
 *   HeroAcademy.HumphreyChoices.cancel();
 */
(function () {
  'use strict';
  var NS = window.HeroAcademy = window.HeroAcademy || {};
  if (NS.HumphreyChoices) return;

  var globalSeq = 0;

  function getH() {
    var H = NS.Humphrey;
    if (!H || typeof H.say !== 'function') return null;
    if (typeof H.isMuted === 'function' && H.isMuted()) return null;
    return H;
  }

  function rootFor(sel) {
    if (!sel) return document;
    var el = document.querySelector(sel);
    return el || document;
  }

  function clearAll(containerSel, choiceSel) {
    var root = rootFor(containerSel);
    var nodes = root.querySelectorAll((choiceSel || '.answer-btn') + '.is-being-read');
    for (var i = 0; i < nodes.length; i++) nodes[i].classList.remove('is-being-read');
  }

  function findChoiceButton(choiceText, containerSel, choiceSel) {
    var root = rootFor(containerSel);
    var btns = root.querySelectorAll(choiceSel || '.answer-btn');
    var target = String(choiceText);
    for (var i = 0; i < btns.length; i++) {
      if (String(btns[i].textContent).trim() === target.trim()) return btns[i];
    }
    return null;
  }

  function speakWithHighlights(opts) {
    opts = opts || {};
    var H = getH();
    if (!H) return null;

    globalSeq++;
    var mySeq = globalSeq;

    var container = opts.container || '#answerChoices';
    var choiceSel = opts.choiceSelector || '.answer-btn';
    var event = opts.event || 'humphrey-question';
    var expression = opts.expression || 'encouraging';
    var choices = Array.isArray(opts.choices) ? opts.choices : [];
    var questionText = String(opts.questionText || '').trim();
    var hasChoices = choices.length >= 2;

    clearAll(container, choiceSel);

    var spoken = questionText + (hasChoices ? ' Your choices are:' : '');

    var payload = { text: spoken, expression: expression, priority: 'high' };
    if (opts.image) payload.image = opts.image;

    var p;
    try { p = H.say(event, payload); }
    catch (e) { return null; }

    if (!hasChoices) return mySeq;

    if (p && typeof p.then === 'function') {
      p.then(function () {
        if (mySeq !== globalSeq) return;
        walkChoices(choices, 0, mySeq, container, choiceSel, event);
      });
    } else {
      // Fallback if Humphrey doesn't return a promise — schedule choices.
      setTimeout(function () {
        if (mySeq !== globalSeq) return;
        walkChoices(choices, 0, mySeq, container, choiceSel, event);
      }, 1200);
    }
    return mySeq;
  }

  function walkChoices(choices, i, mySeq, containerSel, choiceSel, event) {
    if (mySeq !== globalSeq) { clearAll(containerSel, choiceSel); return; }
    if (i >= choices.length) return;

    var c = choices[i];
    var isLast = (i === choices.length - 1);
    var text = String(c) + (isLast ? '.' : ',');
    var btn = findChoiceButton(c, containerSel, choiceSel);
    if (btn && !btn.disabled) btn.classList.add('is-being-read');

    var H = getH();
    if (!H) { if (btn) btn.classList.remove('is-being-read'); return; }

    var p;
    try {
      p = H.say(event + '-choice', { text: text, expression: 'encouraging' });
    } catch (e) {
      if (btn) btn.classList.remove('is-being-read');
      return;
    }

    var advance = function () {
      if (btn) btn.classList.remove('is-being-read');
      if (mySeq !== globalSeq) return;
      walkChoices(choices, i + 1, mySeq, containerSel, choiceSel, event);
    };

    if (p && typeof p.then === 'function') {
      p.then(advance);
    } else {
      // Approximate the duration: ~60ms per char + 350ms base for short words.
      var approxMs = Math.max(450, 60 * String(text).length + 250);
      setTimeout(advance, approxMs);
    }
  }

  function cancel() {
    globalSeq++;
    clearAll(null, '.answer-btn');
    clearAll(null, '.review-choice');
  }

  function clearHighlights(containerSel, choiceSel) {
    clearAll(containerSel || null, choiceSel || '.answer-btn');
    clearAll(containerSel || null, choiceSel || '.review-choice');
  }

  NS.HumphreyChoices = {
    speakWithHighlights: speakWithHighlights,
    cancel: cancel,
    clearHighlights: clearHighlights,
  };
})();
