// api/cron/class-time-lessons.js
// Daily cron: pre-generate today's Class Time lesson plan via Haiku so morning open is instant.
// Run via Vercel cron at 10:00 UTC (~6am ET).
export default async function handler(req, res){
  // Auth: require x-vercel-cron header OR CRON_SECRET match
  const cronSecret = req.headers['x-cron-secret'] || req.query?.secret;
  const isVercelCron = req.headers['x-vercel-cron'] === '1' || req.headers['user-agent']?.includes('vercel-cron');
  if (!isVercelCron && cronSecret !== process.env.CRON_SECRET){
    return res.status(401).json({ error: 'unauthorized' });
  }

  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' });
  const todayET = fmt.format(new Date());
  const childId = process.env.PRIMARY_CHILD_ID || '2e0e51c5-f120-4152-8aa1-041eeecc8165';

  try {
    // Call our own lesson-plan endpoint with force=1
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['host'];
    const url = `${proto}://${host}/api/class-time/lesson-plan`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET || '' },
      body: JSON.stringify({ date: todayET, child_id: childId, force: true })
    });
    const data = await r.json();
    return res.status(200).json({ ok: true, date: todayET, lesson_source: data?.lesson?.source, topics: data?.lesson?.topics?.length });
  } catch (e){
    console.error('[cron class-time-lessons] failed', e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
