// /api/expedition-recall
//
// The reflection moment in Explorer's Hall. After Nigel completes the
// 3 wonder tiles, Humphrey asks him an open question ("Tell me one
// thing you want to remember about X"). His voice is transcribed via
// the existing Scribe pipeline and posted here as text.
//
// We send the transcript + the expedition topic to Haiku and ask
// Humphrey to respond warmly in 1-2 sentences, picking up on
// something specific he said. The response is played back via the
// existing /api/humphrey/tts endpoint on the client.
//
// We also log the event for the Saturday digest: Bianca should see
// "this week Nigel told Humphrey: 'Banneker did math without a
// teacher and I want to be like that.'"
//
// POST body: { child_id, expedition_id, transcript, topic }
// -> { ok, response, logged }

const MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_VERSION = '2023-06-01';
const NIGEL_CHILD_ID = '2e0e51c5-f120-4152-8aa1-041eeecc8165';

async function callRpc(name, body) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/rpc/${name}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) return null;
  return r.json();
}

async function callHaiku(systemPrompt, userMsg) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 256,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`anthropic ${r.status}: ${t.slice(0, 200)}`);
  }
  const data = await r.json();
  return (data.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join(' ')
    .trim();
}

const SYSTEM = `You are Ms. Humphrey, a warm, professional, slightly literary AI tutor speaking to Nigel, a 7-year-old 2nd-grader from Maryland.

He just finished an expedition in his Explorer's Hall about a topic. You asked him to reflect — to tell you something he wants to remember. He answered out loud and we transcribed it.

Your job: reply in 1-2 short sentences (max 30 words total). The reply should:
- Pick up on something specific he actually said. Don't be generic.
- Affirm warmly but never gushingly.
- Optionally add one tiny new detail that connects to what he said.
- Address him directly. Use his name once if it fits, not more.
- Be readable aloud (this gets sent to ElevenLabs TTS) — no em-dashes, no special punctuation, no markdown.

If the transcript is empty, garbled, or doesn't seem to be about the topic, give a gentle redirect like "I didn't quite catch that, but that's okay — what you remembered will stick with you."

Return ONLY the spoken reply text. No prefix. No quotation marks.`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });

  try {
    const body = req.body || {};
    const childId = body.child_id || NIGEL_CHILD_ID;
    const expeditionId = body.expedition_id;
    const transcript = (body.transcript || '').toString().trim();
    const topic = (body.topic || 'today\'s expedition').toString().trim();

    if (!expeditionId) {
      return res.status(400).json({ ok: false, error: 'missing expedition_id' });
    }

    const userMsg = `Topic of the expedition: ${topic}\n\nNigel said: "${transcript || '(silence)'}"\n\nReply now.`;
    const response = await callHaiku(SYSTEM, userMsg);

    // Telemetry — fire-and-forget. Don't fail the response if logging fails.
    let logged = false;
    try {
      await callRpc('ha_record_expedition_event', {
        p_child_id: childId,
        p_expedition_id: expeditionId,
        p_event_type: 'recall_submitted',
        p_payload: { transcript, response, topic },
      });
      logged = true;
    } catch (_) {}

    return res.status(200).json({ ok: true, response, logged });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err).slice(0, 300) });
  }
}
