// Lightweight smoke test of v167 sanitizer behavior — runs without browser.
// Loads class-time-board.js into a minimal jsdom-free shim and asserts the
// sanitize() / sanitizeEquation() / looksLikeQuestion() guards behave.

const fs = require('fs');
const path = require('path');

// Minimal browser shim
global.window = {};
global.document = {
  getElementById: () => null,
  createElement: () => ({ getContext: () => ({ setTransform(){}, clearRect(){}, drawImage(){}, fillRect(){}, save(){}, restore(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, fillText(){}, getImageData: () => ({ data: new Uint8Array(0) }) }), width:0, height:0, toDataURL: () => '' }),
  addEventListener: () => {},
};
global.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
global.performance = { now: () => Date.now() };
global.Image = function(){ this.crossOrigin = ''; };

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'class-time-board.js'), 'utf8');
// Wrap and eval — class-time-board.js is a self-invoking IIFE attached to window.HeroAcademy
eval(src);

const S = global.window.HeroAcademy.ClassTimeBoard;
const tests = [];
function t(name, fn){ tests.push({ name, fn }); }
function eq(actual, expected, label){
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label || ''}\n  got:      ${a}\n  expected: ${e}`);
}

// --- looksLikeQuestion ---
t('looksLikeQuestion: question mark', () => eq(S.looksLikeQuestion('hi?'), true));
t('looksLikeQuestion: what starts question', () => eq(S.looksLikeQuestion('What is 7+3'), true));
t('looksLikeQuestion: how many', () => eq(S.looksLikeQuestion('How many dots'), true));
t('looksLikeQuestion: clean noun', () => eq(S.looksLikeQuestion('cat'), false));
t('looksLikeQuestion: empty', () => eq(S.looksLikeQuestion(''), false));

// --- sanitize for writeWord ---
t('writeWord rejects question', () => {
  const r = S.sanitize('What is 7+3?', 'word');
  eq(r.ok, false);
  eq(r.reason, 'question_text');
});
t('writeWord rejects sentence', () => {
  const r = S.sanitize('this is a very long sentence indeed', 'word');
  eq(r.ok, false);
});
t('writeWord accepts noun', () => {
  const r = S.sanitize('cat', 'word');
  eq(r.ok, true);
  eq(r.value, 'cat');
});
t('writeWord accepts sight word', () => {
  const r = S.sanitize('the', 'word');
  eq(r.ok, true);
});

// --- sanitizeEquation ---
t('drawEquation rejects question', () => {
  const r = S.sanitizeEquation('What is 7 plus 3');
  eq(r.ok, false);
});
t('drawEquation rejects narrative', () => {
  const r = S.sanitizeEquation('seven plus three equals ten');
  eq(r.ok, false);
  // Either reason rejects equally well — both block the render
  if (r.reason !== 'not_an_equation' && r.reason !== 'too_long') {
    throw new Error('expected not_an_equation or too_long, got ' + r.reason);
  }
});
t('drawEquation rejects narrative (short form)', () => {
  const r = S.sanitizeEquation('seven plus three');
  eq(r.ok, false);
  eq(r.reason, 'not_an_equation');
});
t('drawEquation accepts 7+3=10', () => {
  const r = S.sanitizeEquation('7+3=10');
  eq(r.ok, true);
  eq(r.value, '7+3=10');
});
t('drawEquation accepts 5 - 2', () => {
  const r = S.sanitizeEquation('5 - 2');
  eq(r.ok, true);
});
t('drawEquation accepts fill-in-blank 7+3=?', () => {
  const r = S.sanitizeEquation('7 + 3 = ?');
  eq(r.ok, true);
});
t('drawEquation still rejects "How much is 5+5?"', () => {
  const r = S.sanitizeEquation('How much is 5+5?');
  eq(r.ok, false);
  eq(r.reason, 'question_text');
});

// --- public API integration: writeWord call returns structured result ---
t('writeWord public: rejects question text and returns ok:false', () => {
  const r = S.writeWord({ word: 'What is 7+3?' });
  eq(r && r.ok, false);
});
t('writeWord public: accepts short word', () => {
  const r = S.writeWord({ word: 'and' });
  eq(r && r.ok, true);
});
t('drawEquation public: rejects question', () => {
  const r = S.drawEquation({ equation: 'How much is 5+5' });
  eq(r && r.ok, false);
});
t('drawEquation public: accepts equation', () => {
  const r = S.drawEquation({ equation: '5+5=10' });
  eq(r && r.ok, true);
});

// Run
let pass = 0, fail = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log('  ✓', name); pass++; }
  catch(e){ console.log('  ✗', name, '\n    ', e.message); fail++; }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
