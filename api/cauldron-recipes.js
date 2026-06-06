// /api/cauldron-recipes
//
// Generates 5 fresh cooking-math recipes for Nigel on demand. Called every
// time he opens the Cauldron Café — so he never sees the same set twice.
//
// Uses Claude Haiku 4.5 with Nigel's profile + a 2nd-grade-stretch difficulty
// envelope. Limited to the 3 vegetables the Cauldron scene actually renders
// (carrot, tomato, potato) so the math problems match the visible UI.

import fs from 'node:fs';
import path from 'node:path';

const MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_VERSION = '2023-06-01';

function loadProfile() {
  try {
    const p = path.join(process.cwd(), 'data', 'nigel-profile.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

function buildSystemPrompt(profile, avoidTitles) {
  const avoidLine = (avoidTitles && avoidTitles.length)
    ? `Recently used recipe names (avoid repeating, vary the titles): ${avoidTitles.slice(0, 12).join(', ')}.`
    : 'No prior recipes to avoid.';
  return `You generate cooking math recipes for Nigel, a 7-year-old in 2nd grade homeschooled in Maryland. Output goes into his Cauldron Cafe — a warm kitchen scene where he taps illustrated vegetables to add them into a copper cauldron.

NIGEL'S PROFILE
${JSON.stringify(profile, null, 2)}

THE SCENE
Only THREE vegetables are rendered in the Cauldron Cafe right now: carrot, tomato, potato. Every recipe MUST use ingredients from this list only. Each ingredient appears at most once per recipe (e.g. don't say "5 carrots and 3 more carrots", combine them).

DIFFICULTY ENVELOPE — push above pure 2nd grade, never below:
- Numbers per ingredient: 5 to 18 (avoid sums under 10 — that's too easy).
- Final answer range: 12 to 30 for additions, 3 to 20 for subtractions / missing addends.
- Mix skills across the 5 recipes — DO NOT make all 5 the same shape:
  · 2 should be straight addition of 2-3 ingredients (e.g. 8 + 7 + 5 = 20)
  · 1 should be subtraction framed as removing burnt/spare ingredients (e.g. "Chef put 14 tomatoes in, then took 6 out for the side. How many are left?")
  · 1 should be a MISSING ADDEND ("Chef needs 18 ingredients total. He's added 7 carrots. How many more does he need?")
  · 1 should be MULTI-STEP — ADDITIVE ONLY, never with subtraction in the middle. The Cauldron UI is add-only: Nigel taps a veggie card to add it, and there's no way to remove. So multi-step problems MUST chain additions, e.g. "First batch: 5 carrots. Second batch: 4 more carrots. Then 6 tomatoes." Equation: "5 + 4 + 6 = ?". NEVER write multi-step problems with "take out", "remove", "took out", or any subtraction mid-equation.
- Variety in the recipe name — vary the dish style (stew, soup, sauce, curry, jollof, stir-fry, gumbo, mash, hash). Feel free to incorporate Nigerian/heritage dishes (jollof rice, egusi, fufu, plantain — but those become decorative descriptors, the math only uses carrot/tomato/potato).

WRITING STYLE
- Warm chef voice, never lecture-y.
- Tell a tiny story in each prompt — what is being cooked, who it's for, what's happening.
- Use Nigel's name, family (Bianca, Josh, Skylar, Gabriel, Lexi, Zylo) sparingly across the set — at most 2 of 5 recipes mention a specific person.

CONSTRAINTS
${avoidLine}
- All numbers in 'ingredients[].count' must appear literally in the equation string.
- All numbers in the equation must be derivable from the ingredients.
- 'answer' must be a number, not a string.

OUTPUT — ONE JSON OBJECT, NO MARKDOWN, NO PREAMBLE:
{
  "recipes": [
    {
      "name": "string, 2-5 words",
      "ingredients": [
        { "veggie": "carrot" | "tomato" | "potato", "count": number }
      ],
      "prompt": "string, 1-2 sentences, the story of this recipe",
      "equation": "string showing the math, ending in '= ?'",
      "answer": number,
      "skill": "addition" | "subtraction" | "missing_addend" | "multi_step"
    }
    // exactly 5 of these, in the skill mix described above
  ]
}`;
}

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
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        { role: 'user', content: 'Generate 5 fresh recipes following the rules. Return only the JSON object.' },
      ],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Anthropic ${r.status}: ${t}`);
  }
  const data = await r.json();
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(cleaned);
}

function validateRecipe(r) {
  if (!r || typeof r !== 'object') return false;
  if (typeof r.name !== 'string' || !r.name.length) return false;
  if (!Array.isArray(r.ingredients) || !r.ingredients.length) return false;
  for (const ing of r.ingredients) {
    if (!['carrot', 'tomato', 'potato'].includes(ing.veggie)) return false;
    if (typeof ing.count !== 'number' || ing.count < 1 || ing.count > 30) return false;
  }
  if (typeof r.prompt !== 'string' || r.prompt.length < 5) return false;
  if (typeof r.equation !== 'string' || !r.equation.includes('?')) return false;
  if (typeof r.answer !== 'number') return false;
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const body = req.body || {};
    const avoidTitles = Array.isArray(body.avoidTitles) ? body.avoidTitles : [];
    const profile = loadProfile();
    if (!profile) return res.status(500).json({ error: 'profile_missing' });

    const sys = buildSystemPrompt(profile, avoidTitles);
    const t0 = Date.now();
    const parsed = await callHaiku(sys);
    const elapsed = Date.now() - t0;

    if (!parsed || !Array.isArray(parsed.recipes)) {
      return res.status(502).json({ error: 'model_no_recipes', preview: JSON.stringify(parsed).slice(0, 300) });
    }
    const valid = parsed.recipes.filter(validateRecipe);
    if (valid.length < 3) {
      return res.status(502).json({ error: 'too_few_valid_recipes', got: valid.length });
    }

    return res.status(200).json({
      ok: true,
      elapsed_ms: elapsed,
      count: valid.length,
      recipes: valid,
    });
  } catch (err) {
    return res.status(500).json({ error: 'generation_failed', detail: String(err.message || err) });
  }
}
