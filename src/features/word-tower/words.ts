// Ported verbatim from public/js/word-lists.js (the live v174c Word Tower).
// Each level is a phonics pattern. Add levels by extending LEVELS.
export interface WordItem { word: string; pattern: string; hint: string }
export interface Level { id: string; name: string; description: string; mccrs: string; ccss: string; words: WordItem[] }

const LEVELS: Record<string, Level> = {
  // Consonant digraphs: sh, ch, th, wh at the start and end of words.
  digraphs: {
    id: 'digraphs',
    name: 'Consonant Digraphs',
    description: 'sh, ch, th, wh sounds',
    mccrs: '2.RF.3.b',
    ccss: 'CCSS.ELA-LITERACY.RF.2.3.B',
    words: [
      { word: 'ship', pattern: 'sh-', hint: 'Listen for the sh sound at the start.' },
      { word: 'shop', pattern: 'sh-', hint: 'sh- at the beginning.' },
      { word: 'shut', pattern: 'sh-', hint: 'sh- at the beginning.' },
      { word: 'shed', pattern: 'sh-', hint: 'sh- at the beginning.' },
      { word: 'fish', pattern: '-sh', hint: 'sh at the end, like saying shhh.' },
      { word: 'dish', pattern: '-sh', hint: '-sh at the end.' },
      { word: 'wish', pattern: '-sh', hint: '-sh at the end.' },
      { word: 'wash', pattern: '-sh', hint: '-sh at the end.' },
      { word: 'cash', pattern: '-sh', hint: '-sh at the end.' },
      { word: 'rush', pattern: '-sh', hint: '-sh at the end.' },
      { word: 'chip', pattern: 'ch-', hint: 'ch- at the beginning, like cheese.' },
      { word: 'chop', pattern: 'ch-', hint: 'ch- at the beginning.' },
      { word: 'chin', pattern: 'ch-', hint: 'ch- at the beginning.' },
      { word: 'chat', pattern: 'ch-', hint: 'ch- at the beginning.' },
      { word: 'much', pattern: '-ch', hint: '-ch at the end.' },
      { word: 'rich', pattern: '-ch', hint: '-ch at the end.' },
      { word: 'lunch', pattern: '-ch', hint: 'Listen for the -nch at the end.' },
      { word: 'bunch', pattern: '-ch', hint: '-nch at the end.' },
      { word: 'pinch', pattern: '-ch', hint: '-nch at the end.' },
      { word: 'beach', pattern: '-ch', hint: '-ch at the end.' },
      { word: 'that', pattern: 'th-', hint: 'th- at the beginning.' },
      { word: 'them', pattern: 'th-', hint: 'th- at the beginning.' },
      { word: 'this', pattern: 'th-', hint: 'th- at the beginning.' },
      { word: 'then', pattern: 'th-', hint: 'th- at the beginning.' },
      { word: 'with', pattern: '-th', hint: '-th at the end.' },
      { word: 'math', pattern: '-th', hint: '-th at the end.' },
      { word: 'bath', pattern: '-th', hint: '-th at the end.' },
      { word: 'path', pattern: '-th', hint: '-th at the end.' },
      { word: 'moth', pattern: '-th', hint: '-th at the end.' },
      { word: 'both', pattern: '-th', hint: '-th at the end.' },
      { word: 'when', pattern: 'wh-', hint: 'wh- at the beginning.' },
      { word: 'what', pattern: 'wh-', hint: 'wh- at the beginning.' },
      { word: 'whale', pattern: 'wh-', hint: 'wh- at the beginning.' },
    ],
  },
};

export function getLevels() { return Object.values(LEVELS).map(({ words, ...l }) => ({ ...l, wordCount: words.length })); }
export function getLevel(id: string): Level | null { const L = LEVELS[id]; return L ? JSON.parse(JSON.stringify(L)) : null; }
export function getDefaultLevelId() { return 'digraphs'; }
