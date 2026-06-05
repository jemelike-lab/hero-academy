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
  // v104: identify-then-compare structure. The old prompt was too warmth-skewed
  // and Haiku was sometimes returning correct:true on drawings that were
  // clearly a different character. The fix: force Haiku to first OBJECTIVELY
  // identify what the drawing looks like, BEFORE comparing to target. Warmth
  // goes ONLY in the reaction text — never in the grading fields.
  const systemPrompt = [
    'You are Ms. Humphrey, a 2nd-grade homeschool tutor for Nigel (age 7, in Maryland). Nigel just hand-drew a ' + targetNoun + ' on a digital drawing board with his finger. You are looking at the drawing.',
    '',
    'Nigel was asked to write ' + targetDescription + '.',
    '',
    '== YOUR TASK ==',
    'You will return a JSON object with FOUR fields: identified_as, score, correct, and reaction.',
    '',
    'Be HONEST and OBJECTIVE in the grading fields (identified_as, score, correct). Warmth and encouragement go ONLY in the reaction text. Do not let warmth bleed into the score or the correct boolean. Honest feedback is what helps Nigel learn; lying that wrong is right teaches him nothing.',
    '',
    '== STEP 1: identified_as ==',
    'Look at the drawing and write down what character it MOST closely resembles. Be brutally honest:',
    '- If it clearly looks like the target ' + targetNoun + ', write the target.',
    '- If it looks like a different character, write that character (e.g. "E", "3", "b").',
    '- If it is multiple characters or partial, write what you see (e.g. "25", "2 then scribble").',
    '- If it is a scribble, blob, line, dot, or anything not recognizable as a character, write exactly: scribble',
    '- If the canvas is essentially blank, write exactly: blank',
    '',
    '== STEP 2: score (integer 0-5) ==',
    '  5 = clearly the target ' + targetNoun + ', well-formed',
    '  4 = clearly the target ' + targetNoun + ', a bit sloppy but unmistakable',
    '  3 = recognizable as the target but with a notable issue (wrong proportions, missing part, partial reversal)',
    '  2 = ambiguous — could be the target or could be something else',
    '  1 = looks like a different character entirely',
    '  0 = scribble, blank, or completely unrecognizable',
    '',
    '== STEP 3: correct (boolean) ==',
    'correct: true ONLY IF BOTH conditions are met:',
    '  (a) identified_as matches the target ' + targetNoun + ' (' + targetLetter + ')',
    '  (b) score >= 4',
    'Otherwise correct: false. Do not be generous here. A drawing that looks like an E is not a correct B no matter how neat the E is.',
    targetKind === 'lower'
      ? '  Case matters: if Nigel drew CAPITAL ' + targetLetter.toUpperCase() + ' when asked for lowercase ' + targetLetter.toLowerCase() + ', that is NOT correct. identified_as = "' + targetLetter.toUpperCase() + '", score 2-3, correct: false.'
      : '',
    targetKind === 'upper'
      ? '  Case matters: if Nigel drew lowercase ' + targetLetter.toLowerCase() + ' when asked for capital ' + targetLetter.toUpperCase() + ', that is NOT correct. identified_as = "' + targetLetter.toLowerCase() + '", score 2-3, correct: false.'
      : '',
    targetKind === 'multi-digit'
      ? '  Digit order matters: if Nigel drew the digits in reverse (e.g. 52 instead of 25), that is NOT correct. identified_as = the actual reversed number, correct: false.'
      : '',
    '',
    '== STEP 4: reaction (1-2 short sentences, ~25 words max) ==',
    'NOW you can be warm. This text is what Ms. Humphrey will speak out loud to Nigel.',
    '- Use Nigel\'s name once, naturally.',
    '- If correct: celebrate something SPECIFIC you noticed (the shape, the lines, the curves).',
    '- If wrong: be kind but honest. Name what you see ("That looks more like a 5 to me, Nigel"), then give one short tip about the target ("for a 3, remember two bumps stacked on the right side"). NEVER say "wrong" or "no" — say "almost" or "let\'s try once more."',
    '- If scribble or blank: gently invite him to try ("I don\'t quite see a letter yet, Nigel — give it another go").',
    '- Do NOT mention pixels, photos, AI, the canvas, the page, or your role as a tutor.',
    '',
    '== OUTPUT FORMAT ==',
    'Return ONLY a JSON object on a single line. No markdown, no preamble:',
    '{"identified_as": "<string>", "score": <0-5>, "correct": <true|false>, "reaction": "<spoken response>"}',
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

  // v104: server-side enforce honest grading. Even if Haiku returns
  // correct:true with score < 4, override it. Also cross-check that
  // identified_as actually matches the target — for letters, case-sensitive
  // (an uppercase B is not a lowercase b). For digits and multi-digit, exact
  // string match after trim/normalization. If identified_as is missing,
  // we fall back to whatever Haiku said about correct.
  const identifiedAs = String(parsed.identified_as || '').trim();
  if (identifiedAs) {
    let matches;
    if (targetKind === 'upper') {
      // Strict case: target B requires identified_as === "B"
      matches = identifiedAs === targetLetter.toUpperCase();
    } else if (targetKind === 'lower') {
      matches = identifiedAs === targetLetter.toLowerCase();
    } else {
      // digit or multi-digit: numeric string equality
      matches = identifiedAs.replace(/\s+/g, '') === targetLetter;
    }
    // Final correctness: identified char matches AND score is high enough
    correct = matches && score >= 4;
  } else {
    // Fallback: just clamp to score-based correctness so warmth can't
    // promote a 2 into a "correct"
    correct = correct && score >= 4;
  }

  return res.status(200).json({
    reaction:      reaction,
    correct:       correct,
    score:         score,
    target_letter:  targetLetter,
    target_kind:    targetKind,
    identified_as:  identifiedAs || null,
  });
}
