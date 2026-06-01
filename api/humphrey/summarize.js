/**
 * Hero Academy — Ms. Humphrey conversation summarizer.
 *
 * Takes a conversation history (alternating user/assistant turns) and returns
 * a 2-3 sentence summary in Ms. Humphrey's voice that captures what was
 * discussed and anything personal Nigel revealed. These summaries get stored
 * client-side and fed back into her system prompt on future conversations so
 * she remembers across days/weeks.
 *
 * Request:  POST application/json
 *           { history: [{role:'user'|'assistant', content:string}, ...] }
 *
 * Response: JSON { summary: string }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  if (!body || typeof body !== 'object') body = {};

  let history = Array.isArray(body.history) ? body.history : [];
  history = history
    .map(m => {
      if (!m || typeof m !== 'object') return null;
      const role = m.role === 'assistant' ? 'assistant' : (m.role === 'user' ? 'user' : null);
      const content = typeof m.content === 'string' ? m.content.trim() : '';
      if (!role || !content) return null;
      return { role, content: content.slice(0, 1500) };
    })
    .filter(Boolean);

  if (history.length < 2) {
    return res.status(400).json({ error: 'history must have at least 2 turns' });
  }

  // Render the transcript as plain text for the summarizer
  const transcript = history
    .map(m => (m.role === 'user' ? 'Nigel' : 'Ms. Humphrey') + ': ' + m.content)
    .join('\n');

  const systemPrompt = [
    "You are Ms. Humphrey writing a short private note to herself about a conversation she just had with Nigel, her 7-year-old 2nd-grade student.",
    "Capture in 2-3 sentences what they discussed AND anything personal Nigel revealed (something he loves, struggles with, was excited about, family or friends he mentioned, feelings).",
    "Write in past tense, third person, in Ms. Humphrey's warm voice. Plain prose. No bullets, no markdown, no headers.",
    "If the conversation was very brief or trivial, write one sentence noting the topic. Do not invent facts that were not in the transcript.",
    "The point is so future-you can naturally reference this when you talk to Nigel next time."
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
        temperature: 0.4,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: 'Transcript:\n\n' + transcript + '\n\nWrite your private note now.'
        }]
      })
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error('[humphrey/summarize] upstream error:', upstream.status, text.slice(0, 500));
      return res.status(502).json({ error: 'Claude upstream error', detail: text.slice(0, 500) });
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

    return res.status(200).json({ summary: text });
  } catch (err) {
    console.error('[humphrey/summarize] handler error:', err);
    return res.status(500).json({ error: 'Internal error: ' + (err && err.message || err) });
  }
}
