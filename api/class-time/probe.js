/**
 * Hero Academy — Class Time tutor probe (v303).
 *
 * After the first wrong answer, Ms. Humphrey asks ONE short pick-one question
 * that checks the idea underneath the problem, then steers the kid toward the
 * right method. This is the "tutor talks about each question" turn.
 *
 * Request:  POST { question, options[], correct_index, wrong_index, subject, topic, hint }
 * Response: { probe: { ask, options: [a, b], correct_index, right_say, wrong_say } }
 *
 * The client has a deterministic math fallback (src/features/class-time/probes.ts),
 * so this route mainly serves reading/spelling/science/grammar questions.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  if (!body || typeof body !== 'object') body = {};

  const question = String(body.question || '').trim().slice(0, 400);
  const options = Array.isArray(body.options) ? body.options.map(o => String(o).slice(0, 80)).slice(0, 6) : [];
  const correctIndex = Number.isInteger(body.correct_index) ? body.correct_index : -1;
  const wrongIndex = Number.isInteger(body.wrong_index) ? body.wrong_index : -1;
  const subject = String(body.subject || '').trim().slice(0, 40);
  const topic = String(body.topic || '').trim().slice(0, 80);
  const hint = String(body.hint || '').trim().slice(0, 200);
  if (!question || options.length < 2 || correctIndex < 0) return res.status(400).json({ error: 'question, options, correct_index required' });

  const system = [
    'You are Ms. Humphrey, a warm 2nd-grade tutor for a 7-year-old named Nigel. He just picked a wrong answer.',
    'Write ONE short check-in question that tests the idea under the problem (not the answer itself), with exactly two options.',
    'Rules: the question ≤ 90 characters, each option ≤ 30 characters, no letters A/B in the text, no markdown.',
    'right_say (≤ 140 chars): warm confirmation that uses the idea to point him toward solving it, without saying the final answer.',
    'wrong_say (≤ 160 chars): gentle correction that explains the idea simply, then points him toward solving it, without saying the final answer.',
    'Respond ONLY with JSON: {"ask":"...","options":["...","..."],"correct_index":0,"right_say":"...","wrong_say":"..."}'
  ].join(' ');
  const user = [
    `Subject: ${subject || 'unknown'}. Topic: ${topic || 'unknown'}.`,
    `Question: ${question}`,
    `Options: ${options.map((o, i) => `${i}: ${o}`).join(' | ')}`,
    `Correct option index: ${correctIndex}. He picked index: ${wrongIndex}.`,
    hint ? `Teacher hint on file: ${hint}` : ''
  ].filter(Boolean).join('\n');

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 300, temperature: 0.4, system, messages: [{ role: 'user', content: user }] })
    });
    if (!upstream.ok) {
      const text = await upstream.text();
      console.error('[class-time/probe] upstream', upstream.status, text.slice(0, 300));
      return res.status(502).json({ error: 'Claude upstream error' });
    }
    const json = await upstream.json();
    const text = (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{'); const end = clean.lastIndexOf('}');
    const parsed = JSON.parse(clean.slice(start, end + 1));
    const probe = {
      ask: String(parsed.ask || '').slice(0, 120),
      options: (Array.isArray(parsed.options) ? parsed.options : []).slice(0, 2).map(o => String(o).slice(0, 40)),
      correct_index: parsed.correct_index === 1 ? 1 : 0,
      right_say: String(parsed.right_say || '').slice(0, 200),
      wrong_say: String(parsed.wrong_say || '').slice(0, 220)
    };
    if (!probe.ask || probe.options.length !== 2) return res.status(502).json({ error: 'bad probe' });
    return res.status(200).json({ probe });
  } catch (err) {
    console.error('[class-time/probe] error', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
