/**
 * Hero Academy — Ms. Humphrey Q&A endpoint backed by Claude Haiku 4.5.
 *
 * Request:  POST application/json
 *           { question: string,
 *             activeProblem?: string,   // e.g. "7 + 5"
 *             activeProblemAnswer?: string,
 *             kidName?: string,         // default "Nigel"
 *             grade?: string }          // default "2nd grade"
 *
 * Response: JSON { answer: string, redirected?: boolean }
 *
 * Behavior:
 *   - Detects when the question overlaps the current on-screen math problem and
 *     redirects to scaffolding ("count up from 7...") instead of giving the
 *     answer outright (HANDOFF §2.4 Option C).
 *   - Caps Claude max_tokens so responses stay short enough to feel
 *     conversational at TTS speed.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY not configured',
      hint: 'Add it in Vercel Project Settings → Environment Variables.'
    });
  }

  let body = req.body;
  // Some Vercel runtimes hand us a buffer instead of parsed JSON
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  if (!body || typeof body !== 'object') body = {};

  const question = String(body.question || '').trim();
  if (!question) {
    return res.status(400).json({ error: 'question is required' });
  }
  if (question.length > 500) {
    return res.status(400).json({ error: 'question too long (max 500 chars)' });
  }

  const kidName = String(body.kidName || 'Nigel').trim() || 'Nigel';
  const grade = String(body.grade || '2nd grade').trim() || '2nd grade';
  const activeProblem = body.activeProblem ? String(body.activeProblem).trim() : '';
  const activeProblemAnswer = body.activeProblemAnswer != null ? String(body.activeProblemAnswer).trim() : '';

  const systemPrompt = [
    `You are Ms. Humphrey, a warm, patient elementary-school teacher speaking aloud to ${kidName}, a ${grade} student.`,
    `Your voice will be spoken via TTS, so answer in two or three short conversational sentences. No markdown, no lists, no parentheticals.`,
    `You speak directly to the child using their name occasionally but not in every sentence.`,
    `If the question is about a school subject and you don't know the exact answer for sure, say honestly that you'd love to look it up together.`,
    `Never tell ${kidName} they are wrong or scold them. If they sound frustrated, validate the feeling first, then help.`,
    activeProblem
      ? `IMPORTANT TUTORING RULE: ${kidName} is currently working on the math problem "${activeProblem}"${activeProblemAnswer ? ` (the answer is ${activeProblemAnswer})` : ''}. If their question is asking you to solve this exact problem or one that uses the same numbers, DO NOT give the answer. Instead, gently nudge them with a counting-on strategy, a real-world example, or a question that helps them figure it out. For any unrelated question, just answer normally.`
      : `There is no active math problem on screen right now, so feel free to answer general curiosity questions directly and warmly.`
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
        max_tokens: 200,
        temperature: 0.6,
        system: systemPrompt,
        messages: [{ role: 'user', content: question }]
      })
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error('[humphrey/chat] Anthropic upstream error:', upstream.status, text.slice(0, 500));
      return res.status(502).json({
        error: 'Claude upstream error',
        status: upstream.status,
        detail: text.slice(0, 500)
      });
    }
    const json = await upstream.json();
    const blocks = Array.isArray(json.content) ? json.content : [];
    const text = blocks
      .filter(b => b && b.type === 'text' && typeof b.text === 'string')
      .map(b => b.text)
      .join(' ')
      .replace(/[*_`#>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const safeAnswer = text || "I'd love to think about that with you. Can you ask me again?";
    return res.status(200).json({
      answer: safeAnswer,
      redirected: !!activeProblem,
      model: json.model || 'claude-haiku-4-5',
      stop_reason: json.stop_reason || null
    });
  } catch (err) {
    console.error('[humphrey/chat] handler error:', err);
    return res.status(500).json({ error: 'Internal error: ' + (err && err.message || err) });
  }
}
