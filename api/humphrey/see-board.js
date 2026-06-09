/**
 * Hero Academy — /api/humphrey/see-board
 *
 * v156 (Class Time v2). Generalized board vision endpoint. Where /see-letter
 * is locked to "Nigel hand-drew a single letter/number", this endpoint answers
 * "what is on the board right now?" for any zone, in any board mode, with
 * subject-aware context. Used by:
 *   - Class Time `whatIsOnBoard` client tool (Ms. Humphrey calls this mid-
 *     conversation before describing the board, so she answers from what is
 *     actually there instead of from memory).
 *   - Any future zone that wants "Humphrey, what do you see?" behavior.
 *
 * Privacy-first: the image is never persisted. Only the description text
 * leaves the server (and is then forwarded back to ElevenLabs as a tool
 * result so Humphrey can speak about it).
 *
 * Request (POST JSON):
 *   {
 *     image: "data:image/png;base64,...",         REQUIRED
 *     media_type: "image/png" (optional),
 *     context: {                                   OPTIONAL but recommended
 *       subject: "science" | "social" | "math" | "reading" | ...,
 *       board_mode: "drawing" | "image" | "mixed",
 *       displayed_image_caption: "Mount Fuji",     // what the board OUGHT to show
 *       displayed_image_url: "https://...",        // for reference only — not fetched
 *       question_from_nigel: "what's that little thing on top?"  // free text
 *     }
 *   }
 *
 * Response (200):
 *   {
 *     description: "I see a snow-covered mountain with a cloud near the peak...",
 *     can_see: true,
 *     confidence: 0.9,
 *     suggested_reply: "That little white wisp on top is a cloud, Nigel — the mountain is so tall it pokes through the clouds!"
 *   }
 *
 * Errors:
 *   400 { error: "no_image" } / "unsupported_media_type"
 *   413 { error: "image_too_large" }
 *   500 { error: "no_api_key" }
 *   502 { error: "haiku_failed", detail: "..." }
 */

