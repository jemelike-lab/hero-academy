/**
 * Hero Academy — subject path (v306).
 * GET /api/class-time/path?subject=math&child_id=...
 * Returns every topic for the subject with the child's mastery stats
 * (ha_get_subject_path). Backs the "My path" screen and placement.
 */
import { supabaseRpc } from './questions.js';

export default async function handler(req, res) {
  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const subject = String(req.query?.subject || 'math').toLowerCase().slice(0, 40);
  const childId = String(req.query?.child_id || process.env.PRIMARY_CHILD_ID || '2e0e51c5-f120-4152-8aa1-041eeecc8165');
  if (!SUPA_URL || !SUPA_KEY) return res.status(500).json({ error: 'no_supabase' });
  try {
    const topics = await supabaseRpc(SUPA_URL, SUPA_KEY, 'ha_get_subject_path', { p_child_id: childId, p_subject: subject });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, subject, topics: Array.isArray(topics) ? topics : [] });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
}
