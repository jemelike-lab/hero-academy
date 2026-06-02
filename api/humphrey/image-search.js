/**
 * Hero Academy — image search proxy.
 *
 * Used by Ms. Humphrey's speech bubble to surface a visual when she's reading
 * about a tangible thing (a hummingbird, a planet, a leaf, etc.).
 *
 * Backed by Wikipedia's MediaWiki API:
 *   - Free, no API key, CORS-enabled, generally kid-safe.
 *   - "generator=search + prop=pageimages" gives us a thumbnail from the top
 *     matching article, which is the right behavior for fuzzy queries like
 *     "Hummingbird Wings" → image from the "Hummingbird" article.
 *
 * GET /api/humphrey/image-search?q=Hummingbird%20Wings
 *   200 { url: 'https://upload.wikimedia.org/...jpg',
 *         caption: 'Hummingbird',
 *         source: 'wikipedia' }
 *   200 { url: null } when no good match
 *
 * Cached at CDN for an hour; same query returns the same image.
 */

const UA = 'HeroAcademy/1.0 (jemelike@gmail.com) educational-app';

export default async function handler(req, res) {
  const q = String((req.query && req.query.q) || '').trim();
  if (!q) {
    return res.status(400).json({ error: 'missing q' });
  }
  if (q.length > 100) {
    return res.status(400).json({ error: 'q too long' });
  }

  try {
    const params = new URLSearchParams({
      action: 'query',
      prop: 'pageimages|description',
      format: 'json',
      pithumbsize: '400',
      piprop: 'thumbnail',
      generator: 'search',
      gsrnamespace: '0',
      gsrlimit: '1',
      gsrsearch: q,
      origin: '*',
    });
    const wikiUrl = `https://en.wikipedia.org/w/api.php?${params.toString()}`;

    const wr = await fetch(wikiUrl, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!wr.ok) {
      return res.status(200).json({ url: null, error: `wikipedia ${wr.status}` });
    }
    const wj = await wr.json();
    const pages = (wj && wj.query && wj.query.pages) || {};
    const first = Object.values(pages)[0];
    const thumb = first && first.thumbnail && first.thumbnail.source;
    const caption = (first && (first.title || first.description)) || null;

    // Cache at the edge for an hour — same query, same image.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

    if (!thumb) {
      return res.status(200).json({ url: null, query: q });
    }
    return res.status(200).json({
      url: thumb,
      caption: caption,
      source: 'wikipedia',
      query: q,
    });
  } catch (e) {
    return res.status(200).json({ url: null, error: String(e && e.message || e) });
  }
}
