/**
 * Hero Academy — Letter Strokes (v103)
 *
 * Stroke-by-stroke character animations for Ms. Humphrey's "Watch me draw it"
 * demo. Letters and digits are defined as ordered sequences of strokes,
 * where each stroke is a polyline (array of {x,y} points). The animator uses
 * canvas.js's humphreyDrawLine to animate each segment in turn, chained as
 * promises — pen-lift pause between strokes.
 *
 * COORDINATE SYSTEM:
 *   Each character is defined in a centered "letter box":
 *     x in [-200, 200], y in [-250, 250]  (y is DOWN; -250 is top)
 *   At render time the animator scales + translates to the canvas. Default
 *   render position is (500, 375) in canvas virtual coords (1000 wide x 750
 *   tall). For multi-digit numbers, scale is 0.65 and centers shift apart.
 *
 * SHIP SCOPE (v103):
 *   - All 10 digits (0-9)   <-- Josh's stated focus
 *   - Uppercase A, B, C, D, E
 *   Other characters fall back to humphreyDrawText (v102 behavior).
 *
 * v104: animator now uses Canvas.virtualDims() to dynamically center letters
 *   in the actual canvas (vertical center varies by aspect ratio — 4:3 vs
 *   1:1 on mobile) and clamp scale so letters never overflow the canvas.
 *
 * PUBLIC API:
 *   HeroAcademy.LetterStrokes.has(char)              -> boolean
 *   HeroAcademy.LetterStrokes.animate(char, opts)    -> Promise
 *   HeroAcademy.LetterStrokes.animateSequence(chars, opts) -> Promise
 *
 *   opts:
 *     cx, cy           - center in canvas virtual coords (def 500, 375)
 *     scale            - scale factor (def 1)
 *     color            - pen color (def #ec4899 magenta)
 *     strokeDuration   - ms per stroke (def 800)
 *     interStrokePause - ms pause between strokes (def 250)
 */
