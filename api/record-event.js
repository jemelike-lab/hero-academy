// api/record-event.js
// POST { child_id, event_type, payload } → ha_record_event RPC
import { createClient } from '@supabase/supabase-js';

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
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data, error } = await supabase.rpc('ha_record_event', {
      p_child_id: child_id,
      p_event_type: event_type,
      p_payload: payload
    });
    if (error) throw error;
    return res.status(200).json({ ok: true, id: data });
  } catch (e){
    console.error('[record-event] failed', e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
