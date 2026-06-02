/**
 * Hero Academy — per-skill Ms. Humphrey drawings.
 *
 * Each entry takes (problem, opts) and returns a Promise resolving when the
 * walkthrough animation is done. Called by zones during the walkthrough/
 * scaffold branch when Nigel needs help.
 *
 * Coordinates are in virtual canvas space (1000 wide, height proportional).
 * Use HeroAcademy.Canvas methods directly — they handle scaling.
 *
 * Adding a new skill: write a function (problem) => Promise, register it
 * by skill_id.
 */
(function () {
  'use strict';
  var NS = window.HeroAcademy = window.HeroAcademy || {};
  if (NS.CanvasSkills) return;

  function C() { return NS.Canvas; }

  // ---- Parsers --------------------------------------------------------------
  // Pull "8 - 3" / "13 + 4" / "Nigel has 5 apples... gives 3..." style prompts.

  function parseAddSub(text) {
    if (!text) return null;
    // Direct arithmetic: "8 - 3 = ?" / "13 + 4 = ?"
    var m = String(text).match(/(-?\d+)\s*([+\-−])\s*(-?\d+)/);
    if (m) {
      var a = parseInt(m[1], 10);
      var b = parseInt(m[3], 10);
      var op = (m[2] === '+') ? '+' : '-';
      return { a: a, b: b, op: op, result: op === '+' ? a + b : a - b };
    }
    // Word problem: extract first two integers and infer op from verbs
    var nums = (String(text).match(/\b\d+\b/g) || []).map(function (s) { return parseInt(s, 10); });
    if (nums.length >= 2) {
      var lower = String(text).toLowerCase();
      var isSub = /\b(gives?|give away|loses?|left|away|fewer|takes? away|eats?|sells?|drops?|popped?|loses)\b/.test(lower);
      var op2 = isSub ? '-' : '+';
      return { a: nums[0], b: nums[1], op: op2, result: op2 === '+' ? nums[0] + nums[1] : nums[0] - nums[1] };
    }
    return null;
  }

  // ---- Helpers --------------------------------------------------------------

  function chooseLineRange(max) {
    // Round up to 10 or 20 to give visual breathing room.
    if (max <= 10) return [0, 10];
    if (max <= 20) return [0, 20];
    return [0, Math.ceil(max / 10) * 10];
  }

  // ---- Skill implementations ------------------------------------------------

  /**
   * Subtraction within 10: number line + jump-left arrow.
   *   "8 - 3 = ?"  →  number line 0-10, marker at 8, arrow back 3 steps to 5.
   */
  async function subtractionLine(problem) {
    var parsed = parseAddSub(problem.question || problem.prompt);
    if (!parsed || parsed.op !== '-') return;
    var Canvas = C(); if (!Canvas) return;
    var range = chooseLineRange(Math.max(parsed.a, Math.abs(parsed.result), 10));

    await Canvas.humphreyClear();
    await Canvas.humphreyDrawNumberLine(range[0], range[1], { y: 240 });

    var info = Canvas.lastNumberLine();
    if (!info) return;
    var startX = info.tickX(parsed.a);
    var endX = info.tickX(parsed.result);

    // Drop a magenta dot on the start position
    await Canvas.humphreyDrawCircle(parsed.a, 240, 14, {
      color: '#ec4899', fill: '#ec4899', duration: 350,
    });

    // Annotate above start: "Start at 8"
    await Canvas.humphreyDrawText(parsed.a, 180, 'Start at ' + parsed.a, {
      color: '#0a0b2e',
      font: '600 26px Fredoka, system-ui, sans-serif',
    });

    // Animated arrow stepping back `b` ticks
    await Canvas.humphreyDrawArrow(parsed.a, 200, parsed.result, 200, {
      color: '#14b8d4', width: 5, duration: 900,
    });
    await Canvas.humphreyDrawText((parsed.a + parsed.result) / 2, 160, 'Back ' + parsed.b, {
      color: '#14b8d4',
      font: '600 22px Fredoka, system-ui, sans-serif',
    });

    // Circle the result
    await Canvas.humphreyDrawCircle(parsed.result, 240, 32, {
      color: '#22c55e', width: 6, duration: 600,
    });
    await Canvas.humphreyDrawText(parsed.result, 320, '= ' + parsed.result, {
      color: '#22c55e',
      font: '700 32px Fredoka, system-ui, sans-serif',
    });
  }

  /**
   * Addition within 10/20: number line + jump-right arrow.
   *   "5 + 3 = ?"  →  number line 0-10, marker at 5, arrow forward 3 steps to 8.
   */
  async function additionLine(problem) {
    var parsed = parseAddSub(problem.question || problem.prompt);
    if (!parsed || parsed.op !== '+') return;
    var Canvas = C(); if (!Canvas) return;
    var range = chooseLineRange(Math.max(parsed.a + parsed.b, 10));

    await Canvas.humphreyClear();
    await Canvas.humphreyDrawNumberLine(range[0], range[1], { y: 240 });

    await Canvas.humphreyDrawCircle(parsed.a, 240, 14, {
      color: '#ec4899', fill: '#ec4899', duration: 350,
    });
    await Canvas.humphreyDrawText(parsed.a, 180, 'Start at ' + parsed.a, {
      color: '#0a0b2e',
      font: '600 26px Fredoka, system-ui, sans-serif',
    });

    await Canvas.humphreyDrawArrow(parsed.a, 200, parsed.result, 200, {
      color: '#14b8d4', width: 5, duration: 900,
    });
    await Canvas.humphreyDrawText((parsed.a + parsed.result) / 2, 160, 'Add ' + parsed.b, {
      color: '#14b8d4',
      font: '600 22px Fredoka, system-ui, sans-serif',
    });

    await Canvas.humphreyDrawCircle(parsed.result, 240, 32, {
      color: '#22c55e', width: 6, duration: 600,
    });
    await Canvas.humphreyDrawText(parsed.result, 320, '= ' + parsed.result, {
      color: '#22c55e',
      font: '700 32px Fredoka, system-ui, sans-serif',
    });
  }

  // ---- Registry -------------------------------------------------------------

  var registry = {
    subtract_within_10: subtractionLine,
    subtract_within_20: subtractionLine,
    add_within_10: additionLine,
    add_within_20: additionLine,
    make_10: additionLine,    // close-enough visual; refine later
    doubles: additionLine,
    doubles_plus_one: additionLine,
  };

  function drawForSkill(skillId, problem) {
    var fn = registry[skillId];
    if (typeof fn !== 'function') return Promise.resolve(false);
    if (!NS.Canvas || !NS.Canvas.isMounted()) return Promise.resolve(false);
    return Promise.resolve(fn(problem)).then(function () { return true; });
  }

  NS.CanvasSkills = {
    drawForSkill: drawForSkill,
    registry: registry,
  };
})();
