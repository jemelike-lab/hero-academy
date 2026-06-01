/**
 * Hero Academy — read-aloud phonetic assessor.
 *
 * The kid sees a word, says it aloud. ElevenLabs Scribe gives us a transcript.
 * This endpoint asks Claude Haiku to decide whether that transcript represents
 * an acceptably correct reading for a 7-year-old, allowing for STT errors,
 * accent slips, and minor phonetic stumbles — while staying strict about the
 * target phonics pattern.
 *
 * Request:  POST application/json
 *   { expected: string,       // e.g. "ship"
 *     transcript: string,     // e.g. "sip" or "ship" or "" (kid silence)
 *     pattern?: string,       // optional phonics tag, e.g. "sh-"
 *     hint?: string,          // optional context line for the assessor
 *     kidName?: string,       // default "Nigel"
 *     attempt?: number }      // 1 = first try, 2+ = retry (affects tone)
 *
 * Response:
 *   { passed: boolean,
 *     slip: string|null,            // brief tag, e.g. "missing-sh-onset"
 *     correction_line: string|null, // 1 short sentence in Ms. Humphrey voice
 *     praise_line: string|null,     // 1 short sentence if passed
 *     model: string,
 *     latency_ms: number }
 *
 * For empty transcripts we short-circuit (no Claude call needed) and return a
 * "didn't catch that" correction.
 */
export default async function handler(req, res) {
  const t0 = Date.now();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  if (!body || typeof body !== 'object') body = {};

  const expected = String(body.expected || '').trim().toLowerCase();
  const transcript = String(body.transcript || '').trim().toLowerCase();
  const pattern = String(body.pattern || '').trim();
  const hint = String(body.hint || '').trim();
  const kidName = String(body.kidName || 'Nigel').trim() || 'Nigel';
  const attempt = Number.isFinite(+body.attempt) ? Math.max(1, +body.attempt) : 1;

  if (!expected) return res.status(400).json({ error: 'expected is required' });

  // Short-circuit empty transcript — saves a Claude call.
  if (!transcript) {
    return res.status(200).json({
      passed: false,
      slip: 'no-audio',
      correction_line: attempt > 1
        ? `I am having trouble hearing you, ${kidName}. Try saying the word a little louder.`
        : `I did not catch that, ${kidName}. Take a breath and try again.`,
      praise_line: null,
      model: 'short-circuit',
      latency_ms: Date.now() - t0
    });
  }

  // Trivial exact match — skip Claude. (STT often nails common words.)
  // We still call Claude for praise text variety even on exact match, but a
  // direct exact match is an unambiguous pass with no slip.
  const exactMatch = transcript === expected;

  const systemPrompt = [
    `You are Ms. Humphrey, a warm 2nd-grade reading tutor evaluating a 7-year-old named ${kidName}.`,
    `${kidName} was asked to read the word "${expected}" out loud.`,
    pattern ? `The phonics target for this word is "${pattern}".` : '',
    hint ? `Teaching hint: ${hint}` : '',
    `Speech-to-text heard: "${transcript}".`,
    'Decide whether the child read the word acceptably correctly.',
    'BE LENIENT about: STT typos (especially swallowed final consonants like "fihs" for "fish"), regional or family accents (this child has Nigerian heritage and may pronounce some sounds slightly differently), and soft consonants. If the transcript is just a misspelling of the expected word that captures the right sounds, mark it passed.',
    'BE STRICT about: a completely different word, or missing the target phonics pattern entirely (e.g. "sip" instead of "ship" misses the sh onset).',
    'Return ONLY a JSON object with this exact shape, no other text:',
    '{ "passed": <true|false>, "slip": <null or short slip tag like "missing-sh-onset" or "wrong-word">, "correction_line": <null if passed, else ONE short sentence in your warm voice that names what to fix and offers help — never scold>, "praise_line": <null if failed, else ONE short upbeat sentence in your warm voice celebrating the read> }',
    `On a retry (this is attempt ${attempt}), be extra gentle and concrete in any correction. Use ${kidName}'s name sparingly. No markdown.`
  ].filter(Boolean).join(' ');

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 250,
        temperature: 0.4,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Evaluate now. Expected: "${expected}". Heard: "${transcript}". Attempt: ${attempt}.`
        }]
      })
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error('[humphrey/assess-reading] upstream error:', upstream.status, text.slice(0, 500));
      // Fail-safe: treat as a soft miss so the kid can try again
      return res.status(200).json({
        passed: false,
        slip: 'assess-upstream-error',
        correction_line: `Hmm, my ears glitched, ${kidName}. Tap to try again.`,
        praise_line: null,
        model: 'fallback',
        latency_ms: Date.now() - t0
      });
    }

    const json = await upstream.json();
    const blocks = Array.isArray(json.content) ? json.content : [];
    const raw = blocks
      .filter(b => b && b.type === 'text' && typeof b.text === 'string')
      .map(b => b.text).join(' ').trim();

    // Extract the JSON object from Claude's response. Be defensive — strip
    // any code fences or stray prose.
    let parsed = null;
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch (_) { parsed = null; } }
    if (!parsed || typeof parsed !== 'object') {
      console.error('[humphrey/assess-reading] could not parse Claude JSON. raw=', raw.slice(0, 300));
      return res.status(200).json({
        passed: exactMatch,
        slip: exactMatch ? null : 'parse-fallback',
        correction_line: exactMatch ? null : `Try once more, ${kidName}.`,
        praise_line: exactMatch ? `Got it, ${kidName}!` : null,
        model: 'parse-fallback',
        latency_ms: Date.now() - t0
      });
    }

    return res.status(200).json({
      passed: !!parsed.passed,
      slip: parsed.slip || null,
      correction_line: parsed.passed ? null : (parsed.correction_line || `Try once more, ${kidName}.`),
      praise_line: parsed.passed ? (parsed.praise_line || `Yes! That is right, ${kidName}.`) : null,
      model: json.model || 'claude-haiku-4-5',
      latency_ms: Date.now() - t0
    });
  } catch (err) {
    console.error('[humphrey/assess-reading] handler error:', err);
    return res.status(500).json({ error: 'Internal error: ' + (err && err.message || err) });
  }
}
