/**
 * Hero Academy — /api/class-time/course-progress
 *
 * v158 (Class Time v2). Returns the per-course completion state for a
 * child on a given date. Used at Class Time boot to figure out which
 * course to start with (resume after reload, skip to next course if
 * mid-day, or show "all done" if all 4 courses already complete).
 *
 * Request:
 *   GET /api/class-time/course-progress?date=YYYY-MM-DD&child_id=UUID
 *
 * Response (200):
 *   {
 *     progress: [
 *       {
 *         course_order: 1,
 *         subject: "math",
 *         started_at: "2026-06-09T14:02:11.000Z",
 *         completed_at: "2026-06-09T14:11:08.000Z",
 *         topics_covered: ["add-10","count-2"]
 *       }, ...
 *     ]
 *   }
 *
 * Errors:
 *   400 { error: "bad_request", detail: "..." }
 *   500 { error: "no_supabase" }
 *   502 { error: "supabase_failed", detail: "..." }
 */

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' });
  }
  const date = String(req.query.date || '').trim();
  const childId = String(req.query.child_id || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'bad_request', detail: 'date must be YYYY-MM-DD' });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(childId)) {
    return res.status(400).json({ error: 'bad_request', detail: 'child_id must be a UUID' });
  }

  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPA_URL || !SUPA_KEY) {
    return res.status(500).json({ error: 'no_supabase' });
  }

  try {
    const rows = await supabaseRpc(SUPA_URL, SUPA_KEY, 'ha_get_course_progress', {
      p_child_id: childId, p_date: date,
    });
    // v159: explicitly opt out of any CDN/edge caching — this endpoint MUST
    // reflect real-time DB state, or the Class Time resume flow ends up
    // serving stale empty-progress data after a course completion.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(200).json({ progress: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    console.log('[course-progress] supabase failed', String(e).slice(0, 200));
    return res.status(502).json({ error: 'supabase_failed', detail: String(e).slice(0, 200) });
  }
}

async function supabaseRpc(url, key, fn, params) {
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'apikey': key,
      'authorization': `Bearer ${key}`,
    },
    body: JSON.stringify(params || {}),
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`supabase ${fn} ${r.status}: ${detail.slice(0, 200)}`);
  }
  const txt = await r.text();
  if (!txt) return null;
  try { return JSON.parse(txt); } catch (_) { return txt; }
}
