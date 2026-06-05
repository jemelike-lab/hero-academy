/**
 * Hero Academy — /api/humphrey/see-letter
 *
 * v99. Nigel writes a letter on the drawing canvas; this endpoint sends the
 * canvas snapshot to Claude Haiku vision and returns Ms. Humphrey's warm,
 * specific feedback plus a JSON quality signal so the client can show the
 * right Humphrey expression.
 *
 * Privacy-first: image is never persisted. Only the reaction text + score
 * leave the server.
 *
 * Request:
 *   POST {
 *     image:         "data:image/png;base64,...",
 *     media_type:    "image/png" (optional),
 *     target_letter: "B"
 *   }
 *
 * Response (200):
 *   { reaction: "Beautiful B, Nigel...", correct: true, score: 5 }
 *
 * Error:
 *   400 { error: "no_image" } / "no_letter" / "unsupported_media_type"
 *   413 { error: "image_too_large" }
 *   500 { error: "no_api_key" }
 *   502 { error: "haiku_failed", detail: "..." }
 */

const HAIKU_MODEL = 'claude-haiku-4-5';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
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
  // v102: target now can be a multi-digit number ("25", "100"), so we accept
  // 1-3 chars and validate the kind separately.
  const targetLetter = String(body.target_letter || '').trim().slice(0, 3);
  const targetKind = String(body.target_kind || 'upper').trim().toLowerCase();
  const ALLOWED_KINDS = new Set(['upper', 'lower', 'digit', 'multi-digit']);
  if (!rawImage || typeof rawImage !== 'string') {
    return res.status(400).json({ error: 'no_image' });
  }
  if (!targetLetter || !/^[A-Za-z0-9]{1,3}$/.test(targetLetter)) {
    return res.status(400).json({ error: 'no_letter' });
  }
  if (!ALLOWED_KINDS.has(targetKind)) {
    return res.status(400).json({ error: 'bad_kind', detail: targetKind });
  }

  let imageData = rawImage;
  let mediaType = String(body.media_type || 'image/png').toLowerCase();
  const dataUrlMatch = imageData.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    mediaType = dataUrlMatch[1].toLowerCase();
    imageData = dataUrlMatch[2];
  }
  if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
    return res.status(400).json({ error: 'unsupported_media_type', detail: mediaType });
  }
  const approxBytes = (imageData.length * 3) / 4;
  if (approxBytes > MAX_IMAGE_BYTES) {
    return res.status(413).json({ error: 'image_too_large', bytes: Math.round(approxBytes) });
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'no_api_key' });

  // v102: per-kind description so Haiku grades against the correct target.
  // We DO NOT uppercase lower-case targets — case matters for grading.
  let targetDescription;
  let targetNoun;
  if (targetKind === 'upper') {
    targetDescription = `the capital letter "${targetLetter.toUpperCase()}"`;
    targetNoun = 'letter';
  } else if (targetKind === 'lower') {
    targetDescription = `the lowercase letter "${targetLetter.toLowerCase()}". Lowercase letters often have descenders below the baseline (g, j, p, q, y) and ascenders above (b, d, f, h, k, l, t).`;
    targetNoun = 'letter';
  } else if (targetKind === 'digit') {
    targetDescription = `the number "${targetLetter}"`;
    targetNoun = 'number';
  } else if (targetKind === 'multi-digit') {
    targetDescription = `the number "${targetLetter}" (a multi-digit number — check that BOTH digits are present, in the correct left-to-right order, and that each digit is shaped correctly)`;
    targetNoun = 'number';
  } else {
    targetDescription = `the character "${targetLetter}"`;
    targetNoun = 'character';
  }

  // System prompt — warm, encouraging, specific. NEVER harsh. NEVER critical
  // of effort. This is practice, not a quiz. The 7-year-old is forming
  // identity around writing; harsh feedback now causes long-term avoidance.
  const systemPrompt = [
    'You are Ms. Humphrey, a warm 2nd-grade homeschool tutor working with Nigel (age 7, in Maryland). Nigel just hand-drew a ' + targetNoun + ' on a digital drawing board, with his finger, and is showing it to you.',
    '',
    'Nigel was asked to write ' + targetDescription + '.',
    '',
    'Your job: look at his drawing and give him warm, specific feedback. This is PRACTICE, not a test. Even if he drew something wrong, your response must be encouraging and never disappointing. Children form their relationship with writing at this age — be the kind of teacher who makes them WANT to try again.',
    '',
    'Rules:',
    '- Reply in plain spoken language Nigel can hear out loud (Ms. Humphrey speaks her response). 1-2 short sentences. ~25 words max.',
    '- Name a SPECIFIC observation about his drawing (not generic praise). Mention shape, size, line, curve, slant, or stroke quality.',
    '- If the drawing is clearly the correct ' + targetNoun + ', celebrate warmly and specifically.',
    '- If it is close but slightly off (e.g. mirrored, missing a stroke, sloppy), point out ONE thing he can adjust next time, gently.',
    '- If it looks like a completely different ' + targetNoun + ' or just a scribble, name what you see kindly ("That looks more like a 6 — for ' + targetLetter + ', remember it has..."), then describe the target ' + targetNoun + '\'s key feature in one short phrase. NEVER say "that\'s wrong" or "no" — instead say "almost" or "let\'s try once more."',
    targetKind === 'multi-digit'
      ? '- For multi-digit numbers: if he drew the digits in the WRONG ORDER (e.g. 52 instead of 25), gently note this — "I see a 5 and a 2, but for 25 the 2 comes first."'
      : '',
    targetKind === 'lower'
      ? '- For lowercase letters: if he drew a CAPITAL instead, gently note this — "That\'s a capital ' + targetLetter.toUpperCase() + '! For lowercase ' + targetLetter.toLowerCase() + ', it looks like..."'
      : '',
    targetKind === 'upper'
      ? '- For capital letters: if he drew a LOWERCASE instead, gently note this — "That\'s a lowercase ' + targetLetter.toLowerCase() + '! For capital ' + targetLetter.toUpperCase() + ', it looks like..."'
      : '',
    '- Use Nigel\'s name once, naturally. Sound like a caring teacher, not a robot.',
    '- Do NOT mention pixels, photos, images, AI, or your role as a tutor. You are just looking at his drawing.',
    '- NEVER comment on anything beyond the ' + targetNoun + ' shape (no remarks on the canvas, the page, his hand, etc.).',
    '',
    'Return ONLY a JSON object on a single line with this exact shape (no markdown, no commentary):',
    '{"reaction": "<your spoken response>", "correct": <true|false>, "score": <integer 0-5>}',
    '',
    'Score guide: 5 = beautiful, clearly correct. 4 = correct but a bit sloppy. 3 = recognizable as the target but with a notable issue. 2 = close but with a clear mistake (mirror, wrong segment, wrong digit order). 1 = looks like a different ' + targetNoun + '. 0 = no recognizable ' + targetNoun + ' / scribble.',
  ].filter(Boolean).join('\n');

  const userContent = [
    {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: imageData },
    },
    {
      type: 'text',
      text: 'This is Nigel\'s attempt at ' + targetDescription + '. Give him your warm, specific feedback as JSON.',
    },
  ];

  let haikuJson;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 200,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    });
    if (!r.ok) {
      const detail = await r.text();
      return res.status(502).json({ error: 'haiku_failed', detail: detail.slice(0, 400) });
    }
    haikuJson = await r.json();
  } catch (err) {
    return res.status(502).json({ error: 'haiku_failed', detail: String(err).slice(0, 400) });
  }

  // Extract the text response and parse the JSON
  let text = '';
  if (haikuJson && Array.isArray(haikuJson.content)) {
    for (const block of haikuJson.content) {
      if (block.type === 'text' && typeof block.text === 'string') {
        text += block.text;
      }
    }
  }
  text = text.trim();

  // Try to parse a JSON object out of the response
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    // Sometimes the model wraps in markdown code fences or adds prose. Try to
    // find the first {...} block and parse that.
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch (_2) {}
    }
  }

  if (!parsed || typeof parsed.reaction !== 'string') {
    // Fall back: return whatever text we got, wrapped, so the UX never feels broken.
    return res.status(200).json({
      reaction: text || 'I can see you worked hard on that letter — beautiful effort, Nigel!',
      correct: false,
      score: 3,
      parse_failed: true,
    });
  }

  const reaction = String(parsed.reaction).slice(0, 280);
  const correct = !!parsed.correct;
  let score = Number(parsed.score);
  if (!Number.isFinite(score)) score = correct ? 4 : 2;
  score = Math.max(0, Math.min(5, Math.round(score)));

  return res.status(200).json({
    reaction:      reaction,
    correct:       correct,
    score:         score,
    target_letter: targetLetter,
    target_kind:   targetKind,
  });
}
