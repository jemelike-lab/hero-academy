/**
 * Hero Academy — comprehension answer assessor.
 *
 * After ${kidName} reads a passage, Ms. Humphrey asks one comprehension
 * question. The kid says an answer. This endpoint decides whether the
 * answer demonstrates understanding, regardless of phrasing.
 *
 * Request:  POST application/json
 *   { question: string,            // "Who did Nigel go to find?"
 *     expectedAnswerHint: string,  // "Skylar"
 *     transcript: string,          // what the kid said
 *     passage?: string[],          // optional, helps Claude judge
 *     kidName?: string }
 *
 * Response:
 *   { passed: boolean,
 *     feedbackLine: string,   // always present, in Ms. Humphrey's voice
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

  const question = String(body.question || '').trim();
  const expectedHint = String(body.expectedAnswerHint || '').trim();
  const transcript = String(body.transcript || '').trim();
  const passage = Array.isArray(body.passage)
    ? body.passage.filter(s => typeof s === 'string').slice(0, 6).join(' ')
    : '';
  const kidName = String(body.kidName || 'Nigel').trim() || 'Nigel';

  if (!question || !expectedHint) {
    return res.status(400).json({ error: 'question and expectedAnswerHint are required' });
  }
  if (!transcript) {
    return res.status(200).json({
      passed: false,
      feedbackLine: `I did not catch that, ${kidName}. Try answering one more time.`,
      model: 'short-circuit',
      latency_ms: Date.now() - t0
    });
  }

  const systemPrompt = [
    `You are Ms. Humphrey, evaluating ${kidName}'s answer to a comprehension question about a tiny passage he just read.`,
    passage ? `Passage: "${passage}"` : '',
    `Question: "${question}"`,
    `Expected answer (hint, not literal): "${expectedHint}"`,
    `${kidName}'s spoken answer (via speech-to-text): "${transcript}"`,
    `Decide if the answer demonstrates understanding. Be LENIENT about phrasing — accept any answer that captures the key idea, even if worded differently or in a full sentence ("Skylar" and "His cousin Skylar" and "Skylar his cousin" all count).`,
    `Be LENIENT about STT slips on names (e.g. heard "skyler" for "Skylar" should pass).`,
    `Be STRICT if the answer is clearly wrong, unrelated, or just repeats the question.`,
    `Return ONLY this JSON shape:`,
    `{"passed": <boolean>, "feedbackLine": <string>}`,
    `feedbackLine is ALWAYS present — one warm sentence in your voice. If passed: short celebration that affirms what they got. If not: gentle hint that re-points them to the passage without giving the answer outright, ending with an invitation to try once more.`,
    `Never scold. Never reveal the answer if they got it wrong.`
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
        temperature: 0.45,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Evaluate now.` }]
      })
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error('[humphrey/assess-comprehension] upstream error:', upstream.status, text.slice(0, 500));
      return res.status(200).json({
        passed: false,
        feedbackLine: `Hmm, my ears glitched, ${kidName}. Try once more.`,
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
      return res.status(200).json({
        passed: false,
        feedbackLine: `Try that one more time, ${kidName}.`,
        model: 'parse-fallback',
        latency_ms: Date.now() - t0
      });
    }

    return res.status(200).json({
      passed: !!parsed.passed,
      feedbackLine: String(parsed.feedbackLine || (parsed.passed ? 'Got it!' : `Try once more, ${kidName}.`)),
      model: json.model || 'claude-haiku-4-5',
      latency_ms: Date.now() - t0
    });
  } catch (err) {
    console.error('[humphrey/assess-comprehension] handler error:', err);
    return res.status(500).json({ error: 'Internal error: ' + (err && err.message || err) });
  }
}