(function () {
  'use strict';
  var NS = window.HeroAcademy = window.HeroAcademy || {};
  if (NS.LetterStrokes) return;

  // -------- Curve helpers --------
  // arc(cx, cy, rx, ry, startAngle, endAngle, n) -> polyline of n+1 points.
  // Angles in radians: 0=right, pi/2=down, pi=left, -pi/2=up (canvas y-down).
  function arc(cx, cy, rx, ry, sA, eA, n) {
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var t = sA + (eA - sA) * i / n;
      pts.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
    }
    return pts;
  }
  function line(x1, y1, x2, y2) { return [{x:x1,y:y1}, {x:x2,y:y2}]; }

  // -------- Character stroke definitions --------
  var STROKES = {
    // ========== DIGITS ==========
    '0': {
      strokes: [
        arc(0, 0, 130, 220, -Math.PI/2, 3*Math.PI/2, 28)
      ],
      voiceLines: ['Start at the top and go around in an oval.'],
    },
    '1': {
      strokes: [
        line(-70, -180, 0, -240),
        line(0, -240, 0, 230),
        line(-90, 230, 90, 230),
      ],
      voiceLines: ['Little flag, tall line down, then a line on the bottom.'],
    },
    '2': {
      strokes: [
        // Top hump (left→top→right) + smooth S-bend down to bottom-left + bottom horizontal.
        // Note: the lead-in point (-120, -160) matches arc[0] exactly (no jump).
        arc(0, -160, 120, 80, Math.PI, 2*Math.PI, 10)
          .concat([
            {x:120, y:-100},  {x:90,  y:-40},   {x:30,   y:30},
            {x:-50, y:110},   {x:-130,y:200},   {x:-140, y:230},
            {x:140, y:230}
          ])
      ],
      voiceLines: ['Curve around the top, slide down, then a line across the bottom.'],
    },
    '3': {
      strokes: [
        // Two bumps stacked. Top semicircle (left to right through top) +
        // middle pinch + bottom semicircle (right to left through bottom).
        // No lead-in points — let the polyline begin at the arc's start.
        arc(0, -120, 130, 110, -Math.PI, 0, 12)
          .concat([{x:60, y:0}])
          .concat(arc(0, 120, 130, 110, 0, Math.PI, 12))
      ],
      voiceLines: ['Two bumps stacked, like a backwards letter B.'],
    },
    '4': {
      strokes: [
        line(-80, -200, -150, 50),
        line(-150, 50, 150, 50),
        line(80, -230, 80, 230),
      ],
      voiceLines: ['Slant down, line across, then a tall line straight down on the right.'],
    },
    '5': {
      strokes: [
        line(130, -230, -120, -230),
        line(-120, -230, -120, -20),
        // Bottom semicircle — arc centered so the TOP of the arc lines up
        // exactly with the bottom of the left vertical (-120, -20). No jump.
        arc(-120, 100, 130, 120, -Math.PI/2, Math.PI/2, 14)
      ],
      voiceLines: ['Line across the top, line down the side, then a curve around the bottom.'],
    },
    '6': {
      strokes: [
        // One continuous "snail-shell" stroke: swoop from upper-right around
        // to the bottom-left, then loop at the bottom. Hand-crafted to avoid
        // any pen-jump artifacts.
        [
          {x:120, y:-220},  {x:40,  y:-240}, {x:-30, y:-225},
          {x:-100,y:-185},  {x:-150,y:-115}, {x:-170,y:-30},
          {x:-160,y:60},    {x:-130,y:140},  {x:-80, y:200},
          {x:-10, y:230},   {x:60,  y:225},  {x:125, y:195},
          {x:160, y:140},   {x:165, y:75},   {x:140, y:20},
          {x:85,  y:-10},   {x:15,  y:-15},  {x:-55, y:5},
          {x:-115,y:45},    {x:-150,y:100}
        ]
      ],
      voiceLines: ['Curve down from the top, then make a loop at the bottom.'],
    },
    '7': {
      strokes: [
        line(-130, -230, 130, -230),
        line(130, -230, -40, 230),
      ],
      voiceLines: ['Line across the top, then a slant all the way down.'],
    },
    '8': {
      strokes: [
        arc(0, -110, 95, 105, -Math.PI/2, 3*Math.PI/2, 18),
        arc(0, 130, 125, 115, -Math.PI/2, 3*Math.PI/2, 20),
      ],
      voiceLines: ['Small circle on top, then a bigger circle on the bottom.'],
    },
    '9': {
      strokes: [
        // Circle on top + tail. Arc starts and ends at the right side
        // (angle 0 → -2π = full CCW circle). Tail continues straight down
        // from the exact endpoint — no pen jump.
        arc(0, -100, 115, 125, 0, -2*Math.PI, 20)
          .concat([{x:115, y:230}])
      ],
      voiceLines: ['Circle on the top, then a long tail going down.'],
    },

    // ========== UPPERCASE ==========
    'A': {
      strokes: [
        line(0, -230, -150, 230),
        line(0, -230, 150, 230),
        line(-100, 80, 100, 80),
      ],
      voiceLines: ['Up the hill, down the hill, then a line across the middle.'],
    },
    'B': {
      strokes: [
        line(-130, -230, -130, 230),
        [{x:-130, y:-230}].concat(arc(-130, -115, 130, 115, -Math.PI/2, Math.PI/2, 12)),
        [{x:-130, y:0}].concat(arc(-130, 115, 140, 115, -Math.PI/2, Math.PI/2, 12)),
      ],
      voiceLines: ['Line down, bump at the top, bump at the bottom.'],
    },
    'C': {
      strokes: [
        // C opens right: traverse the LEFT half of the oval from top-right
        // opening, through the left side, ending at bottom-right opening.
        // Angles decrease from -π/2+0.5 through -π (LEFT) to -3π/2+0.5.
        arc(0, 0, 170, 230, -Math.PI/2 + 0.5, -3*Math.PI/2 + 0.5, 20)
      ],
      voiceLines: ['One big curve, like a smile on its side.'],
    },
    'D': {
      strokes: [
        line(-130, -230, -130, 230),
        [{x:-130, y:-230}].concat(arc(-130, 0, 230, 230, -Math.PI/2, Math.PI/2, 16))
      ],
      voiceLines: ['Line down, then one big bump out to the right.'],
    },
    'E': {
      strokes: [
        line(-130, -230, -130, 230),
        line(-130, -230, 130, -230),
        line(-130, 0, 90, 0),
        line(-130, 230, 130, 230),
      ],
      voiceLines: ['Line down, then three lines across the top, middle, and bottom.'],
    },
    'F': {
      strokes: [
        line(-100, -250, -100, 230),
        line(-100, -250, 130, -250),
        line(-100, 0, 90, 0),
      ],
      voiceLines: ['Tall line down, then two lines across the top and middle.'],
    },
    'G': {
      strokes: [
        arc(0, 0, 140, 230, -Math.PI*0.18, -Math.PI*1.82, 22),
        [{x:130, y:42}, {x:130, y:80}, {x:40, y:80}],
      ],
      voiceLines: ['Like the letter C, then add a small line across inside.'],
    },
    'H': {
      strokes: [
        line(-110, -250, -110, 250),
        line(110, -250, 110, 250),
        line(-110, 0, 110, 0),
      ],
      voiceLines: ['Two tall lines down, then a line across the middle.'],
    },
    'I': {
      strokes: [
        line(-80, -250, 80, -250),
        line(0, -250, 0, 250),
        line(-80, 250, 80, 250),
      ],
      voiceLines: ['Line on top, tall line down the middle, line on the bottom.'],
    },
    'J': {
      strokes: [
        line(-30, -250, 130, -250),
        [{x:80, y:-250}, {x:80, y:130}].concat(arc(0, 130, 80, 100, 0, Math.PI, 12)),
      ],
      voiceLines: ['Line across the top, then down with a curve at the bottom.'],
    },
    'K': {
      strokes: [
        line(-110, -250, -110, 250),
        [{x:110, y:-250}, {x:-110, y:0}, {x:130, y:250}],
      ],
      voiceLines: ['Tall line down, then a slant in and a slant out.'],
    },
    'L': {
      strokes: [
        [{x:-100, y:-250}, {x:-100, y:230}, {x:120, y:230}],
      ],
      voiceLines: ['Tall line down, then a line across the bottom.'],
    },
    'M': {
      strokes: [
        [{x:-130, y:250}, {x:-130, y:-250}, {x:0, y:50}, {x:130, y:-250}, {x:130, y:250}],
      ],
      voiceLines: ['Line up, slant down to the middle, slant up, line down.'],
    },
    'N': {
      strokes: [
        [{x:-110, y:250}, {x:-110, y:-250}, {x:110, y:250}, {x:110, y:-250}],
      ],
      voiceLines: ['Line up, big slant down, line back up.'],
    },
    'O': {
      strokes: [
        arc(0, 0, 130, 220, -Math.PI/2, 3*Math.PI/2, 28),
      ],
      voiceLines: ['Make a big round oval, like the number zero.'],
    },
    'P': {
      strokes: [
        line(-110, -250, -110, 250),
        [{x:-110, y:-250}].concat(arc(-110, -125, 140, 125, -Math.PI/2, Math.PI/2, 14)),
      ],
      voiceLines: ['Tall line down, then a bump at the top.'],
    },
    'Q': {
      strokes: [
        arc(0, 0, 130, 220, -Math.PI/2, 3*Math.PI/2, 28),
        line(50, 130, 170, 250),
      ],
      voiceLines: ['Make an oval like O, then add a little tail at the bottom.'],
    },
    'R': {
      strokes: [
        line(-110, -250, -110, 250),
        [{x:-110, y:-250}].concat(arc(-110, -125, 140, 125, -Math.PI/2, Math.PI/2, 14)),
        line(-110, 0, 130, 250),
      ],
      voiceLines: ['Tall line down, bump at the top, then a slanted leg.'],
    },
    'S': {
      strokes: [
        [
          {x:130, y:-180}, {x:80, y:-240}, {x:0, y:-250},
          {x:-80, y:-240}, {x:-130, y:-180}, {x:-100, y:-100},
          {x:0, y:-30}, {x:60, y:0}, {x:110, y:50},
          {x:140, y:130}, {x:80, y:230}, {x:0, y:250},
          {x:-80, y:240}, {x:-140, y:180}
        ],
      ],
      voiceLines: ['Curve like a snake from the top, down, and around.'],
    },
    'T': {
      strokes: [
        line(-130, -250, 130, -250),
        line(0, -250, 0, 250),
      ],
      voiceLines: ['Line across the top, then a tall line down the middle.'],
    },
    'U': {
      strokes: [
        [{x:-120, y:-250}]
          .concat(arc(0, -50, 120, 200, Math.PI, 0, 16))
          .concat([{x:120, y:-250}]),
      ],
      voiceLines: ['Curve down and around, like a smile or a cup.'],
    },
    'V': {
      strokes: [
        [{x:-130, y:-250}, {x:0, y:250}, {x:130, y:-250}],
      ],
      voiceLines: ['Slant down to a point, then slant up.'],
    },
    'W': {
      strokes: [
        [{x:-140, y:-250}, {x:-70, y:250}, {x:0, y:0}, {x:70, y:250}, {x:140, y:-250}],
      ],
      voiceLines: ['Slant down, slant up, slant down, slant up — like two Vs.'],
    },
    'X': {
      strokes: [
        line(-130, -250, 130, 250),
        line(130, -250, -130, 250),
      ],
      voiceLines: ['Two slanted lines that cross in the middle.'],
    },
    'Y': {
      strokes: [
        [{x:-130, y:-250}, {x:0, y:0}, {x:130, y:-250}],
        line(0, 0, 0, 250),
      ],
      voiceLines: ['Two slants that meet in the middle, then a line down.'],
    },
    'Z': {
      strokes: [
        [{x:-130, y:-250}, {x:130, y:-250}, {x:-130, y:250}, {x:130, y:250}],
      ],
      voiceLines: ['Line across, slant down, line across the bottom.'],
    },

    // ========== LOWERCASE ==========
    'a': {
      strokes: [
        arc(0, 80, 90, 100, -Math.PI/2, 3*Math.PI/2, 18),
        line(90, -20, 90, 180),
      ],
      voiceLines: ['Round circle, then a line down the right side.'],
    },
    'b': {
      strokes: [
        line(-100, -250, -100, 180),
        arc(-100, 90, 100, 90, -Math.PI/2, Math.PI/2, 12),
      ],
      voiceLines: ['Tall line down, then a bump at the bottom.'],
    },
    'c': {
      strokes: [
        arc(0, 80, 90, 100, -Math.PI/4, -7*Math.PI/4, 18),
      ],
      voiceLines: ['Curve open to the right, like a backwards C... wait, just like a C!'],
    },
    'd': {
      strokes: [
        arc(0, 80, 90, 100, -Math.PI/2, 3*Math.PI/2, 18),
        line(90, -250, 90, 180),
      ],
      voiceLines: ['Round circle, then a tall line down the right side.'],
    },
    'e': {
      strokes: [
        line(-80, 60, 80, 60),
        arc(0, 80, 90, 100, -Math.PI/3, -5*Math.PI/3, 16),
      ],
      voiceLines: ['Short line across, then a curve like a C.'],
    },
    'f': {
      strokes: [
        [
          {x:80, y:-200}, {x:70, y:-230}, {x:40, y:-250}, {x:10, y:-245},
          {x:-10, y:-220}, {x:-10, y:180}
        ],
        line(-80, -20, 60, -20),
      ],
      voiceLines: ['Hook at the top, then straight down, with a cross in the middle.'],
    },
    'g': {
      strokes: [
        arc(0, 80, 90, 100, -Math.PI/2, 3*Math.PI/2, 18),
        [
          {x:90, y:-20}, {x:90, y:200},
          {x:70, y:235}, {x:30, y:250}, {x:-20, y:240}, {x:-50, y:215}
        ],
      ],
      voiceLines: ['Round circle, then a tail that goes down and curves left.'],
    },
    'h': {
      strokes: [
        line(-90, -250, -90, 180),
        arc(0, 0, 90, 80, -Math.PI, 0, 10).concat([{x:90, y:180}]),
      ],
      voiceLines: ['Tall line down, then a bump on the right side.'],
    },
    'i': {
      strokes: [
        line(0, -20, 0, 180),
        arc(0, -155, 14, 14, -Math.PI/2, 3*Math.PI/2, 8),
      ],
      voiceLines: ['Short line down, then a dot on top.'],
    },
    'j': {
      strokes: [
        [{x:30, y:-20}, {x:30, y:200}].concat(arc(0, 200, 30, 50, 0, Math.PI, 8)),
        arc(30, -155, 14, 14, -Math.PI/2, 3*Math.PI/2, 8),
      ],
      voiceLines: ['Line down with a curve at the bottom, then a dot on top.'],
    },
    'k': {
      strokes: [
        line(-100, -250, -100, 180),
        [{x:80, y:-20}, {x:-100, y:80}, {x:100, y:180}],
      ],
      voiceLines: ['Tall line down, then a slant in and a slant out.'],
    },
    'l': {
      strokes: [
        line(0, -250, 0, 180),
      ],
      voiceLines: ['Just a tall straight line down.'],
    },
    'm': {
      strokes: [
        line(-130, -20, -130, 180),
        arc(-65, -20, 65, 50, -Math.PI, 0, 8).concat([{x:0, y:180}]),
        arc(65, -20, 65, 50, -Math.PI, 0, 8).concat([{x:130, y:180}]),
      ],
      voiceLines: ['Line down, then two bumps like little hills.'],
    },
    'n': {
      strokes: [
        line(-90, -20, -90, 180),
        arc(0, -20, 90, 50, -Math.PI, 0, 10).concat([{x:90, y:180}]),
      ],
      voiceLines: ['Line down, then one bump like a hill.'],
    },
    'o': {
      strokes: [
        arc(0, 80, 90, 100, -Math.PI/2, 3*Math.PI/2, 18),
      ],
      voiceLines: ['Make a small round oval.'],
    },
    'p': {
      strokes: [
        line(-90, -20, -90, 250),
        arc(-90, 80, 110, 100, -Math.PI/2, Math.PI/2, 14),
      ],
      voiceLines: ['Long line down past the bottom, then a bump on top.'],
    },
    'q': {
      strokes: [
        arc(0, 80, 90, 100, -Math.PI/2, 3*Math.PI/2, 18),
        [{x:90, y:-20}, {x:90, y:200}, {x:130, y:240}],
      ],
      voiceLines: ['Round circle, then a tail going down and curving right.'],
    },
    'r': {
      strokes: [
        line(-50, -20, -50, 180),
        [{x:-50, y:-20}, {x:-30, y:-30}, {x:0, y:-30}, {x:30, y:-20}, {x:40, y:0}],
      ],
      voiceLines: ['Line down, then a small hook at the top.'],
    },
    's': {
      strokes: [
        [
          {x:60, y:-10}, {x:30, y:-25}, {x:-20, y:-18}, {x:-50, y:10},
          {x:-30, y:50}, {x:10, y:75}, {x:50, y:100}, {x:60, y:135},
          {x:40, y:170}, {x:0, y:180}, {x:-50, y:170}, {x:-60, y:145}
        ],
      ],
      voiceLines: ['Curve like a little snake — top, middle, bottom.'],
    },
    't': {
      strokes: [
        [{x:0, y:-200}, {x:0, y:150}].concat(arc(0, 150, 40, 30, -Math.PI/2, 0, 6)),
        line(-60, -20, 60, -20),
      ],
      voiceLines: ['Line down with a little curve at the bottom, then a cross.'],
    },
    'u': {
      strokes: [
        [{x:-90, y:-20}, {x:-90, y:80}]
          .concat(arc(0, 80, 90, 100, Math.PI, 0, 12))
          .concat([{x:90, y:-20}]),
        line(90, -20, 90, 180),
      ],
      voiceLines: ['Curve down and around like a cup, then a short line down.'],
    },
    'v': {
      strokes: [
        [{x:-90, y:-20}, {x:0, y:180}, {x:90, y:-20}],
      ],
      voiceLines: ['Slant down to a point, then slant up.'],
    },
    'w': {
      strokes: [
        [{x:-130, y:-20}, {x:-70, y:180}, {x:0, y:30}, {x:70, y:180}, {x:130, y:-20}],
      ],
      voiceLines: ['Slant down, slant up, slant down, slant up — like two little vs.'],
    },
    'x': {
      strokes: [
        line(-80, -20, 80, 180),
        line(80, -20, -80, 180),
      ],
      voiceLines: ['Two slanted lines that cross.'],
    },
    'y': {
      strokes: [
        line(-90, -20, 0, 130),
        [{x:90, y:-20}, {x:-50, y:250}],
      ],
      voiceLines: ['Short slant down, then a long slant that goes below the line.'],
    },
    'z': {
      strokes: [
        [{x:-80, y:-20}, {x:80, y:-20}, {x:-80, y:180}, {x:80, y:180}],
      ],
      voiceLines: ['Line across, slant down, line across the bottom.'],
    },
  };

  // -------- Animator --------
  function has(char) { return STROKES.hasOwnProperty(char); }

  // v104: dynamic centering. The canvas is 4:3 on tablets but 1:1 on small
  // screens (Galaxy Tab portrait), so virtual height varies (750 vs 1000).
  // Default cy = canvas vertical center, and scale is clamped to ensure the
  // 500-unit-tall letter fits within the canvas with 60u padding top+bottom.
  function getCanvasCenterY() {
    if (NS.Canvas && NS.Canvas.virtualDims) {
      try { return NS.Canvas.virtualDims().h / 2; } catch (e) {}
    }
    return 375;  // fallback: assume 4:3 canvas, height 750
  }
  function getCanvasMaxScale() {
    if (NS.Canvas && NS.Canvas.virtualDims) {
      try {
        var h = NS.Canvas.virtualDims().h;
        // Letter box is 500u tall (y in [-250, 250]). Reserve 60u padding
        // top+bottom = 120u. Max scale = (h - 120) / 500.
        return Math.max(0.3, Math.min(1, (h - 120) / 500));
      } catch (e) {}
    }
    return 1;
  }

  function animate(char, opts) {
    opts = opts || {};
    var cx = opts.cx == null ? 500 : opts.cx;
    var cy = opts.cy == null ? getCanvasCenterY() : opts.cy;
    var scale = opts.scale == null ? getCanvasMaxScale() : opts.scale;
    var color = opts.color || '#ec4899';
    // v107: pen SPEED instead of per-stroke duration. Each unit of path length
    // takes the same time, so curves don't fly by while straight lines drag.
    // Default 0.42 units/ms ≈ ~2.4s for a 1000-unit stroke. Tuned to be
    // followable but not boring for a 7yo.
    var penSpeed = opts.penSpeed == null ? 0.42 : opts.penSpeed;
    var interStrokePause = opts.interStrokePause == null ? 320 : opts.interStrokePause;

    var data = STROKES[char];
    if (!data) return Promise.reject(new Error('No stroke data for ' + char));
    if (!NS.Canvas || !NS.Canvas.humphreyDrawLine) return Promise.reject(new Error('Canvas not ready'));

    function project(p) { return { x: cx + p.x * scale, y: cy + p.y * scale }; }

    var promiseChain = Promise.resolve();
    data.strokes.forEach(function (polyline, strokeIdx) {
      promiseChain = promiseChain.then(function () {
        return animatePolyline(polyline.map(project), color, penSpeed);
      });
      if (strokeIdx < data.strokes.length - 1) {
        promiseChain = promiseChain.then(function () {
          return new Promise(function (r) { setTimeout(r, interStrokePause); });
        });
      }
    });
    return promiseChain;
  }

  // v107: animate at CONSTANT PEN SPEED + visible PEN TIP CURSOR.
  //
  // Each segment's duration is its length divided by penSpeed (units/ms),
  // so the pen moves at constant velocity whether tracing a straight line
  // or a tight curve approximated by many short segments.
  //
  // The pen tip cursor (a filled magenta circle) is painted on a SEPARATE
  // overlay canvas that we manage ourselves — it sits above the humphrey
  // layer, gets cleared each frame, and shows Nigel exactly where the "pen"
  // is at any moment. Without this cursor the line just extends silently,
  // which a 7yo perceives as "the letter appeared" instead of "she drew it".
  function animatePolyline(points, color, penSpeed) {
    if (points.length < 2) return Promise.resolve();

    var penOverlay = ensurePenOverlay();

    var chain = Promise.resolve();
    for (var i = 0; i < points.length - 1; i++) {
      (function (i) {
        var p1 = points[i], p2 = points[i+1];
        var dx = p2.x - p1.x;
        var dy = p2.y - p1.y;
        var segLen = Math.sqrt(dx*dx + dy*dy);
        var segDuration = Math.max(80, segLen / penSpeed);

        chain = chain.then(function () {
          // Kick off the actual ink drawing on Humphrey's layer
          var inkPromise = NS.Canvas.humphreyDrawLine(p1.x, p1.y, p2.x, p2.y, {
            color: color,
            duration: segDuration,
            width: 10,  // v107: extra-thick ink — easy to follow
          });
          // Simultaneously animate the pen cursor along the same path
          animatePenCursor(penOverlay, p1, p2, segDuration);
          return inkPromise;
        });
      })(i);
    }

    return chain.then(function () {
      // Hide pen cursor when this polyline is done
      setTimeout(function () { clearPenOverlay(penOverlay); }, 180);
    });
  }

  // Set up an overlay <canvas> that lives above the humphreyLayer in the
  // same wrapper. We position-stack it absolutely on top so the pen cursor
  // visually rides on top of the ink. It uses the same virtual coord system
  // by querying Canvas.virtualDims().
  function ensurePenOverlay() {
    if (typeof document === 'undefined') return null;
    var existing = document.getElementById('ha-pen-overlay');
    if (existing) return existing;

    var humphrey = document.querySelector('canvas.ha-canvas-layer--humphrey');
    if (!humphrey || !humphrey.parentNode) return null;

    var overlay = document.createElement('canvas');
    overlay.id = 'ha-pen-overlay';
    overlay.width = humphrey.width;
    overlay.height = humphrey.height;
    overlay.style.position = 'absolute';
    overlay.style.left = humphrey.style.left || '0';
    overlay.style.top = humphrey.style.top || '0';
    overlay.style.width = humphrey.style.width || '100%';
    overlay.style.height = humphrey.style.height || '100%';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '5';
    humphrey.parentNode.appendChild(overlay);
    return overlay;
  }

  function clearPenOverlay(overlay) {
    if (!overlay) return;
    var ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
  }

  // Animate a pen-tip circle from p1 to p2 over `durationMs`. Synchronizes
  // with humphreyDrawLine which is filling the line behind it. Coordinates
  // are in the same virtual space as canvas.js (0-1000 wide), translated
  // here via the actual canvas pixel dimensions.
  function animatePenCursor(overlay, p1, p2, durationMs) {
    if (!overlay) return;
    var ctx = overlay.getContext('2d');
    var dims = (NS.Canvas && NS.Canvas.virtualDims) ? NS.Canvas.virtualDims() : { w: 1000, h: 750 };
    var scaleX = overlay.width / dims.w;
    var scaleY = overlay.height / dims.h;

    var start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    function frame() {
      var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      var t = Math.min(1, (now - start) / durationMs);
      var x = (p1.x + (p2.x - p1.x) * t) * scaleX;
      var y = (p1.y + (p2.y - p1.y) * t) * scaleY;

      ctx.clearRect(0, 0, overlay.width, overlay.height);
      // Outer glow
      ctx.save();
      ctx.fillStyle = 'rgba(236, 72, 153, 0.35)';
      ctx.beginPath();
      ctx.arc(x, y, 22 * scaleX, 0, Math.PI * 2);
      ctx.fill();
      // Inner solid dot — the "pen tip"
      ctx.fillStyle = '#ec4899';
      ctx.beginPath();
      ctx.arc(x, y, 12 * scaleX, 0, Math.PI * 2);
      ctx.fill();
      // White highlight to give it a 3D dot look
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(x - 3 * scaleX, y - 3 * scaleX, 4 * scaleX, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (t < 1 && typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(frame);
      }
    }
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(frame);
    }
  }

  // Multi-char sequence: scale down + lay out side by side.
  function animateSequence(chars, opts) {
    opts = opts || {};
    var n = chars.length;
    if (n === 0) return Promise.resolve();
    if (n === 1) return animate(chars[0], opts);

    var scale, spacing;
    if (n === 2)      { scale = 0.65; spacing = 300; }
    else if (n === 3) { scale = 0.45; spacing = 220; }
    else              { scale = 0.35; spacing = 170; }

    // v104: clamp scale against the canvas-fit max so multi-digit numbers
    // never overflow on a short canvas.
    var maxScale = getCanvasMaxScale();
    if (scale > maxScale) scale = maxScale;

    var firstCx = 500 - spacing * (n - 1) / 2;
    var cy = opts.cy == null ? getCanvasCenterY() : opts.cy;
    var perCharPause = 400;

    var chain = Promise.resolve();
    chars.forEach(function (char, i) {
      chain = chain.then(function () {
        return animate(char, {
          cx: firstCx + i * spacing,
          cy: cy,
          scale: scale,
          color: opts.color,
          strokeDuration: opts.strokeDuration,
          interStrokePause: opts.interStrokePause,
        });
      });
      if (i < n - 1) {
        chain = chain.then(function () {
          return new Promise(function (r) { setTimeout(r, perCharPause); });
        });
      }
    });
    return chain;
  }

  NS.LetterStrokes = {
    has: has,
    animate: animate,
    animateSequence: animateSequence,
    // expose for debugging / future tooling
    _STROKES: STROKES,
  };
})();
