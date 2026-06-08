// api/record-event.js — v141
// POST { child_id, event_type, payload } → ha_record_event RPC
// Native fetch to Supabase REST. No @supabase/supabase-js dep.

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
  if (req.method !== 'POST'){ return res.status(405).json({ error:'method_not_allowed' }); }

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch(e){ return res.status(400).json({ error:'invalid_json' }); }
  if (!body || typeof body !== 'object') return res.status(400).json({ error:'bad_body' });

  const child_id   = body.child_id;
  const event_type = body.event_type;
  const payload    = body.payload || {};

  if (!child_id || !event_type || typeof event_type !== 'string'){
    return res.status(400).json({ error:'missing_fields' });
  }
  if (event_type.length > 80) return res.status(400).json({ error:'event_type_too_long' });

  try {
    const data = await sbRpc('ha_record_event', {
      p_child_id: child_id,
      p_event_type: event_type,
      p_payload: payload
    });
    return res.status(200).json({ ok: true, id: data });
  } catch (e){
    console.error('[record-event] failed', e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
