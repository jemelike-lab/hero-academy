// /api/_lib/expedition-generator.js
//
// Shared expedition synthesizer. Takes recentThemes (14d no-repeat) and
// recentTopics (60d avoid-list), picks a theme via weighted random,
// calls Haiku 4.5, validates the schema, and returns:
//
//   { theme, topic, payload }
//
// Two entry points use this:
//   - api/cron/generate-expedition.js   (runs nightly)
//   - api/expedition-today.js           (inline fallback if cron missed)

import fs from 'node:fs';
import path from 'node:path';

const MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_VERSION = '2023-06-01';

// ---------------------------------------------------------------------
// THEME REGISTRY
// ---------------------------------------------------------------------
// Each theme has a weight (higher = picked more often), a description
// for the prompt, and a topic seed bank. Topic seeds bias the model
// toward kid-resonant content while leaving room for invention.
// ---------------------------------------------------------------------
const THEMES = {
  maryland_history: {
    weight: 3,
    description: 'A person, place, or moment from Maryland\'s past.',
    topic_seeds: [
      'The Chesapeake Bay watermen',
      'How Baltimore got its name',
      'The B&O Railroad',
      'Harriet Tubman in Maryland',
      'Fort McHenry and the Star-Spangled Banner',
      'The Calvert family and the first settlers',
      'The C&O Canal',
      'Frederick Douglass\'s years on the Eastern Shore',
      'Annapolis as the U.S. capital (1783-1784)',
      'Maryland\'s state symbols and their stories',
    ],
  },
  us_history: {
    weight: 2,
    description: 'A person, place, or moment from United States history.',
    topic_seeds: [
      'The Pony Express',
      'Lewis and Clark',
      'The first flight at Kitty Hawk',
      'How the Liberty Bell got its crack',
      'Sacagawea',
      'The Erie Canal',
      'The transcontinental railroad',
      'Ruby Bridges',
      'Apollo 11 and the moon landing',
      'The first Thanksgiving (real history)',
    ],
  },
  us_geography: {
    weight: 2,
    description: 'A place or feature in the United States.',
    topic_seeds: [
      'The Grand Canyon',
      'Old Faithful in Yellowstone',
      'The Mississippi River',
      'Hawaiian volcanoes',
      'The Great Lakes',
      'Alaska\'s glaciers',
      'The Everglades',
      'Niagara Falls',
      'The Appalachian Trail',
      'Mount Rushmore',
    ],
  },
  world_geography: {
    weight: 2,
    description: 'A place or feature anywhere in the world.',
    topic_seeds: [
      'The Sahara Desert',
      'The Amazon rainforest',
      'Lagos, Nigeria',
      'Mount Kilimanjaro',
      'The Great Wall of China',
      'The Nile River',
      'Iceland\'s geysers',
      'The Galápagos Islands',
      'Antarctica',
      'The Himalayan mountains',
    ],
  },
  civics: {
    weight: 2,
    description: 'How communities, schools, towns, states, or the country work — laws, voting, jobs, rules.',
    topic_seeds: [
      'What does a mayor do?',
      'Why we have laws',
      'How voting works',
      'What a governor does',
      'Why we pay taxes',
      'How a town gets clean water',
      'What jurors do',
      'How the post office works',
      'Three branches of government (kid-sized)',
      'Why we have school crossing guards',
    ],
  },
  historical_figures: {
    weight: 3,
    description: 'A real person from history worth meeting.',
    topic_seeds: [
      'Benjamin Banneker',
      'Harriet Tubman',
      'George Washington Carver',
      'Mae Jemison',
      'Katherine Johnson',
      'Bessie Coleman',
      'Wangari Maathai',
      'Ruby Bridges',
      'Garrett Morgan',
      'Charles Drew',
    ],
  },
  culture_holidays: {
    weight: 1,
    description: 'A celebration, tradition, or cultural practice from anywhere in the world.',
    topic_seeds: [
      'Juneteenth',
      'How Thanksgiving started (real story)',
      'Lunar New Year',
      'Why we celebrate the 4th of July',
      'Day of the Dead',
      'Eid al-Fitr',
      'Diwali',
      'Why we have Labor Day',
      'Black History Month',
      'Independence Day in Nigeria',
    ],
  },
  science_of_place: {
    weight: 1,
    description: 'Why a place is the way it is — geology, weather, ecosystems, water.',
    topic_seeds: [
      'Why the Chesapeake Bay is salty in some spots and fresh in others',
      'How mountains get made',
      'Why hurricanes hit the East Coast',
      'How rivers carve canyons',
      'Why deserts are dry',
      'How islands are born',
      'Why the sky is blue',
      'How caves form underground',
      'Why some lakes never freeze',
      'How the tide works',
    ],
  },
};

const ALL_THEMES = Object.keys(THEMES);

// ---------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------

