/**
 * Hero Academy — /api/humphrey/see-photo
 *
 * Build #7 v2 (camera capture). Nigel takes a photo to share with Ms.
 * Humphrey as part of a real-world quest. The endpoint sends the image
 * to Claude Haiku vision and returns Ms. Humphrey's warm, specific
 * reaction.
 *
 * Privacy-first design:
 *   - Photo is NEVER persisted server-side
 *   - Only the reaction text is sent back to the client
 *   - Claude sees the image once for the response, then it is discarded
 *   - The client (quests.js) records only the reaction string in
 *     ha_real_world_quests.answer (via ha_complete_quest RPC)
 *
 * Request:
 *   POST { image: "data:image/jpeg;base64,..." or raw base64,
 *          media_type: "image/jpeg" (optional),
 *          quest_text: "Show me your favorite stuffed animal." }
 *
 * Response:
 *   200 { reaction: "Oh my goodness, Nigel..." }
 *   400 { error: "no_image" }
 *   500 { error: "..." }
 *   502 { error: "haiku_failed", detail: "..." }
 */

const HAIKU_MODEL = 'claude-haiku-4-5';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // ~5MB before base64 expansion
const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  if (!body || typeof body !== 'object') body = {};

  const rawImage = body.image;
  const questText = String(body.quest_text || '').slice(0, 240);
  if (!rawImage || typeof rawImage !== 'string') {
    return res.status(400).json({ error: 'no_image' });
  }

  // Strip the data URL prefix if present
  let imageData = rawImage;
  let mediaType = String(body.media_type || 'image/jpeg').toLowerCase();
  const dataUrlMatch = imageData.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    mediaType = dataUrlMatch[1].toLowerCase();
    imageData = dataUrlMatch[2];
  }
  if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
    return res.status(400).json({ error: 'unsupported_media_type', detail: mediaType });
  }

  // Rough size check (base64 ~= 4/3 of raw bytes)
  const approxBytes = (imageData.length * 3) / 4;
  if (approxBytes > MAX_IMAGE_BYTES) {
    return res.status(413).json({ error: 'image_too_large', bytes: Math.round(approxBytes) });
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'no_api_key' });
  }

  // System prompt — strict child-safety guardrails baked in. Ms. Humphrey
  // never identifies people, never comments on appearance, never speculates
  // about location/identity. She reacts to OBJECTS — drawings, toys, found
  // items, things Nigel built or noticed in the world.
  const systemPrompt = [
    'You are Ms. Humphrey, a warm 2nd-grade homeschool tutor talking with your student Nigel (age 7, in Maryland). Nigel just took a photo from a real-world quest to share with you.',
    '',
    questText
      ? 'The quest was: "' + questText + '"'
      : 'He wanted to show you something from his day.',
    '',
    'React with WARMTH and SPECIFICITY:',
    '  - Notice 1-2 specific visual details: a color, shape, texture, or what the object is.',
    '  - Sound like a delighted teacher who genuinely sees what he is showing.',
    '  - Be age-appropriate for a 7-year-old; simple words, encouraging tone.',
    '  - Keep it to 2-3 short sentences (max ~50 words).',
    '  - End with something that invites him to keep going or feel proud.',
    '  - Speak directly to him ("you", "I see") — never in the third person.',
    '',
    'CRITICAL SAFETY RULES — these are absolute:',
    '  - NEVER identify, name, describe, or comment on people, faces, ages, genders, races, hair, or any human physical features in the image.',
    '  - If the photo includes a person, focus only on what they are HOLDING or SHOWING — never on them.',
    '  - NEVER speculate about location, address, school, or anything identifying.',
    '  - NEVER describe clothing in ways that identify someone.',
    '  - If the image is blurry, dark, or unclear, say: "I can tell you are showing me something special, but the picture is a little hard to see — can you tell me about it?"',
    '  - If you are not sure what an object is, ask Nigel to tell you instead of guessing wildly.',
    '  - If the image contains anything inappropriate, scary, or unsafe, respond ONLY with: "Let us pick a different thing to show me, sweet pea. How about something you made or found that makes you smile?"',
    '',
    'Output only your spoken reaction — no preamble, no JSON, no quotes. Just the words Nigel will hear.',
  ].join('\n');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 220,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: imageData },
              },
              {
                type: 'text',
                text: 'Here is the photo I took for you, Ms. Humphrey. What do you see?',
              },
            ],
          },
        ],
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      return res.status(502).json({
        error: 'haiku_failed',
        status: r.status,
        detail: errText.slice(0, 240),
      });
    }

    const json = await r.json();
    const reaction = (json.content || [])
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    if (!reaction) {
      // Defensive: model returned an empty text block. Give a graceful fallback.
      return res.status(200).json({
        reaction:
          'I can tell you are showing me something special, Nigel. Tell me a little about what I am looking at!',
        empty: true,
      });
    }

    return res.status(200).json({ reaction });
  } catch (e) {
    return res.status(500).json({ error: 'unexpected', detail: String(e).slice(0, 240) });
  }
}
