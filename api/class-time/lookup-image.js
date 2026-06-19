// api/class-time/lookup-image.js — v143
// POST { subject: "Maryland state flag" } -> live educational image
//
// v143 fixes the "Six Flags America" class of bug: the old resolver did a
// full-text Wikipedia search and BLINDLY took the #1 hit. For a query like
// "Maryland state flag", Wikipedia's ranker surfaces "Six Flags America" (an
// amusement park in Woodmore, Maryland) above "Flag of Maryland" because both
// "Maryland" and "Flags" score high. The wrong image then got cached forever.
//
// New flow:
//   1. Search API returns the top 5 candidate articles (title + description).
//   2. A Haiku disambiguation pass picks the article that ACTUALLY DEPICTS the
//      subject — or -1 if none fit. (Fail-safe: if Haiku is unavailable or the
//      call fails, fall back to the first candidate that has an image.)
//   3. REST summary endpoint supplies thumbnail + extract for the chosen title.
//   4. If nothing genuinely matches, return image_url:null and let the client
//      fall back to text/SVG — NEVER a wrong image.
//
// Cache key is namespaced with RESOLVER_VERSION, so bumping the version
// instantly retires every poisoned row from earlier resolvers (no migration,
// no truncate — old rows simply stop being read).

const RESOLVER_VERSION = 'v143';
const WIKI_USER_AGENT = 'Hero-Academy/1.0 (homeschool-app; admin@hero-academy.local)';
const HAIKU_MODEL = 'claude-haiku-4-5';
const ANTHROPIC_VERSION = '2023-06-01';
const CANDIDATE_COUNT = 5;

function normalizeSubject(s){
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
}

// Namespaced cache key — bumping RESOLVER_VERSION retires poisoned rows.
function cacheKeyFor(subject){
  return `${RESOLVER_VERSION}:${subject}`;
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
    const key = cacheKeyFor(subject);
    const q = `select=image_url,caption,attribution,source,wiki_title&subject_key=eq.${encodeURIComponent(key)}&limit=1`;
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
        subject_key: cacheKeyFor(subject),
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

// Top N candidate article titles for a query (was srlimit=1 + blind first-hit).
async function wikiSearch(query, limit = CANDIDATE_COUNT){
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&format=json&origin=*`;
  const r = await fetch(url, { headers: { 'User-Agent': WIKI_USER_AGENT } });
  if (!r.ok) throw new Error(`wiki search ${r.status}`);
  const j = await r.json();
  const hits = j?.query?.search || [];
  return hits.map((h) => h.title).filter(Boolean);
}

async function wikiSummary(title){
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const r = await fetch(url, { headers: { 'User-Agent': WIKI_USER_AGENT } });
  if (!r.ok) throw new Error(`wiki summary ${r.status}`);
  return r.json();
}

function shortCaption(summary, fallbackTitle){
  let extract = String(summary?.extract || '').replace(/\s+/g, ' ').trim();
  const firstSentence = extract.split(/(?<=[.!?])\s+/)[0] || extract || fallbackTitle || '';
  let caption = firstSentence;
  if (caption.length > 140){
    const cut = caption.slice(0, 140);
    const lastSpace = cut.lastIndexOf(' ');
    caption = (lastSpace > 80 ? cut.slice(0, lastSpace) : cut) + '…';
  }
  return caption;
}

// Ask Haiku which candidate actually DEPICTS the subject. Returns a 0-based
// index into `candidates`, or -1 if none are a genuine match. Fail-safe: any
// error returns null so the caller can fall back to a heuristic.
async function pickBestCandidate(subject, candidates){
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || candidates.length === 0) return null;

  const list = candidates.map((c, i) =>
    `${i}. ${c.title}${c.description ? ` — ${c.description}` : ''}`
  ).join('\n');

  const system = [
    'You match a search subject to the Wikipedia article that genuinely DEPICTS it,',
    'for a photo shown to a 7-year-old in a homeschool lesson.',
    'Choose the article that IS the subject — not one that merely mentions the same words.',
    'Example: subject "Maryland state flag" -> choose "Flag of Maryland", NEVER "Six Flags America"',
    '(an amusement park that happens to be in Maryland).',
    'If NONE of the candidates genuinely depict the subject, return -1.',
    'Respond with ONLY a JSON object: {"index": <number>}. No prose, no markdown.',
  ].join(' ');

  const user = `SUBJECT: ${subject}\n\nCANDIDATES:\n${list}\n\nWhich candidate index best depicts the subject? Return {"index": N} or {"index": -1}.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 50,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const m = cleaned.match(/\{[^}]*\}/);
    const parsed = JSON.parse(m ? m[0] : cleaned);
    const idx = parseInt(parsed.index, 10);
    if (!Number.isInteger(idx)) return null;
    if (idx < 0) return -1;
    if (idx >= candidates.length) return null;
    return idx;
  } catch (_) {
    return null;
  }
}

async function lookupViaWikipedia(subject){
  // Step 1: top candidate titles
  let titles;
  try {
    titles = await wikiSearch(subject);
  } catch(e){
    console.warn('[lookup-image] wiki search failed', e.message);
    return null;
  }
  if (!titles || titles.length === 0) return null;

  // Step 2: fetch all candidate summaries in parallel (resilient)
  const settled = await Promise.allSettled(titles.map((t) => wikiSummary(t)));
  const candidates = [];
  settled.forEach((s, i) => {
    if (s.status !== 'fulfilled' || !s.value) return;
    const sum = s.value;
    const image_url = sum?.originalimage?.source || sum?.thumbnail?.source || null;
    candidates.push({
      title: sum.title || titles[i],
      description: String(sum.description || '').slice(0, 120),
      image_url,
      summary: sum,
    });
  });
  if (candidates.length === 0) return null;

  // Step 3: disambiguate. Haiku chooses the article that DEPICTS the subject.
  let chosen = null;
  const pick = await pickBestCandidate(subject, candidates);
  if (pick === -1) {
    // Haiku says none genuinely match -> no image is better than a wrong one.
    console.log(`[lookup-image] no genuine match for "${subject}" among: ${candidates.map(c=>c.title).join(', ')}`);
    return null;
  }
  if (pick != null && candidates[pick] && candidates[pick].image_url) {
    chosen = candidates[pick];
  } else {
    // Fail-safe fallback (Haiku unavailable/failed, or chosen had no image):
    // first candidate that actually has an image.
    chosen = candidates.find((c) => c.image_url) || null;
  }
  if (!chosen || !chosen.image_url) return null;

  return {
    image_url: chosen.image_url,
    caption: shortCaption(chosen.summary, chosen.title),
    attribution: 'Wikipedia',
    source: 'wikipedia',
    wiki_title: chosen.title,
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

  // 1. Cache check (namespaced by resolver version)
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

  // 2. Live Wikipedia lookup + disambiguation
  try {
    const found = await lookupViaWikipedia(subject);
    if (found){
      await sbSaveCache(subject, found);
      return res.status(200).json({ ok: true, subject, ...found, cached: false });
    }
  } catch (e){
    console.error('[lookup-image] wiki error', e.message || e);
  }

  // 3. No genuine match — client falls back to SVG library or text.
  return res.status(200).json({
    ok: true,
    subject,
    image_url: null,
    caption: null,
    source: 'none',
    cached: false
  });
}