function loadProfile() {
  try {
    const p = path.join(process.cwd(), 'data', 'nigel-profile.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

// Weighted random theme selection, excluding any theme used in the
// last 14 days. If everything's been used recently, fall back to
// weighted-random across all themes.
export function pickTheme(recentThemes) {
  const recent = new Set((recentThemes || []).filter(Boolean));
  let candidates = ALL_THEMES.filter(t => !recent.has(t));
  if (candidates.length === 0) candidates = ALL_THEMES.slice();

  const weights = candidates.map(t => THEMES[t].weight);
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

function pickTopicSeed(theme, recentTopics) {
  const recent = new Set((recentTopics || []).map(t => String(t).toLowerCase()));
  const seeds = THEMES[theme].topic_seeds.filter(s => !recent.has(s.toLowerCase()));
  const pool = seeds.length ? seeds : THEMES[theme].topic_seeds;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------------------------------------------------------------------
// PROMPT
// ---------------------------------------------------------------------

function buildSystemPrompt(profile, theme, topicSeed, recentTopics) {
  const avoid = (recentTopics || []).slice(0, 20);
  const avoidLine = avoid.length
    ? `Recently used topics (do NOT repeat any of these): ${avoid.join(', ')}.`
    : 'No recent topics to avoid.';

  return `You generate one daily "expedition" for Nigel, a 7-year-old 2nd-grade homeschool student in Upper Marlboro, Maryland. Output goes into his Explorer's Hall — a museum-style social studies zone where Ms. Humphrey (a warm, professional AI tutor) walks him through the content.

NIGEL'S PROFILE
${JSON.stringify(profile, null, 2)}

TODAY'S THEME: ${theme}
THEME MEANING: ${THEMES[theme].description}
SUGGESTED TOPIC (you may use this exact topic or pick a related one in the same theme — but make a real choice, don't just copy if a better fit exists): ${topicSeed}

${avoidLine}

EXPEDITION SHAPE — output exactly this JSON, no markdown, no preamble:
{
  "topic": "string · the subject of today's expedition (e.g. 'Harriet Tubman', 'The Chesapeake Bay')",
  "hook": {
    "text": "string · 1-2 sentences · Humphrey's opening line. Frame the WHY before the WHAT. Pose a mystery, a surprising fact, or a question. Spoken aloud to a 7-year-old.",
    "humphrey_event": "expedition_hook"
  },
  "discovery": {
    "title": "string · 2-5 words · the topic name",
    "subtitle": "string · 3-7 words · a tagline that frames it",
    "illustration_kind": "portrait_silhouette | landscape | landmark | symbol | map",
    "intro": "string · 2-4 sentences · the core context. Concrete, vivid, 2nd-grade reading level but never babyish.",
    "humphrey_event": "expedition_discovery"
  },
  "wonders": [
    // EXACTLY 3 of these
    {
      "id": "snake_case_short_id",
      "title": "string · the wonder framed as a question Nigel might ask (5-9 words)",
      "icon": "single emoji that matches",
      "fact": "string · 2-3 sentences · the answer + one surprising or vivid detail that makes it stick. Never just a definition.",
      "question": {
        "prompt": "string · the quick-check question (one sentence, 8-14 words)",
        "options": [
          { "id": "a", "text": "string · 2-7 words", "correct": true },
          { "id": "b", "text": "string · 2-7 words · plausibly wrong but not silly", "correct": false },
          { "id": "c", "text": "string · 2-7 words · playfully wrong is fine (a Nigel-relevant joke is gold)", "correct": false }
        ],
        "feedback_correct": "string · 1-2 sentences · celebrate + extend with a tiny new fact",
        "feedback_incorrect": "string · 1-2 sentences · warm, non-judgmental, restate the right answer in friendly terms"
      }
    }
  ],
  "connection": {
    "text": "string · 2-3 sentences · ties today's topic to Nigel personally. Use his profile — his Maryland home, his Nigerian heritage, his soccer/guitar/piano, his family (Bianca, Josh, Skylar, Gabriel, Lexi, Zylo). Address him by name. Make it warm but not corny. NEVER reference 'do_not_bring_up_unprompted' items.",
    "humphrey_event": "expedition_connection"
  },
  "reflection": {
    "prompt": "string · open recall prompt · e.g. 'Tell Humphrey one thing you want to remember about [topic].'",
    "fallback_question": {
      "prompt": "string · simple recall MC question for kids who skip voice",
      "options": [
        { "id": "a", "text": "string", "correct": true },
        { "id": "b", "text": "string", "correct": false },
        { "id": "c", "text": "string", "correct": false }
      ]
    },
    "humphrey_event": "expedition_reflection"
  },
  "completion": {
    "stamp_label": "string · 1-2 words · UPPERCASE · what goes on the passport stamp (e.g. 'BANNEKER', 'CHESAPEAKE')",
    "stamp_subtitle": "string · place + year if relevant (e.g. 'Maryland · 1731'), or just place",
    "celebration_line": "string · 1 sentence · Humphrey's closing line as the stamp lands"
  },
  "location": {
    "name": "string · human readable place name OR null if not place-based",
    "lat": number or null,
    "lng": number or null,
    "show_map": boolean,
    "map_region": "maryland | us_east | us | world | null"
  }
}

VOICE & TONE
- Humphrey speaks all narration. She is warm, professional, a touch literary. She is NOT bouncy or cartoonish.
- Speak TO Nigel, not about him. Use "you" not "he."
- Never talk down. He is 7 but he is sharp. Treat him like a curious mind.
- It is OK and good to acknowledge hard history honestly at a kid-appropriate level (slavery existed; some places have sad chapters). Don't sanitize, but don't dwell on violence or trauma.

CONTENT RULES
- Be FACTUALLY ACCURATE. No invented dates, names, or events. If you're not sure of a specific fact, choose a different specific fact you are sure of.
- The "topic" must NOT be in the recent-topics avoid list.
- The connection paragraph must mention Nigel's name and at least one specific detail from his profile.
- Wrong-answer options must be plausibly wrong — never insulting his intelligence with options like "purple cheese." Playful wrong options that reference his interests (Spider-Man, soccer, jollof rice) are encouraged for ONE of the three options at most.
- Stamp_label must be short and pronounceable.
- If the topic is a person, set illustration_kind to "portrait_silhouette". If it's a place or landmark, use "landscape" or "landmark." If it's an idea or symbol, use "symbol."

OUTPUT
Return ONE JSON object matching the shape above. No markdown fences. No commentary.`;
}

// ---------------------------------------------------------------------
// MODEL CALL
// ---------------------------------------------------------------------

async function callHaiku(systemPrompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3072,
      system: systemPrompt,
      messages: [
        { role: 'user', content: 'Generate today\'s expedition. Return only the JSON object.' },
      ],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`anthropic ${r.status}: ${t.slice(0, 300)}`);
  }
  const data = await r.json();
  const text = (data.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(cleaned);
}

// ---------------------------------------------------------------------
// VALIDATION
// ---------------------------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateExpedition(exp) {
  const errs = [];
  if (!exp || typeof exp !== 'object') {
    return ['root is not an object'];
  }
  if (!isNonEmptyString(exp.topic)) errs.push('topic missing');
  if (!exp.hook || !isNonEmptyString(exp.hook.text)) errs.push('hook.text missing');
  if (!exp.discovery || !isNonEmptyString(exp.discovery.title) || !isNonEmptyString(exp.discovery.intro)) {
    errs.push('discovery title/intro missing');
  }
  if (!Array.isArray(exp.wonders) || exp.wonders.length !== 3) {
    errs.push(`wonders must have length 3 (got ${exp.wonders ? exp.wonders.length : 'none'})`);
  } else {
    exp.wonders.forEach((w, i) => {
      if (!isNonEmptyString(w.title)) errs.push(`wonder[${i}].title missing`);
      if (!isNonEmptyString(w.fact)) errs.push(`wonder[${i}].fact missing`);
      if (!w.question || !isNonEmptyString(w.question.prompt)) errs.push(`wonder[${i}].question.prompt missing`);
      if (!Array.isArray(w.question?.options) || w.question.options.length !== 3) {
        errs.push(`wonder[${i}].question.options must have length 3`);
      } else {
        const correct = w.question.options.filter(o => o && o.correct === true).length;
        if (correct !== 1) errs.push(`wonder[${i}] must have exactly one correct option (found ${correct})`);
      }
    });
  }
  if (!exp.connection || !isNonEmptyString(exp.connection.text)) errs.push('connection.text missing');
  if (!exp.reflection || !isNonEmptyString(exp.reflection.prompt)) errs.push('reflection.prompt missing');
  if (!exp.completion || !isNonEmptyString(exp.completion.stamp_label)) errs.push('completion.stamp_label missing');
  return errs;
}

function normalizePayload(exp, theme) {
  // Add fields the model doesn't need to know about.
  exp.schema_version = 1;
  exp.theme = theme;
  exp.hook.humphrey_event = 'expedition_hook';
  exp.discovery.humphrey_event = 'expedition_discovery';
  exp.connection.humphrey_event = 'expedition_connection';
  exp.reflection.humphrey_event = 'expedition_reflection';
  if (!exp.location) {
    exp.location = { name: null, lat: null, lng: null, show_map: false, map_region: null };
  }
  return exp;
}

// ---------------------------------------------------------------------
// PUBLIC ENTRY
// ---------------------------------------------------------------------

export async function generateExpedition({ recentThemes, recentTopics, forceTheme } = {}) {
  const profile = loadProfile();
  if (!profile) throw new Error('profile_missing');

  const theme = forceTheme || pickTheme(recentThemes);
  const topicSeed = pickTopicSeed(theme, recentTopics);
  const sys = buildSystemPrompt(profile, theme, topicSeed, recentTopics);

  // Up to two attempts (the model occasionally trips a validation rule).
  let lastErrs = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    let parsed;
    try {
      parsed = await callHaiku(sys);
    } catch (e) {
      lastErrs = [String(e)];
      continue;
    }
    const errs = validateExpedition(parsed);
    if (errs.length === 0) {
      const payload = normalizePayload(parsed, theme);
      return { theme, topic: payload.topic, payload };
    }
    lastErrs = errs;
  }
  throw new Error(`validation_failed: ${lastErrs.join('; ')}`);
}

export { THEMES };
