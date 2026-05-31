/**
 * Hero Academy — Ms. Humphrey TTS proxy
 * Vercel Serverless Function
 *
 * POST /api/humphrey/tts
 * Body: { "text": "Yes! Exactly right!" }
 * Returns: audio/mpeg stream
 *
 * Env vars (set in Vercel Dashboard → Settings → Environment Variables):
 *   ELEVENLABS_API_KEY — your ElevenLabs API key (never expose in client JS)
 */

const VOICE_ID = 'aNGh7D6DrhhIlad2U6Fg'; // Emory — Warm, Smooth and Friendly
const MODEL_ID = 'eleven_flash_v2_5';       // fast + cheap, ideal for short teacher lines
const MAX_TEXT_LENGTH = 500;                 // safety cap

export default async function handler(req, res) {
  // CORS — allow only our Vercel domain + localhost
  const origin = req.headers.origin || '';
  const allowed = [
    'https://hero-academy-jemelike-6356s-projects.vercel.app',
    'http://localhost',
    'http://127.0.0.1',
  ];
  if (allowed.some((o) => origin.startsWith(o))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });
  }

  const { text } = req.body || {};
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'Missing or empty "text" field' });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({ error: `Text too long (max ${MAX_TEXT_LENGTH} chars)` });
  }

  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: MODEL_ID,
          voice_settings: {
            stability: 0.50,
            similarity_boost: 0.75,
            style: 0.45,
            use_speaker_boost: true,
          },
          speed: 0.85,
        }),
      }
    );

    if (!upstream.ok) {
      const errBody = await upstream.text();
      console.error('[humphrey/tts] ElevenLabs error:', upstream.status, errBody);
      return res.status(502).json({ error: 'TTS upstream error' });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800'); // cache 1d client, 7d CDN

    // Stream the audio back
    const reader = upstream.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    };
    await pump();
  } catch (err) {
    console.error('[humphrey/tts] Error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
