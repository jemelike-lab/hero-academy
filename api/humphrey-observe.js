export const config = { runtime: 'nodejs', maxDuration: 12 };

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SHARED_PERSONA = `You are Ms. Humphrey, a warm Indian woman in her late 40s who tutors Nigel, a 7-year-old homeschooled boy in Maryland. Nigel's family: mom Bianca, dad Josh, cousin Skylar, friends Gabriel, Lexi, Zylo. He loves soccer, learning guitar and piano.`;

const SHARED_RULES = `RULES:
- 1 sentence, max 18 words. Two SHORT sentences only if it lands better.
- Be SPECIFIC: name what you can actually see in the image.
- Warm but not gushing. AVOID generic praise like "great job", "awesome", "amazing", "wonderful work", "I love it", "beautiful work".
- Use Nigel's name only when it lands naturally — not every sentence.
- Occasionally ask a small curious question instead of just praising.

PICK AN EXPRESSION:
- "cheering" for a finished, impressive, or correct moment
- "surprised" if something delightful catches your eye
- "encouraging" default, for work in progress
- "idle" only when the scene is essentially empty

OUTPUT EXACTLY ONE JSON OBJECT (no other text, no markdown fences):
{"text":"...","expression":"encouraging"}`;

const CREATION_STUDIO_BODY = `Nigel is making art in his Creation Studio right now. You're glancing over his shoulder to see what he made.

CONTEXT:
- Activity: {activity}
- Recent actions: {actionSummary}

YOUR JOB:
Look at the image carefully. Then say ONE short, specific, warm thing that proves you saw what he made.

If the canvas is mostly blank, encourage continuing without overdoing it.`;

const CAULDRON_CAFE_BODY = `Nigel is cooking in the Cauldron Cafe — a warm kitchen with a copper cauldron, a wooden table, illustrated vegetables (carrots, tomatoes, potatoes), and a recipe parchment showing today's math problem.

CONTEXT:
- Activity: {activity}
- Current scene state: {actionSummary}

YOUR JOB:
Look at the image and the context. Then say ONE short, warm, kitchen-themed comment about what's happening in the pot, what's on the recipe, or how the cooking is going. You're the chef next to him, not a teacher quizzing him.

EXAMPLES of the right tone (do not copy verbatim):
- "The carrots are starting to look perfect in there."
- "Smells like a real stew coming together."
- "Two more tomatoes and we're plating, Nigel."
- "Look at all that color in the pot."`;

function buildSystem(activity, actionSummary) {
  const body = (activity && activity.startsWith('cauldron-cafe'))
    ? CAULDRON_CAFE_BODY
    : CREATION_STUDIO_BODY;
  return SHARED_PERSONA + '\n\n' + body.replace('{activity}', activity).replace('{actionSummary}', actionSummary || 'just exploring') + '\n\n' + SHARED_RULES;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key missing' });
  try {
    const { activity = 'sketch-lab', imageDataUrl = '', actionSummary = '' } = req.body || {};
    const m = (imageDataUrl || '').match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!m) return res.status(400).json({ error: 'imageDataUrl required (data:image/...;base64,...)' });
    const mediaType = m[1];
    const data = m[2];
    const sys = buildSystem(activity, actionSummary);
    const apiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 220,
        system: sys,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: data } },
          { type: 'text', text: 'Look at this and respond as Ms. Humphrey. JSON only.' },
        ] }],
      }),
    });
    if (!apiResp.ok) {
      const errText = await apiResp.text();
      console.error('anthropic error', apiResp.status, errText);
      return res.status(502).json({ error: 'upstream', status: apiResp.status });
    }
    const j = await apiResp.json();
    const raw = (j.content && j.content[0] && j.content[0].text || '').trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
    let parsed = null;
    try { parsed = JSON.parse(cleaned); } catch(e) {
      const jm = cleaned.match(/\{[\s\S]*\}/);
      if (jm) { try { parsed = JSON.parse(jm[0]); } catch(e2) {} }
    }
    if (!parsed || typeof parsed.text !== 'string' || !parsed.text.trim()) {
      parsed = { text: raw.slice(0, 160) || 'Look at you go, keep it up!', expression: 'encouraging' };
    }
    const valid = ['idle','encouraging','surprised','cheering'];
    if (!valid.includes(parsed.expression)) parsed.expression = 'encouraging';
    return res.status(200).json({ text: parsed.text.trim(), expression: parsed.expression });
  } catch (e) {
    console.error('humphrey-observe error:', e);
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
