// api/voice-usage.js — v141
// GET /api/voice-usage?child_id=... → today's voice conversation count
// Native fetch to Supabase REST RPC. No @supabase/supabase-js dep.

const DEFAULT_CHILD_ID = '2e0e51c5-f120-4152-8aa1-041eeecc8165';

async function sbRpc(fnName, args) {
  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SB_URL || !SB_KEY) {
    throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
  }
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(args || {}),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`supabase rpc/${fnName} -> ${r.status} ${body.slice(0, 200)}`);
  }
  return r.json();
}

export default async function handler(req, res){
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS'){ res.status(204).end(); return; }
  if (req.method !== 'GET'){ return res.status(405).json({ error:'method_not_allowed' }); }

  const child_id = String(req.query?.child_id || DEFAULT_CHILD_ID);

  try {
    const data = await sbRpc('ha_get_today_voice_usage', { p_child_id: child_id });
    const count = Array.isArray(data) && data.length > 0 ? (data[0].count ?? 0) : 0;
    return res.status(200).json({ ok: true, count });
  } catch (e){
    console.error('[voice-usage] failed', e);
    // Fail open so a broken endpoint doesn't lock Nigel out
    return res.status(200).json({ ok: true, count: 0, error: String(e.message || e) });
  }
}
