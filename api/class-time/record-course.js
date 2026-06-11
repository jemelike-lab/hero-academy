/**
 * Hero Academy — /api/class-time/record-course
 *
 * v158 (Class Time v2). Records that a course was completed. Fired by
 * Class Time when a course wraps (timer hit zero, or Humphrey called
 * endClass). Upserts into ha_course_attempts so re-completion is
 * idempotent for the same (child_id, plan_date, course_order).
 *
 * Request (POST JSON):
 *   {
 *     child_id:       "UUID",                    REQUIRED
 *     date:           "YYYY-MM-DD",              REQUIRED
 *     course_order:   1-4,                       REQUIRED
 *     subject:        "math",                    REQUIRED
 *     topics_covered: ["addition-10","count-2"]  optional
 *   }
 *
 * Response (200):
 *   { ok: true, id: "uuid-of-attempt-row" }
 *
 * Errors:
 *   400 { error: "bad_request", detail: "..." }
 *   500 { error: "no_supabase" }
 *   502 { error: "supabase_failed", detail: "..." }
 */

export const config = {
  api: {
    bodyParser: { sizeLimit: '256kb' },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  // Buffer / string body fallbacks (same PWA-fetch pattern as see-letter / see-board).
  let body = req.body;
  if (Buffer.isBuffer(body)) {
    try { body = JSON.parse(body.toString('utf8')); }
    catch (_) { body = {}; }
  }
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  if (!body || typeof body !== 'object') body = {};

  const childId      = String(body.child_id || '').trim();
  // v174 fix: client sends `plan_date`, accept either for compatibility.
  // Previously this read only `body.date`, returned 400 silently, and
  // every course completion failed to write to ha_course_attempts even
  // though ha_events logged the class_time_course_complete event.
  const date         = String(body.plan_date || body.date || '').trim();
  const courseOrder  = parseInt(body.course_order, 10);
  const subject      = String(body.subject || '').trim();
  const topicsRaw    = body.topics_covered;
  const topicsCovered = Array.isArray(topicsRaw)
    ? topicsRaw.slice(0, 12).map(t => String(t).slice(0, 60))
    : [];

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(childId)) {
    return res.status(400).json({ error: 'bad_request', detail: 'child_id must be a UUID' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'bad_request', detail: 'date must be YYYY-MM-DD' });
  }
  if (!(courseOrder >= 1 && courseOrder <= 4)) {
    return res.status(400).json({ error: 'bad_request', detail: 'course_order must be 1..4' });
  }
  if (!subject || subject.length > 40) {
    return res.status(400).json({ error: 'bad_request', detail: 'subject required' });
  }

  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPA_URL || !SUPA_KEY) {
    return res.status(500).json({ error: 'no_supabase' });
  }

  try {
    const id = await supabaseRpc(SUPA_URL, SUPA_KEY, 'ha_record_course_complete', {
      p_child_id: childId,
      p_date: date,
      p_course_order: courseOrder,
      p_subject: subject,
      p_topics_covered: topicsCovered,
    });
    return res.status(200).json({ ok: true, id });
  } catch (e) {
    console.log('[record-course] supabase failed', String(e).slice(0, 200));
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
