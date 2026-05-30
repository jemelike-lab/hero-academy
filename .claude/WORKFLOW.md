# Hero Academy — Detailed Workflow Notes

## Deploy verification (mandatory)

After `git push origin main`:

1. Open https://vercel.com/jemelike-6356s-projects/hero-academy/deployments
2. Wait for the new commit row to show **Ready · Production**
3. If a commit shows `Error` or stays `Building` for more than 60 seconds, click into it and read the build logs
4. Hard-reload the live URL with `?bust=vN` query param to bypass HTTP cache
5. If the change touched JS/CSS cached by the service worker, also clear caches + unregister SW (see below)

Only after all five steps pass should you call the work shipped.

## Service worker caching gotcha

The site is a PWA. `sw.js` declares `CACHE_VERSION` (e.g. `hero-academy-v8`).

When you change any cached file:

1. Bump `CACHE_VERSION` to a new string in `sw.js`
2. Push — Vercel deploys all changed files including new `sw.js`
3. New SW activates immediately on next page load (`skipWaiting()` + `clients.claim()` are already in the SW)
4. BUT the page that JUST loaded was served by the OLD SW. So the FIRST reload after deploy may show stale assets. SECOND reload is the one that sees fresh content.

To verify cleanly from devtools console:

    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
    location.reload();

## Pre-push checks

Before `git push`:

    node -c js/number-lab.js
    node -c js/app.js
    node -c js/humphrey.js
    grep -rnE '<<<<<<<|=======|>>>>>>>' --include='*.js' --include='*.html' .

Anything that errors or matches → fix before pushing.

## Testing homework off-day

Today is not Tue/Thu but you want to preview the card? In the homepage devtools console:

    const fake = { dateKey: '2026-06-02', dayName: 'Tuesday', topic: 'add_within_10', topicName: 'Add Within 10', target: 10, completed_count: 4, completed_at: null };
    localStorage.setItem('ha_homework_2026-06-02', JSON.stringify(fake));
    const _orig = loadHomework;
    window.loadHomework = () => JSON.parse(localStorage.getItem('ha_homework_2026-06-02'));
    renderHomework();
    window.loadHomework = _orig;

To preview the done state, change `completed_count: 10` and `completed_at: new Date().toISOString()`, then re-run.

Cleanup:

    Object.keys(localStorage).filter(k => k.startsWith('ha_homework_')).forEach(k => localStorage.removeItem(k));
    renderHomework();

## Common anchor patterns (for minified-style edits)

When editing minified files (`js/number-lab.js`, `js/app.js`) via Python str.replace on the VPS:

- Always `assert s.count(anchor) == 1` before `s.replace(anchor, ..., 1)` — minified files often have repeated substrings
- For Phaser scene methods in `*-cafe.html` / `*-lanes.html`, anchor on the method signature plus one disambiguating next line
- Catalog entries in `js/humphrey.js` are 4-space indented inside `CATALOG = {` (NOT 2-space — easy to get wrong)

## Homework feature internals

- Schedule: `new Date().getDay() === 2 || === 4` (local Tue/Thu, NOT UTC)
- Topic: derived from `state.currentMathSkill`, humanized by `_haHumanizeSkill` (snake_case → Title Case)
- Storage: `localStorage['ha_homework_<YYYY-MM-DD>']` per day (local date)
- Announce-once flag: `localStorage['ha_homework_announced_<YYYY-MM-DD>']` prevents replaying the assignment voice on every page reload
- Increment hook: `_haIncrementHomework()` called from `handleCorrect` in `number-lab.js`, right after the Humphrey streak block. Fires `Humphrey.say('homework-done')` with 900ms delay when count reaches target.

## Phase backlog (informational)

- Phase 2.6: rollover incomplete homework; "free practice" message on rest days
- Phase 5: Saturday email briefing to bianca.parker92@gmail.com + jemelike@gmail.com — homework completion/miss feeds into this
- Ms. Humphrey 6-expression set: idle/smile/encouraging/concerned/surprised/cheering — base portrait is Variant 1 from May 30 2026 MJ generation
