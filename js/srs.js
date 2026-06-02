/**
 * Hero Academy — Spaced Repetition (SM-2) client module.
 *
 * Wraps the SECURITY DEFINER RPCs added in migration ha_srs_build4:
 *   ha_get_srs_due(p_child_id, p_limit)
 *   ha_record_srs_review(p_srs_id, p_quality)
 *   ha_srs_enroll(p_child_id, p_source_table, p_source_item_id)
 *   ha_record_friday_quiz_result(p_child_id, p_total, p_correct, p_per_zone, p_weak)
 *
 * Quality scale used here (matches review-page UI):
 *   5 = correct first try, no help
 *   3 = correct after walkthrough / hint
 *   0 = wrong / gave up
 *
 * Auto-enrollment into the queue happens server-side inside the
 * ha_mark_*_attempt RPCs on the EXACT 2nd-miss event, so the client
 * does not need to call ha_srs_enroll during normal gameplay.
 *
 * Depends on HeroAcademy.Telemetry being loaded first (uses its rpc/childId).
 */
(function () {
  'use strict';

  var NS = window.HeroAcademy = window.HeroAcademy || {};
  if (NS.SRS) return; // idempotent

  function log() {
    if (typeof console === 'undefined' || !console.warn) return;
    var args = ['[srs]'];
    for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
    console.warn.apply(console, args);
  }

  function tele() {
    return (NS.Telemetry && typeof NS.Telemetry.rpc === 'function') ? NS.Telemetry : null;
  }

  /**
   * Returns an array of due items (hydrated with their source-table payload):
   *   [{ srs_id, source_table, source_item_id, due_at, interval_days,
   *      ease_factor, repetitions, payload: {...} }, ...]
   * Empty array on error or no due items.
   */
  function loadDue(limit) {
    var t = tele();
    if (!t) { log('Telemetry not loaded yet'); return Promise.resolve([]); }
    return t.rpc('ha_get_srs_due', {
      p_child_id: t.childId(),
      p_limit: typeof limit === 'number' ? limit : 10,
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (rows) {
        return Array.isArray(rows) ? rows : [];
      })
      .catch(function (e) {
        log('loadDue failed:', e && e.message || e);
        return [];
      });
  }

  /**
   * Returns count of due items only (cheap version for the home-page tile).
   * Returns 0 on error.
   */
  function countDue() {
    return loadDue(50).then(function (items) { return items.length; });
  }

  /**
   * Records a review outcome. Quality is clamped to {0, 3, 5}.
   * Returns the new SRS state: { new_interval_days, new_ease_factor,
   * new_due_at, new_repetitions } or null on error.
   */
  function recordReview(srsId, quality) {
    var t = tele();
    if (!t) { log('Telemetry not loaded yet'); return Promise.resolve(null); }
    if (!srsId) return Promise.resolve(null);
    var q = (quality === 5 ? 5 : (quality === 3 ? 3 : 0));
    return t.rpc('ha_record_srs_review', {
      p_srs_id: srsId,
      p_quality: q,
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (rows) {
        return Array.isArray(rows) ? rows[0] : rows;
      })
      .catch(function (e) {
        log('recordReview failed:', e && e.message || e);
        return null;
      });
  }

  /**
   * Records the result of a Friday cumulative quiz.
   * perZoneBreakdown is { numberlab: {total:n, correct:m}, ... }
   * weakAreas is an array of human-readable strings.
   */
  function recordFridayQuiz(totalItems, correctItems, perZoneBreakdown, weakAreas) {
    var t = tele();
    if (!t) return Promise.resolve(null);
    return t.rpc('ha_record_friday_quiz_result', {
      p_child_id: t.childId(),
      p_items_total: totalItems,
      p_items_correct: correctItems,
      p_per_zone_breakdown: perZoneBreakdown || null,
      p_weak_areas: weakAreas || null,
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .catch(function (e) {
        log('recordFridayQuiz failed:', e && e.message || e);
        return null;
      });
  }

  /**
   * Maps a source_table + payload into a normalized review item shape:
   *   { kind, question, choices, answer, helpText }
   * where:
   *   kind     ∈ {'math', 'word', 'discovery'}
   *   question string shown to Nigel
   *   choices  array of strings (for multiple-choice) OR null (self-report)
   *   answer   string matching one of choices, OR null (self-report)
   *   helpText optional secondary text (e.g. word's sentence)
   */
  function normalizeItem(srsRow) {
    if (!srsRow || !srsRow.payload) return null;
    var p = srsRow.payload;
    var t = srsRow.source_table;

    if (t === 'ha_math_problems') {
      var choices = [String(p.answer)];
      if (Array.isArray(p.distractors)) {
        for (var i = 0; i < p.distractors.length; i++) choices.push(String(p.distractors[i]));
      }
      // shuffle (deterministic per srs_id so refresh shows same order)
      choices = shuffleStable(choices, srsRow.srs_id || 'x');
      return {
        kind: 'math',
        question: p.prompt,
        choices: choices,
        answer: String(p.answer),
        helpText: null,
      };
    }

    if (t === 'ha_discovery_cards') {
      var dc = Array.isArray(p.choices) ? p.choices.slice() : [];
      var correctIdx = typeof p.answer_index === 'number' ? p.answer_index : 0;
      var correct = dc[correctIdx];
      return {
        kind: 'discovery',
        question: (p.emoji ? p.emoji + ' ' : '') + (p.title || '') +
                  (p.question ? ' — ' + p.question : ''),
        choices: shuffleStable(dc, srsRow.srs_id || 'x'),
        answer: correct,
        helpText: p.fact || null,
      };
    }

    if (t === 'ha_word_tower_items') {
      // For word items, we can't auto-grade a read-aloud — use a yes/no
      // self-report. Choices are presentational; "answer" is YES.
      return {
        kind: 'word',
        question: p.word,
        choices: ['YES, I READ IT', 'NOT YET'],
        answer: 'YES, I READ IT',
        helpText: p.sentence || p.hint || null,
      };
    }

    return null;
  }

  // Stable shuffle: same array+seed => same order. So refresh of an item
  // does not re-randomize and tip off the answer position.
  function shuffleStable(arr, seed) {
    var s = String(seed || '');
    var hash = 0;
    for (var i = 0; i < s.length; i++) {
      hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
    }
    var out = arr.slice();
    for (var j = out.length - 1; j > 0; j--) {
      hash = (hash * 9301 + 49297) % 233280;
      var k = Math.abs(hash) % (j + 1);
      var tmp = out[j]; out[j] = out[k]; out[k] = tmp;
    }
    return out;
  }

  NS.SRS = {
    loadDue: loadDue,
    countDue: countDue,
    recordReview: recordReview,
    recordFridayQuiz: recordFridayQuiz,
    normalizeItem: normalizeItem,
  };
})();
