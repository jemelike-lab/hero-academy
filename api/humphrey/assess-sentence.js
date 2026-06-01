/**
 * Hero Academy — sentence-level reading assessor.
 *
 * Given an expected sentence and the STT transcript of what the child said,
 * Claude Haiku decides:
 *   - did they read it well enough?
 *   - which SPECIFIC words were missed, substituted, or skipped?
 *   - how should Ms. Humphrey coach them (word-level scaffold)?
 *
 * Request:  POST application/json
 *   { expected: string,         // "The fish swims in the dish."
 *     transcript: string,       // "the fis swims in the dish"
 *     attempt?: number,         // 1 = first try
 *     kidName?: string }        // default 'Nigel'
 *
 * Response:
 *   { passed: boolean,
 *     errorWords: [{ expected, heard, issue }],  // empty if passed
 *     correctionLine: string|null,  // one-sentence coaching
 *     praiseLine: string|null,      // celebration if passed
 *     model, latency_ms }
 */
export default async function handler(req, res) {
  const t0 = Date.now();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  if (!body || typeof body !== 'object') body = {};

  const expected = String(body.expected || '').trim();
  const transcript = String(body.transcript || '').trim();
  const kidName = String(body.kidName || 'Nigel').trim() || 'Nigel';
  const attempt = Number.isFinite(+body.attempt) ? Math.max(1, +body.attempt) : 1;

  if (!expected) return res.status(400).json({ error: 'expected is required' });

  // Short-circuit empty transcript
  if (!transcript) {
    return res.status(200).json({
      passed: false,
      errorWords: [],
      correctionLine: attempt > 1
        ? `I am having trouble hearing you, ${kidName}. Try a little louder this time.`
        : `I did not catch that, ${kidName}. Take a breath and try the whole sentence again.`,
      praiseLine: null,
      model: 'short-circuit',
      latency_ms: Date.now() - t0
    });
  }

  const systemPrompt = [
    `You are Ms. Humphrey, a warm 2nd-grade reading tutor evaluating a 7-year-old named ${kidName}.`,
    `${kidName} was asked to read this sentence out loud: "${expected}"`,
    `Speech-to-text heard: "${transcript}"`,
    `Decide whether the reading is acceptable. Be LENIENT about STT typos and minor accent slips (${kidName} has Nigerian heritage, so some th/sh sounds may come out slightly soft). Be LENIENT about minor extra filler words ("um", a repeated word).`,
    `Be STRICT about: skipping a content word entirely, substituting a noticeably different word ("dish" said as "dog"), or missing the target phonics pattern in a word.`,
    `Look at the words one by one. For each word in the expected sentence, decide if it was read. Build the errorWords array only for words that were missed or substituted in a way that matters.`,
    `Return ONLY this JSON shape, no other text:`,
    `{"passed": <boolean>, "errorWords": [{"expected": <string>, "heard": <string|null>, "issue": <string>}], "correctionLine": <string|null>, "praiseLine": <string|null>}`,
    `If passed: errorWords is empty, correctionLine is null, praiseLine is ONE short warm celebration sentence (max ~15 words) — sometimes name a specific thing they nailed.`,
    `If not passed: errorWords lists the problem words. correctionLine is ONE warm, concrete sentence in your voice that NAMES one or two specific words to focus on, never scolds, and ends in an invitation to try again. praiseLine is null.`,
    `Examples of good correctionLine on misses: "Almost! Look at this word: fish. The sh sound is at the end. Try the sentence again." OR "Great try. The tricky word is wish — wish, like making a wish. Now read it once more."`,
    `On retry (attempt ${attempt}), be even more gentle and concrete.`
  ].join(' ');

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
        max_tokens: 400,
        temperature: 0.35,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Evaluate now. Expected: "${expected}". Heard: "${transcript}". Attempt: ${attempt}.` }]
      })
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error('[humphrey/assess-sentence] upstream error:', upstream.status, text.slice(0, 500));
      return res.status(200).json({
        passed: false,
        errorWords: [],
        correctionLine: `Hmm, my ears glitched, ${kidName}. Tap to try again.`,
        praiseLine: null,
        model: 'fallback',
        latency_ms: Date.now() - t0
      });
    }

    const json = await upstream.json();
    const blocks = Array.isArray(json.content) ? json.content : [];
    const raw = blocks
      .filter(b => b && b.type === 'text' && typeof b.text === 'string')
      .map(b => b.text).join(' ').trim();

    let parsed = null;
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch (_) { parsed = null; } }

    if (!parsed || typeof parsed !== 'object') {
      console.error('[humphrey/assess-sentence] parse fail. raw=', raw.slice(0, 300));
      // Best-effort fallback: exact-ish match
      const norm = s => String(s || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
      const exact = norm(transcript) === norm(expected);
      return res.status(200).json({
        passed: exact,
        errorWords: [],
        correctionLine: exact ? null : `Let us try that one more time, ${kidName}.`,
        praiseLine: exact ? `Got it, ${kidName}!` : null,
        model: 'parse-fallback',
        latency_ms: Date.now() - t0
      });
    }

    return res.status(200).json({
      passed: !!parsed.passed,
      errorWords: Array.isArray(parsed.errorWords) ? parsed.errorWords.slice(0, 8) : [],
      correctionLine: parsed.passed ? null : (parsed.correctionLine || `Try that one more time, ${kidName}.`),
      praiseLine: parsed.passed ? (parsed.praiseLine || `Beautiful reading, ${kidName}!`) : null,
      model: json.model || 'claude-haiku-4-5',
      latency_ms: Date.now() - t0
    });
  } catch (err) {
    console.error('[humphrey/assess-sentence] handler error:', err);
    return res.status(500).json({ error: 'Internal error: ' + (err && err.message || err) });
  }
}
