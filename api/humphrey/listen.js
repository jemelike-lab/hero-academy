/**
 * Hero Academy — Speech-to-text endpoint via ElevenLabs Scribe.
 *
 * Accepts: POST multipart/form-data, field 'audio' containing audio/webm or audio/mp4.
 * Returns: JSON { transcript: string, language?: string }
 *
 * Uses ELEVENLABS_API_KEY from Vercel env. Scribe pricing ~$0.40/hr at our scale.
 */
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });
  }

  try {
    // Read raw request body
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bodyBuf = Buffer.concat(chunks);

    const contentType = req.headers['content-type'] || '';
    if (!contentType.startsWith('multipart/form-data')) {
      return res.status(400).json({
        error: 'expected multipart/form-data',
        got: contentType
      });
    }

    // Use Web FormData to parse incoming multipart (Node 18+ supports this).
    const wrapped = new Request('http://internal/listen', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: bodyBuf,
      duplex: 'half'
    });

    let audioFile;
    try {
      const incoming = await wrapped.formData();
      audioFile = incoming.get('audio');
    } catch (e) {
      return res.status(400).json({ error: 'multipart parse failed: ' + e.message });
    }
    if (!audioFile) {
      return res.status(400).json({ error: 'no audio field in multipart body' });
    }

    // Rebuild for ElevenLabs Scribe (their field is 'file', plus model_id required).
    const outgoing = new FormData();
    outgoing.append('file', audioFile, (audioFile.name || 'audio.webm'));
    outgoing.append('model_id', 'scribe_v1');

    const upstream = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: outgoing
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error('[humphrey/listen] Scribe upstream error:', upstream.status, text.slice(0, 500));
      return res.status(502).json({
        error: 'Scribe upstream error',
        status: upstream.status,
        detail: text.slice(0, 500)
      });
    }

    const json = await upstream.json();
    return res.status(200).json({
      transcript: ((json.text || '') + '').trim(),
      language: json.language_code || null,
      duration: json.duration || null
    });
  } catch (err) {
    console.error('[humphrey/listen] handler error:', err);
    return res.status(500).json({ error: 'Internal error: ' + (err && err.message || err) });
  }
}
