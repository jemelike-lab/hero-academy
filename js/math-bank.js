// =========================================================================
// js/math-bank.js — v180
//
// Coded math problem bank. v180 introduces double-digit addition as Nigel's
// new working level. The set is designed to ALTERNATE with Haiku-generated
// questions inside Class Time math courses so:
//   - half the problems are stable and deterministic (this bank), so you
//     can sanity-check progression without depending on Haiku output,
//   - half are fresh daily (the Haiku endpoint), so the lesson doesn't feel
//     repetitive.
//
// Bank shape mirrors V171_BANK item shape inside class-time-mc.js:
//   { topic, question, options[], correct_index, explanation, hint,
//     remediation: { intro, steps[{say, board}], outro } }
//
// 60 problems total, split between non-regrouping (28) and regrouping (32),
// spread across a wide range of two-digit operands so the kid doesn't see
// the same pair on consecutive days.
// =========================================================================
(function () {
  'use strict';
  const NS = (window.HeroAcademy = window.HeroAcademy || {});

  // ---- Source pairs ------------------------------------------------------
  // No regrouping: ones-digit sum stays < 10.
  const NO_REGROUP = [
    [11, 23], [12, 14], [15, 21], [16, 22], [17, 12], [18, 11], [21, 13],
    [22, 24], [23, 15], [24, 11], [25, 12], [26, 13], [27, 21], [28, 11],
    [31, 14], [32, 25], [33, 14], [34, 15], [35, 23], [36, 12], [41, 23],
    [42, 16], [43, 12], [44, 11], [45, 13], [46, 22], [47, 11], [52, 13],
  ];

  // With regrouping: ones-digit sum >= 10, requires carrying a ten.
  const REGROUP = [
    [27, 15], [38, 16], [29, 14], [36, 28], [47, 25], [48, 19], [56, 27],
    [39, 26], [25, 17], [34, 38], [46, 16], [37, 24], [45, 28], [18, 25],
    [28, 39], [54, 19], [33, 27], [44, 36], [55, 18], [62, 19], [17, 26],
    [29, 38], [48, 25], [36, 19], [27, 26], [35, 18], [56, 17], [49, 12],
    [58, 14], [67, 13], [19, 17], [38, 23],
  ];

  // ---- Distractor generation --------------------------------------------
  // Plausible wrong answers: ±1 (counting slip), ±10 (place-value confusion),
  // sum-with-no-carry (forgot to regroup). We pull three from the candidate
  // pool, skip duplicates, and pad if too few survived.
  function buildOptions(a, b) {
    const correct = a + b;
    const carryFloor = (Math.floor(a / 10) + Math.floor(b / 10)) * 10 + ((a % 10) + (b % 10)) % 10; // forgot carry
    const candidates = [
      correct - 1, correct + 1,
      correct - 10, correct + 10,
      carryFloor !== correct ? carryFloor : null,
      correct - 2,
    ].filter((n) => n != null && n > 0 && n !== correct);
    // De-dupe
    const seen = new Set();
    const distractors = [];
    for (const c of candidates) {
      if (!seen.has(c)) { seen.add(c); distractors.push(c); }
      if (distractors.length >= 3) break;
    }
    while (distractors.length < 3) distractors.push(correct + distractors.length + 5);
    // Place correct at a position derived from operands so it's stable per
    // problem but spread across all four slots across the bank.
    const correctIdx = ((a * 31 + b) % 4 + 4) % 4;
    const opts = distractors.slice();
    opts.splice(correctIdx, 0, correct);
    return { options: opts.slice(0, 4).map(String), correct_index: correctIdx };
  }

  // ---- Remediation script per problem -----------------------------------
  function buildRemediation(a, b, isRegroup) {
    const sum = a + b;
    const onesA = a % 10;
    const onesB = b % 10;
    const tensA = Math.floor(a / 10);
    const tensB = Math.floor(b / 10);
    const onesSum = onesA + onesB;
    const carry = onesSum >= 10 ? 1 : 0;
    const newOnes = onesSum % 10;
    const tensSum = tensA + tensB + carry;

    const steps = [
      { say: `Here's our problem.`, board: { tool: 'drawEquation', args: { equation: `${a} + ${b} = ?` } } },
      { say: `Add the ones first. ${onesA} plus ${onesB} is ${onesSum}.`, board: { tool: 'drawEquation', args: { equation: `${onesA} + ${onesB} = ${onesSum}` } } },
    ];
    if (isRegroup) {
      steps.push({ say: `${onesSum} is ten or more, so we carry a one to the tens place.`, board: { tool: 'writeWord', args: { word: `carry 1` } } });
    }
    steps.push({ say: `Now add the tens. ${tensA} plus ${tensB}${isRegroup ? ` plus the carry of one` : ''} is ${tensSum}.`, board: { tool: 'drawEquation', args: { equation: `${tensA * 10} + ${tensB * 10}${isRegroup ? ' + 10' : ''} = ${tensSum * 10}` } } });
    steps.push({ say: `Put it together. ${a} plus ${b} equals ${sum}.`, board: { tool: 'drawEquation', args: { equation: `${a} + ${b} = ${sum}` } } });

    return {
      intro: `Let's solve ${a} plus ${b} step by step.`,
      steps,
      outro: isRegroup
        ? `When the ones add to ten or more, carry a one. That's regrouping.`
        : `Add the ones, then add the tens. That's it.`,
    };
  }

  function buildProblem(a, b, isRegroup) {
    const sum = a + b;
    const { options, correct_index } = buildOptions(a, b);
    return {
      topic: isRegroup ? 'Double-digit addition (with regrouping)' : 'Double-digit addition',
      question: `What is ${a} + ${b}?`,
      options,
      correct_index,
      explanation: `${a} plus ${b} equals ${sum}.`,
      hint: isRegroup
        ? `The ones add to more than ten — you'll need to carry one.`
        : `Add the ones first, then add the tens.`,
      remediation: buildRemediation(a, b, isRegroup),
    };
  }

  const PROBLEMS = []
    .concat(NO_REGROUP.map(([a, b]) => buildProblem(a, b, false)))
    .concat(REGROUP.map(([a, b]) => buildProblem(a, b, true)));

  // ---- Deterministic daily rotation -------------------------------------
  // Same date → same problems, same order. Different date → window slides.
  function dateSeed(dateStr) {
    if (!dateStr) return 0;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!m) return 0;
    const y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
    return (y * 372 + mo * 31 + d) % PROBLEMS.length;
  }

  function pickForDate(dateStr, n) {
    const start = dateSeed(dateStr);
    const count = Math.max(1, Math.min(PROBLEMS.length, n || 4));
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push(PROBLEMS[(start + i) % PROBLEMS.length]);
    }
    return out;
  }

  NS.MathBank = {
    all: PROBLEMS,
    pickForDate,
    size: PROBLEMS.length,
  };

  // Tiny boot log so we can verify load via console
  try { console.log('[math-bank] loaded ' + PROBLEMS.length + ' coded problems'); } catch (_) {}
})();
