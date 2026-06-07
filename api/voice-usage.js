// api/voice-usage.js
// GET /api/voice-usage?child_id=... → today's voice conversation count
import { createClient } from '@supabase/supabase-js';

const DEFAULT_CHILD_ID = '2e0e51c5-f120-4152-8aa1-041eeecc8165';

export default async function handler(req, res){
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS'){ res.status(204).end(); return; }
  if (req.method !== 'GET'){ return res.status(405).json({ error:'method_not_allowed' }); }

  const child_id = String(req.query?.child_id || DEFAULT_CHILD_ID);

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data, error } = await supabase.rpc('ha_get_today_voice_usage', { p_child_id: child_id });
    if (error) throw error;
    const count = Array.isArray(data) && data.length > 0 ? (data[0].count ?? 0) : 0;
    return res.status(200).json({ ok: true, count });
  } catch (e){
    console.error('[voice-usage] failed', e);
    // Fail open so a broken endpoint doesn't lock Nigel out
    return res.status(200).json({ ok: true, count: 0, error: String(e.message || e) });
  }
}
