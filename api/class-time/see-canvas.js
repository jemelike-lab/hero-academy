// api/class-time/see-canvas.js
// POST { image: dataUrl, context: {...} }
// Returns short description of what Nigel drew/wrote so Humphrey can react in real-time.
import Anthropic from '@anthropic-ai/sdk';

const MAX_DESC_CHARS = 240;

function getAnthropic(){
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function dataUrlParts(dataUrl){
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  return { media_type: m[1] === 'image/jpg' ? 'image/jpeg' : m[1], data: m[2] };
}

function buildPrompt(ctx){
  const topic = ctx?.lesson_topic || '';
  const focus = ctx?.lesson_focus || '';
  return `You are looking at the canvas of a 7-year-old boy named Nigel during a live class with his teacher Ms. Humphrey.

Current lesson topic: "${topic}"
Current focus: "${focus}"

Look at what Nigel has drawn or written. Describe it in ONE short sentence (under 30 words) that Ms. Humphrey can use to react naturally. Be specific about what you actually see — numbers, letters, shapes, scribbles.

Examples of good descriptions:
- "Nigel wrote the number 7 in big shaky letters"
- "Nigel drew 5 circles in a row, plus 2 more circles below"
- "Nigel wrote 'CAT' in capital letters"
- "Nigel drew what looks like a sun with rays"
- "The canvas just has scribbles and squiggly lines, no clear answer yet"
- "Nigel wrote '7+3=10' as the equation"

Do NOT:
- Praise or criticize
- Make assumptions about correctness
- Add encouragement
- Use more than one sentence

Just describe what you see. Reply with the description only, no quotes, no preamble.`;
}

export default async function handler(req, res){
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS'){ res.status(204).end(); return; }
  if (req.method !== 'POST'){ return res.status(405).json({ error: 'method_not_allowed' }); }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch(e){
    return res.status(400).json({ error: 'invalid_json' });
  }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'bad_body' });

  const parts = dataUrlParts(body.image);
  if (!parts) return res.status(400).json({ error: 'bad_image' });

  // Size cap (~1.5MB base64 → ~1.1MB binary)
  if (parts.data.length > 1_600_000){
    return res.status(413).json({ error: 'image_too_large' });
  }

  try {
    const anthropic = getAnthropic();
    const r = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 90,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: parts.media_type, data: parts.data } },
            { type: 'text', text: buildPrompt(body.context || {}) }
          ]
        }
      ]
    });
    let desc = (r.content[0] && r.content[0].text) ? r.content[0].text : '';
    desc = desc.trim().replace(/^["']|["']$/g, '').slice(0, MAX_DESC_CHARS);
    if (!desc) return res.status(200).json({ ok: true, description: '' });
    return res.status(200).json({ ok: true, description: desc });
  } catch (e){
    console.error('[see-canvas] vision error', e);
    return res.status(200).json({ ok: true, description: '', error: String(e.message || e) });
  }
}

// Bigger body limit for image uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb'
    }
  }
};
