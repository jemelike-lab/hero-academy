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

  // Strong addition signals — when one of these appears, addition wins even if
  // a subtraction verb is also present in the prompt. Real grade-2 word
  // problems frequently mix them: "Gabriel gives him 5 MORE apples" used to
  // parse as subtraction because "gives" matched the old regex.
  // "fewer" / "less" are also additive-looking words ("how many more...?")
  // when paired with a comparison, but in K-2 problems they almost always
  // signal subtraction, so we keep them on the sub side.
  var STRONG_ADD = /\b(more|altogether|in all|total|combined|both|added|join(ed|s)?|extra|additional|sum|gained|got|received|won|earned|found|bought|all together)\b/;
  var SUB_VERBS = /\b(gives? away|give away|gave away|takes? away|took away|loses?|lost|fewer|less|left|away|eats?|eaten|ate|sells?|sold|drops?|dropped|popped?|broke|burst|spilled|missing|remain(s|ing)?|gone|disappeared)\b/;
  // "gives"/"gave" by themselves are ambiguous (e.g., "Gabriel gives him 3
  // more") so they're NOT in SUB_VERBS — they only signal subtraction when
  // paired with "away" (covered above) or another subtraction signal.

  function inferOp(lower) {
    var hasAdd = STRONG_ADD.test(lower);
    var hasSub = SUB_VERBS.test(lower);
    // Both present (e.g., "He gave 3 away but received 5 more") — addition
    // wins because addition-strong signals are deliberate, while subtraction
    // verbs often appear as throwaway setup ("he had some, then gave some,
    // and how many MORE...?").
    if (hasAdd) return '+';
    if (hasSub) return '-';
    return '+'; // default for unmarked word problems
  }

  function parseAddSub(text) {
    if (!text) return null;
    // Direct arithmetic: "8 - 3 = ?" / "13 + 4 = ?" — unambiguous, takes
    // precedence over any verb in the surrounding text.
    var m = String(text).match(/(-?\d+)\s*([+\-−])\s*(-?\d+)/);
    if (m) {
      var a = parseInt(m[1], 10);
      var b = parseInt(m[3], 10);
      var op = (m[2] === '+') ? '+' : '-';
      return { a: a, b: b, op: op, result: op === '+' ? a + b : a - b };
    }
    // Word problem: extract first two integers and infer op from verbs.
    var nums = (String(text).match(/\b\d+\b/g) || []).map(function (s) { return parseInt(s, 10); });
    if (nums.length >= 2) {
      var lower = String(text).toLowerCase();
      var op2 = inferOp(lower);
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

  /**
   * Make-10 strategy: 8 + 5 → 8 + 2 + 3 → 10 + 3 = 13.
   * The "make 10" curriculum approach decomposes the second addend so the
   * first addend rounds up to 10, then adds whatever's left. This drawing
   * splits the visual jump into two arrows so Nigel sees WHY the trick works,
   * not just what the answer is.
   *
   * If the problem isn't a make-10 candidate (e.g., neither addend < 10, or
   * sum already < 10), we fall back to the regular additionLine so we never
   * leave Nigel without a walkthrough.
   */
  async function makeTenLine(problem) {
    var parsed = parseAddSub(problem.question || problem.prompt);
    if (!parsed || parsed.op !== '+') return;

    // Make-10 only makes sense when one addend < 10, the sum > 10, and we'd
    // actually cross the 10 boundary. Otherwise revert to plain addition.
    var a = parsed.a;
    var b = parsed.b;
    var sum = parsed.result;
    var crossesTen = (a < 10 && sum > 10) || (b < 10 && sum > 10);
    if (!crossesTen) return additionLine(problem);

    // Pick the larger addend as the "anchor" so we jump toward 10 from
    // whichever side gets us there fastest. Visually nicer than always
    // jumping from `a`.
    var anchor = Math.max(a, b);
    var other = Math.min(a, b);
    var toTen = 10 - anchor;        // first jump: anchor → 10
    var remainder = other - toTen;  // second jump: 10 → sum

    var Canvas = C(); if (!Canvas) return;
    var range = chooseLineRange(Math.max(sum, 20));

    await Canvas.humphreyClear();
    await Canvas.humphreyDrawNumberLine(range[0], range[1], { y: 240 });

    // Drop anchor dot
    await Canvas.humphreyDrawCircle(anchor, 240, 14, {
      color: '#ec4899', fill: '#ec4899', duration: 350,
    });
    await Canvas.humphreyDrawText(anchor, 180, 'Start at ' + anchor, {
      color: '#0a0b2e',
      font: '600 26px Fredoka, system-ui, sans-serif',
    });

    // Jump 1: anchor → 10
    await Canvas.humphreyDrawArrow(anchor, 200, 10, 200, {
      color: '#14b8d4', width: 5, duration: 700,
    });
    await Canvas.humphreyDrawText((anchor + 10) / 2, 160, '+ ' + toTen + ' → 10', {
      color: '#14b8d4',
      font: '600 22px Fredoka, system-ui, sans-serif',
    });

    // Tiny pause-dot at 10 to make the decomposition visible
    await Canvas.humphreyDrawCircle(10, 240, 10, {
      color: '#fbbf24', fill: '#fbbf24', duration: 250,
    });

    // Jump 2: 10 → sum
    await Canvas.humphreyDrawArrow(10, 200, sum, 200, {
      color: '#a855f7', width: 5, duration: 700,
    });
    await Canvas.humphreyDrawText((10 + sum) / 2, 290, '+ ' + remainder, {
      color: '#a855f7',
      font: '600 22px Fredoka, system-ui, sans-serif',
    });

    // Circle the result
    await Canvas.humphreyDrawCircle(sum, 240, 32, {
      color: '#22c55e', width: 6, duration: 600,
    });
    await Canvas.humphreyDrawText(sum, 320, '= ' + sum, {
      color: '#22c55e',
      font: '700 32px Fredoka, system-ui, sans-serif',
    });
  }

  /**
   * Count-on strategy: for problems like 9 + 2, where one addend is large
   * and the other is small (≤3), the count-on strategy is faster than
   * jumping. We show the larger addend as the start, then ONE TICK at a
   * time stepping right, each tick labeled "+1". This makes the count-on
   * mechanic crystal clear for a 7-year-old.
   *
   * Falls back to additionLine when the smaller addend is >3 (count-on
   * stops being efficient — at that point a single arrow is clearer).
   */
  async function countOnLine(problem) {
    var parsed = parseAddSub(problem.question || problem.prompt);
    if (!parsed || parsed.op !== '+') return;
    var a = parsed.a, b = parsed.b, sum = parsed.result;
    var anchor = Math.max(a, b);
    var hops   = Math.min(a, b);
    // Only specialize when one addend is ≤3 and the other is ≥5.
    // Below that, the rest of the curriculum (small + small) needs ten-frame
    // visuals; above that, the arrow approach is fine.
    if (hops > 3 || anchor < 5) return additionLine(problem);

    var Canvas = C(); if (!Canvas) return;
    var range = chooseLineRange(Math.max(sum, 10));

    await Canvas.humphreyClear();
    await Canvas.humphreyDrawNumberLine(range[0], range[1], { y: 240 });

    // Anchor dot at the larger number
    await Canvas.humphreyDrawCircle(anchor, 240, 14, {
      color: '#ec4899', fill: '#ec4899', duration: 350,
    });
    await Canvas.humphreyDrawText(anchor, 180, 'Start at ' + anchor, {
      color: '#0a0b2e',
      font: '600 26px Fredoka, system-ui, sans-serif',
    });

    // One small arrow per hop, each labeled "+1", in a different color per hop
    var palette = ['#14b8d4', '#a855f7', '#f59e0b'];
    for (var i = 0; i < hops; i++) {
      var fromN = anchor + i;
      var toN   = anchor + i + 1;
      await Canvas.humphreyDrawArrow(fromN, 210, toN, 210, {
        color: palette[i % palette.length], width: 4, duration: 380,
      });
      await Canvas.humphreyDrawText((fromN + toN) / 2, 175, '+1', {
        color: palette[i % palette.length],
        font: '600 20px Fredoka, system-ui, sans-serif',
      });
    }

    // Circle the result + the "= sum" label
    await Canvas.humphreyDrawCircle(sum, 240, 32, {
      color: '#22c55e', width: 6, duration: 600,
    });
    await Canvas.humphreyDrawText(sum, 320, '= ' + sum, {
      color: '#22c55e',
      font: '700 32px Fredoka, system-ui, sans-serif',
    });
  }

  /**
   * Subtract-from-10: 10 - N. Draw a ten-frame at the canvas top showing
   * 10 dots, then animate crossing out N of them. Anchors the "10 - n"
   * subtraction facts which are foundational for borrowing and make-10.
   *
   * Only specializes when the minuend is exactly 10. For other subtractions
   * (8 - 3, 14 - 5), use the standard subtraction number line — it stays
   * the better visualization for those.
   */
  async function subtractFromTenLine(problem) {
    var parsed = parseAddSub(problem.question || problem.prompt);
    if (!parsed || parsed.op !== '-') return;
    if (parsed.a !== 10) return subtractionLine(problem);
    var taken = parsed.b;
    var leftover = parsed.result;

    var Canvas = C(); if (!Canvas) return;

    await Canvas.humphreyClear();

    // Draw a 5x2 ten-frame grid centered horizontally on the canvas.
    // Coordinates are in virtual 0-1000 pixel space (Canvas helpers scale).
    var cellW = 80, cellH = 80, gap = 10;
    var totalW = 5 * cellW + 4 * gap;          // 5 cells across
    var gridLeftX = (1000 - totalW) / 2;       // center horizontally
    var gridTopY  = 60;

    // Draw 10 cells (5x2) and a dot in each
    var cells = [];
    for (var r = 0; r < 2; r++) {
      for (var c = 0; c < 5; c++) {
        var x = gridLeftX + c * (cellW + gap);
        var y = gridTopY + r * (cellH + gap);
        // Frame outline (4 lines)
        await Canvas.humphreyDrawLine(x, y, x + cellW, y, { color: '#94a3b8', width: 2, duration: 60 });
        await Canvas.humphreyDrawLine(x + cellW, y, x + cellW, y + cellH, { color: '#94a3b8', width: 2, duration: 60 });
        await Canvas.humphreyDrawLine(x + cellW, y + cellH, x, y + cellH, { color: '#94a3b8', width: 2, duration: 60 });
        await Canvas.humphreyDrawLine(x, y + cellH, x, y, { color: '#94a3b8', width: 2, duration: 60 });
        // Center dot
        var dotX = x + cellW / 2;
        var dotY = y + cellH / 2;
        await Canvas.humphreyDrawCircle(dotX, dotY, 22, {
          color: '#ec4899', fill: '#ec4899', duration: 100,
        });
        cells.push({ x: dotX, y: dotY, cellW: cellW, cellH: cellH });
      }
    }

    // Cross out `taken` dots from the right side (rightmost first)
    for (var i = 0; i < taken && i < cells.length; i++) {
      var cell = cells[cells.length - 1 - i];
      var d = cell.cellW * 0.32;
      await Canvas.humphreyDrawLine(
        cell.x - d, cell.y - d, cell.x + d, cell.y + d,
        { color: '#1a1554', width: 6, duration: 220 }
      );
      await Canvas.humphreyDrawLine(
        cell.x - d, cell.y + d, cell.x + d, cell.y - d,
        { color: '#1a1554', width: 6, duration: 220 }
      );
    }

    // Equation below the frame
    await Canvas.humphreyDrawText(500, 280, '10 \u2212 ' + taken + ' = ' + leftover, {
      color: '#22c55e',
      font: '700 42px Fredoka, system-ui, sans-serif',
    });
  }

  // ---- Registry -------------------------------------------------------------

  // Each entry is a "smart dispatcher" — the specialized fn (countOnLine,
  // subtractFromTenLine) checks the parsed problem and either renders its
  // specialized view OR delegates to the standard fn for that op. Keeping
  // the dispatch inside each fn means the registry stays flat and adding a
  // new strategy is a 1-line change here.
  var registry = {
    subtract_within_10: subtractFromTenLine,   // was subtractionLine — specializes 10-N
    subtract_within_20: subtractFromTenLine,   // ditto
    add_within_10: countOnLine,                // was additionLine — specializes count-on
    add_within_20: countOnLine,                // ditto
    make_10: makeTenLine,
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
    // Exposed for console debug + verification — call from DevTools as
    //   HeroAcademy.CanvasSkills._parseAddSub('Gabriel gives him 5 more apples')
    _parseAddSub: parseAddSub,
    _inferOp: inferOp,
  };
})();
