# Hero Academy — Agent Guide

Educational PWA for Nigel (7yo, 2nd grade, homeschooled, MD). Lives at https://hero-academy-jemelike-6356s-projects.vercel.app — Vercel auto-deploys `main` on every push (typically 5–10 seconds).

## Critical workflow rule

**After every `git push origin main`, verify the deploy before declaring work shipped.**

1. Open https://vercel.com/jemelike-6356s-projects/hero-academy/deployments
2. Wait for the new commit to show **Ready · Production** (5–10s typical for this project)
3. Hard-reload the live URL with a cache-bust query (e.g. `?bust=v9`) and spot-check the change
4. If a service worker is involved, unregister SW + clear caches before declaring done — old SW can serve stale JS even after deploy succeeds
5. Only then call the work shipped

See `.claude/WORKFLOW.md` for deeper notes.

## Repo map

**v300 (Oct 2026): React rewrite in progress.** Vite + React 18 + TypeScript + Tailwind. `src/` is the new app (`src/pages/Home.tsx`, `src/features/class-time/`). The legacy static site moved intact to `public/` and is still served at the same URLs (`/game-day.html`, `/word-tower.html`, …) until each zone is ported; the old homepage is `public/legacy-home.html`. `api/` is unchanged. `npm run build` → `dist/`. Routes handled by React need a rewrite in `vercel.json`. React routes so far: `/` (home), `/class-time`, `/game-day` (Digit Tower, `src/features/digit-tower/`, logic ported from js/digit-tower.js; themed per world via --dt-* CSS vars), `/path/:subject` (My path, from `ha_get_subject_path`), `/level-check/:subject` (placement; `api/class-time/placement.js` reuses `generateWithHaiku`). Mastery signal (v306): a first-try pass requires no wrong tries and no hint beyond rung 1; placement attempts record with zone `placement`.

### Legacy map (public/)

- `index.html` — homepage (zones grid, homework card, Ms. Humphrey widget)
- `number-lab.html` + `js/number-lab.js` — math practice game
- `cauldron-cafe.html` — Phaser cooking game (`CauldronScene`)
- `diner-lanes.html` — Phaser bowling game (`DinerScene`)
- `js/humphrey.js` — Ms. Humphrey trigger API (catalog, init/say/expression)
- `js/humphrey-integration.js` — legacy ConvAI tap-to-talk widget
- `js/app.js` — homepage controller (state, zones, homework setup)
- `game-day.html` + `js/digit-tower.js` — v210 Game Day (Tue/Thu): Digit Tower replaces the 4-course Class Time those days. 75-min phased session (hq → warm-up → floors → break → bonus → debrief), seeded room generator + 12 world skins, typed answers with work board, procedural WebAudio music, Ms. Humphrey TTS via `Humphrey.say`. Progress in `ha_tower_progress` / `ha_floor_runs` (migration `supabase/migrations/v210-digit-tower.sql`). `class-time.html?mode=class` forces the regular day.
- `sw.js` — service worker; bump `CACHE_VERSION` on every release touching cached files
- `css/style.css` — main stylesheet
- `assets/` — Ralphie + Ms. Humphrey portraits, zone icons

## Voice catalog (humphrey.js)

`welcome` · `goodbye` · `zone-enter` · `level-start` · `correct-answer` · `wrong-answer` · `streak-3` · `streak-5` · `streak-10` · `mastery-achieved` · `character-unlocked` · `try-again` · `homework-assigned` · `homework-done` · `_default`

Tokens in lines: `{kidName}` · `{topic}` · `{streak}` · `{zone}` · `{character}` · `{percent}` · `{dayName}`. kidName defaults to `'friend'` if not passed; pass `{ kidName: 'Nigel' }` in every `say()`.

## Tone

- Kid-appropriate. Nigel is 7. Lines stay under ~16 wpm reading speed (humphrey.js `minDurationMs: 2400` enforces a floor).
- Ms. Humphrey is a warm, encouraging teacher — Indian woman, late 40s, navy cardigan + magenta/purple/teal scarf.
- Ralphie the turtle is the kid's buddy/peer voice (separate from Humphrey).