const HAIKU_MODEL = 'claude-haiku-4-5';
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// Class Time canvases can run multi-MB; raise body cap to 8mb.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  // Buffer / string body fallbacks (PWA fetch quirks — same pattern as see-letter).
  let body = req.body;
  if (Buffer.isBuffer(body)) {
    try { body = JSON.parse(body.toString('utf8')); }
    catch (e) {
      console.log('[see-board] body was Buffer but JSON.parse failed; len=', body.length);
      body = {};
    }
  }
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  if (!body || typeof body !== 'object') body = {};

  const rawImage = body.image;
  if (!rawImage || typeof rawImage !== 'string') {
    console.log('[see-board] 400 no_image — typeof body.image=', typeof rawImage,
      'body keys=', Object.keys(body || {}).join(','));
    return res.status(400).json({ error: 'no_image' });
  }

  // ---- Parse data URL / raw base64 ----
  let mediaType = String(body.media_type || '').trim().toLowerCase();
  let imageData = rawImage;
  const dataUrlMatch = rawImage.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    if (!mediaType) mediaType = dataUrlMatch[1].toLowerCase();
    imageData = dataUrlMatch[2];
  }
  if (!mediaType) mediaType = 'image/png';
  if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
    return res.status(400).json({ error: 'unsupported_media_type', media_type: mediaType });
  }

  // Approx size check (base64 length * 0.75 ≈ bytes)
  const approxBytes = Math.floor(imageData.length * 0.75);
  if (approxBytes > MAX_IMAGE_BYTES) {
    return res.status(413).json({ error: 'image_too_large', approx_bytes: approxBytes });
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'no_api_key' });
  }

  // ---- Build context-aware system prompt ----
  const ctx = (body.context && typeof body.context === 'object') ? body.context : {};
  const subject       = String(ctx.subject || '').trim().toLowerCase();
  const boardMode     = String(ctx.board_mode || '').trim().toLowerCase();
  const expectedCaption = String(ctx.displayed_image_caption || '').trim();
  const question      = String(ctx.question_from_nigel || '').trim();

  const subjectLabel = ({
    math: 'math',
    reading: 'reading',
    spelling: 'spelling',
    writing: 'writing',
    grammar: 'grammar / phonics',
    phonics: 'grammar / phonics',
    vocabulary: 'vocabulary',
    science: 'science',
    social: 'social studies',
    'social-studies': 'social studies',
  })[subject] || subject || 'class time';

  const modeNote = boardMode === 'image'
    ? 'The board is in IMAGE mode — it is showing a real reference photo you (Ms. Humphrey) pulled up to illustrate the topic. Nigel cannot draw on it. Your job is to describe what you actually see in the photo, in plain language a 7-year-old understands.'
    : boardMode === 'drawing'
    ? 'The board is in DRAWING mode — it is a writing surface. Anything visible was either drawn by you (Ms. Humphrey) with a teaching tool, or drawn by Nigel with his finger.'
    : boardMode === 'mixed'
    ? 'The board is in MIXED mode — there may be a reference photo plus drawn marks layered on top.'
    : '';

  const expectedNote = expectedCaption
    ? `The board was set up to show: "${expectedCaption}". Verify that is what you actually see — if you see something different, say so honestly.`
    : '';

  const questionNote = question
    ? `Nigel just asked: "${question}". Your description should focus on what he is asking about.`
    : 'Describe the most prominent thing on the board first, then any details a curious 7-year-old might point to.';

  // CRITICAL: instructions weight on recency for Haiku — put the JSON spec LAST.
  const systemPrompt = [
    `You are Ms. Humphrey, a warm 2nd-grade homeschool tutor for Nigel (age 7, in Maryland). You are about to look at his classroom board during ${subjectLabel} class.`,
    '',
    modeNote,
    expectedNote,
    questionNote,
    '',
    'Be HONEST. If the board is blank, say so. If you cannot tell what something is, say so. Do not invent details that are not visible. Do not describe pixels, the screen, the photo medium, or your role as a tutor — speak as if you are standing in front of a classroom whiteboard.',
    '',
    'Keep `description` short (1-3 sentences, 7-year-old vocabulary). Keep `suggested_reply` to ONE warm sentence Nigel would hear out loud, using his name once, naturally.',
    '',
    '== OUTPUT FORMAT ==',
    'Return ONLY a JSON object on a single line. No markdown, no preamble:',
    '{"description": "<plain factual sentence(s)>", "can_see": <true|false>, "confidence": <0.0-1.0>, "suggested_reply": "<one warm spoken sentence>"}',
  ].filter(Boolean).join('\n');

  const userText = question
    ? `Nigel asked: "${question}". Look at the board and answer him.`
    : 'Describe what is on the board.';

  const userContent = [
    {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: imageData },
    },
    { type: 'text', text: userText },
  ];

  // ---- Call Haiku vision ----
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
        max_tokens: 250,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    });
    if (!r.ok) {
      const detail = await r.text();
      console.log('[see-board] haiku !ok status=', r.status, 'detail=', detail.slice(0, 200));
      return res.status(502).json({ error: 'haiku_failed', detail: detail.slice(0, 400) });
    }
    haikuJson = await r.json();
  } catch (err) {
    console.log('[see-board] haiku threw', err);
    return res.status(502).json({ error: 'haiku_failed', detail: String(err).slice(0, 400) });
  }

  // ---- Extract & parse JSON response ----
  let text = '';
  if (haikuJson && Array.isArray(haikuJson.content)) {
    for (const block of haikuJson.content) {
      if (block.type === 'text' && typeof block.text === 'string') text += block.text;
    }
  }
  text = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    // Try to recover by extracting first { ... } block
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch (_) { parsed = null; }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    console.log('[see-board] could not parse Haiku JSON; raw=', text.slice(0, 300));
    return res.status(502).json({
      error: 'haiku_unparseable',
      raw: text.slice(0, 300),
    });
  }

  const description = String(parsed.description || '').trim();
  const canSee = parsed.can_see === true || parsed.can_see === 'true';
  const confidence = (typeof parsed.confidence === 'number')
    ? Math.max(0, Math.min(1, parsed.confidence))
    : (canSee ? 0.7 : 0.3);
  const suggestedReply = String(parsed.suggested_reply || description).trim();

  return res.status(200).json({
    description,
    can_see: canSee,
    confidence,
    suggested_reply: suggestedReply,
  });
}
