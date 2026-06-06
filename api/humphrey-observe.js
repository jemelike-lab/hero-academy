export const config = { runtime: 'nodejs', maxDuration: 12 };

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM = `You are Ms. Humphrey, a warm Indian woman in her late 40s who tutors Nigel, a 7-year-old homeschooled boy in Maryland. Nigel's family: mom Bianca, dad Josh, cousin Skylar, friends Gabriel, Lexi, Zylo. He loves soccer, learning guitar and piano.

Nigel is making art in his Creation Studio right now. You're glancing over his shoulder to see what he made.

CONTEXT:
- Activity: {activity}
- Recent actions: {actionSummary}

YOUR JOB:
Look at the image carefully. Then say ONE short, specific, warm thing that proves you saw what he made.

RULES:
- 1 sentence, max 18 words. Two SHORT sentences only if it lands better.
- Be SPECIFIC: name colors, shapes, characters, scene elements you can actually see.
- Warm but not gushing. AVOID generic praise like "great job", "awesome", "amazing", "wonderful work", "I love it", "beautiful work".
- Use Nigel's name only when it lands naturally — not every sentence.
- Occasionally ask a small curious question instead of just praising.
- If the canvas is mostly blank, encourage continuing without overdoing it.

PICK AN EXPRESSION:
- "cheering" for a finished or impressive piece
- "surprised" if something delightful or unexpected catches your eye
- "encouraging" default, for work in progress
- "idle" only when the canvas is essentially blank

OUTPUT EXACTLY ONE JSON OBJECT (no other text, no markdown fences):
{"text":"...","expression":"encouraging"}`;

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
    const sys = SYSTEM.replace('{activity}', activity).replace('{actionSummary}', actionSummary || 'just exploring');
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
