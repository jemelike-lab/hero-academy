// api/class-time/lookup-image.js — v142
// POST { subject: "Annapolis Maryland statehouse" } -> live educational image
//
// Two-step Wikipedia lookup:
//   1. Search API finds the best matching article title
//   2. REST summary endpoint returns thumbnail + extract
//
// Results cached in Supabase ha_image_cache. Subsequent lookups for the same
// subject are instant. Native fetch only, no SDK deps.

const WIKI_USER_AGENT = 'Hero-Academy/1.0 (homeschool-app; admin@hero-academy.local)';

function normalizeSubject(s){
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
}

async function sbHeaders(){
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function sbGetCached(subject){
  const SB_URL = process.env.SUPABASE_URL;
  if (!SB_URL) return null;
  try {
    const q = `select=image_url,caption,attribution,source,wiki_title&subject_key=eq.${encodeURIComponent(subject)}&limit=1`;
    const r = await fetch(`${SB_URL}/rest/v1/ha_image_cache?${q}`, {
      method: 'GET', headers: await sbHeaders()
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0] || null;
  } catch(_){ return null; }
}

async function sbSaveCache(subject, rec){
  const SB_URL = process.env.SUPABASE_URL;
  if (!SB_URL) return;
  try {
    await fetch(`${SB_URL}/rest/v1/ha_image_cache?on_conflict=subject_key`, {
      method: 'POST',
      headers: { ...(await sbHeaders()), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        subject_key: subject,
        image_url: rec.image_url || null,
        caption: rec.caption || null,
        attribution: rec.attribution || null,
        source: rec.source || null,
        wiki_title: rec.wiki_title || null,
        looked_up_at: new Date().toISOString()
      })
    });
  } catch(_){ /* best-effort */ }
}

async function wikiSearch(query){
  // Use the Wikipedia search API to find the best-matching article title
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json&origin=*`;
  const r = await fetch(url, { headers: { 'User-Agent': WIKI_USER_AGENT } });
  if (!r.ok) throw new Error(`wiki search ${r.status}`);
  const j = await r.json();
  const hit = j?.query?.search?.[0];
  return hit?.title || null;
}

async function wikiSummary(title){
  // REST summary endpoint returns thumbnail + extract
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const r = await fetch(url, { headers: { 'User-Agent': WIKI_USER_AGENT } });
  if (!r.ok) throw new Error(`wiki summary ${r.status}`);
  return r.json();
}

async function lookupViaWikipedia(subject){
  // Step 1: find best title
  let title;
  try {
    title = await wikiSearch(subject);
  } catch(e){
    console.warn('[lookup-image] wiki search failed', e.message);
    return null;
  }
  if (!title) return null;

  // Step 2: fetch summary
  let summary;
  try {
    summary = await wikiSummary(title);
  } catch(e){
    console.warn('[lookup-image] wiki summary failed', e.message);
    return null;
  }

  // Prefer originalimage (higher res) but fall back to thumbnail
  const img = summary?.originalimage?.source || summary?.thumbnail?.source;
  if (!img) return null;

  // Trim caption to a kid-friendly length and remove HTML entities
  let extract = String(summary.extract || '').replace(/\s+/g, ' ').trim();
  // First sentence only is cleaner for a popup caption
  const firstSentence = extract.split(/(?<=[.!?])\s+/)[0] || extract;
  // Cap at ~140 chars; cut at last word boundary if longer, append ellipsis
  let caption = firstSentence;
  if (caption.length > 140){
    const cut = caption.slice(0, 140);
    const lastSpace = cut.lastIndexOf(' ');
    caption = (lastSpace > 80 ? cut.slice(0, lastSpace) : cut) + '…';
  }

  return {
    image_url: img,
    caption,
    attribution: 'Wikipedia',
    source: 'wikipedia',
    wiki_title: summary.title || title
  };
}

export default async function handler(req, res){
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS'){ res.status(204).end(); return; }
  if (req.method !== 'POST'){
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch(e){ return res.status(400).json({ error: 'invalid_json' }); }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'bad_body' });

  const subject = normalizeSubject(body.subject || body.topic || '');
  if (!subject) return res.status(400).json({ error: 'missing_subject' });

  // 1. Cache check
  const cached = await sbGetCached(subject);
  if (cached && cached.image_url){
    return res.status(200).json({
      ok: true,
      subject,
      image_url: cached.image_url,
      caption: cached.caption,
      attribution: cached.attribution,
      source: cached.source,
      wiki_title: cached.wiki_title,
      cached: true
    });
  }

  // 2. Live Wikipedia lookup
  try {
    const found = await lookupViaWikipedia(subject);
    if (found){
      // Best-effort cache write
      await sbSaveCache(subject, found);
      return res.status(200).json({ ok: true, subject, ...found, cached: false });
    }
  } catch (e){
    console.error('[lookup-image] wiki error', e.message || e);
  }

  // 3. No image found — let the client fall back to SVG library or text
  // Cache the negative result with TTL of one day implicitly (just don't cache for now)
  return res.status(200).json({
    ok: true,
    subject,
    image_url: null,
    caption: null,
    source: 'none',
    cached: false
  });
}
