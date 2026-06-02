# Hero Academy — Session Handoff

**Last updated:** Tue Jun 2 2026, ~21:30 ET
**Current SW version:** `hero-academy-v52`
**Last commit on main:** `22f80a0` (Build #6 Lane A — drawing canvas)

---

## 1. Project at a glance

Hero Academy is a homeschool PWA built for Josh's 7-year-old son Nigel. It teaches reading, math, science, and writing across five zones (Word Tower, Number Lab, Discovery Dome, Story Time, Story Lab) with Ms. Humphrey — an AI tutor persona — as the through-line. Sole developer: Josh (VELOX Automated Operations LLC, jemelike@gmail.com / josh@blhnurses.com).

**Live URL:** `https://hero-academy-jemelike-6356s-projects.vercel.app`
**Repo:** `github.com/jemelike-lab/hero-academy` (main branch is production)
**VPS:** `srv1641066` / `2.24.68.106` (Ubuntu 24.04, root access)
**Deploy clone on VPS:** `/tmp/hero-deploy` (mirrors main, used for SCP-then-push deploys)
**Supabase project_id:** `yofqeuguxgujgqnaejmw`
**Vercel project:** `prj_xxx` under team `jemelike-6356s-projects` (Pro)
**Nigel's child_id (DB):** `2e0e51c5-f120-4152-8aa1-041eeecc8165`

---

## 2. Standing authorizations & working style

Josh has given full standing authorization for:
- SSH into the VPS without asking
- Direct `git push origin main` on hero-academy
- Vercel deploy hook triggers
- Supabase migrations (apply_migration tool is fine)
- Browser automation screenshots via Claude in Chrome
- Driving the VPS terminal via the `computer` tool

**Communication style:** Execution-first. Josh prefers direct action over explanation. Skip preambles. Ship code. When making non-trivial design decisions in code, briefly note them in the response. Push back honestly when scope is too big — Josh respects "this is a 2-lane build, here's how I'd split it" over heroics that ship half-baked.

**Updates Josh likes:** Before/after framing tables — "this is what was there, this is what's there now."

---

## 3. Deploy workflow (the SCP + VPS pattern)

Hero Academy's Vercel uses Standard Protection and the sandbox's network can't reach Vercel hosts directly. Working pattern that's been reliable across many deploys:

1. **Build files locally** in `/home/claude/hero/` mirroring repo structure
2. **Bundle as tarball** in `/mnt/user-data/outputs/<name>.tar.gz`
3. **Present file** via `present_files` — Josh SCPs from his Mac:
   ```bash
   scp ~/Downloads/<name>.tar.gz root@2.24.68.106:/tmp/
   ```
4. **Drive deploy** via `computer` tool on VPS terminal (tab id `1889602523`):
   - `left_click` at `[600, 400]` to focus terminal
   - `type` the command
   - `key: Return`
   - `wait 5-7s`, then `screenshot` to verify

**Standard deploy command:**
```bash
tar xzf /tmp/<bundle>.tar.gz && echo '---SW---' && head -1 sw.js && echo '---STATUS---' && git status --short && git add -A && git commit -m '<message>' && git push origin main
```

5. **Wait ~50–55s for Vercel auto-deploy**, then `curl -fsSL https://raw.githubusercontent.com/jemelike-lab/hero-academy/main/sw.js | head -1` to confirm the version landed on main, before live verification via Claude in Chrome.

**Key constraint on VPS terminal:** It blocks synthetic JavaScript keyboard events. Must use the `computer` tool with real `left_click` + `type` + `key`, not JS-injected keyboard events.

---

## 4. Build status — the 8-point MBD list

| # | Build | Status | Notes |
|---|---|---|---|
| 1 | Today's Mission home tile | ✅ Live | Verified in earlier session |
| 2 | Adaptive AI content (problems use Nigel's people/interests) | ✅ Live | "Nigel/Gabriel/Skylar/Mom/soccer/bugs" land in problems. Script-tag bug fixed at commit `29632f4`. |
| 3 | Story arc / character episodes | ✅ Live | Verified |
| 4 | SRS (spaced repetition) + Friday cumulative quiz | ✅ Live | **This session.** Lanes 1+2 deployed at v48+v49. Auto-enroll on 2nd miss; Friday tile becomes orange/gold "FRIDAY QUIZ"; Saturday email pulls retention number from `ha_friday_quiz_results`. |
| 5 | Parent dashboard UI | 🟡 Half | Saturday email is live and feeding Bianca real data. **Interactive dashboard is the next big build.** |
| 6 | Multi-modal (visual aids + drawing canvas) | ✅ Both lanes shipped | Lane B (Wikipedia thumbnails in Humphrey's speech bubble) at v50–v51; Lane A (canvas with Nigel pen + Humphrey programmatic API) at v52. **Lane A2 deferred items below.** |
| 7 | Physical world bridge | ⬜ Not started | |
| 8 | Resilience + observability | ⬜ Not started | |

---

## 5. This session's deliverables (Builds #4 and #6)

### Build #4 — SRS + Friday Cumulative Quiz

**SW v47 → v48 → v49** (two lanes). Files added/changed:

| File | Purpose |
|---|---|
| Migration `ha_srs_build4` | Tables `ha_srs_queue`, `ha_friday_quiz_results`. RPCs: `ha_srs_enroll`, `ha_get_srs_due`, `ha_record_srs_review` (SM-2), `ha_record_friday_quiz_result`. Modified `ha_mark_{word,math,discovery}_attempt` to auto-enroll on EXACT 2nd miss. |
| Migration `ha_friday_quiz_items_rpc` | RPC `ha_get_friday_quiz_items(p_child_id, p_limit)` — auto-enrolls last-7d strugglers, returns due-first items. |
| `js/srs.js` | Client SRS module (loadDue, countDue, recordReview, recordFridayQuiz, normalize, shuffle, loadFridayQuiz). |
| `review.html` + `js/review-page.js` + `css/review.css` | Unified review screen supporting `?mode=daily` and `?mode=friday`. |
| `index.html` | Daily Practice tile; Friday-aware variant (orange/gold "FRIDAY QUIZ"). |
| `api/cron/saturday-email.js` | Reads `ha_friday_quiz_results` past 7d, folds `retention_pct` into Haiku factSheet; system prompt instructs to use it as authoritative or skip if null. |

**Decisions locked in:**
- Auto-enroll on **2nd miss** (not 1st)
- Daily Practice = adaptive count by avg difficulty (L1→3, L2→5, L3→7, L4→10)
- **Friday** (not Saturday) so email reads yesterday's result
- Unified review screen for all items
- SM-2 ease-factor algorithm (default 2.5, min 1.3)

**E2E verified live:** Wrong-answer 2x on Mario math problem → 1 SRS row landed. Daily Practice tile rendered count=1. Review hydrated; clicking "8" called `ha_record_srs_review` → reps 0→1, EF 2.50→2.60, interval 1d. Friday mode loaded same item via `loadFridayQuiz`; recorded result row with `retention_pct: 100`.

### Build #6 Lane B — Visual aids in Humphrey speech bubble

**SW v49 → v50 → v51.** Files:

| File | Purpose |
|---|---|
| `api/humphrey/image-search.js` | **NEW.** GET `?q=` proxies Wikipedia's `action=query&prop=pageimages&generator=search`. Returns `{url, caption, source: 'wikipedia'}` or `{url: null}`. Edge-cached 1h. No API key. UA: `HeroAcademy/1.0 (jemelike@gmail.com) educational-app`. |
| `js/humphrey.js` | Bubble HTML now contains `<figure class="ha-humphrey__bubble-figure" hidden>` with `<img>` + `<figcaption>`. New `fetchVisualAid(query)` with in-memory cache Map. `say(event, {..., image: 'query'})` threads image onto utterance. `pump()` tracks `state.currentUtterance` so async image fetch can verify still-current. Critical fix in v51: unhide figure **before** assigning `img.src` — browsers skip the fetch when parent is `display:none`. Removed `loading="lazy"` (unnecessary, was interfering). |
| `js/discovery-dome.js` | Line 167: passes `image: card.title` (e.g. "Hummingbird Wings", NOT `card.topic` which is generic) when Humphrey reads card fact. |
| `css/humphrey.css` | `.ha-humphrey__bubble-figure/__img/__caption` styles. Max-height 140px, rounded corners, pop-in animation. Caption uses `var(--ha-h-bubble-text)` so it adapts to dark bubble theme. |
| `index.html` | Friday tile "1 questions" → "1 question" singular fix. |
| `sw.js` | v51 |

**E2E verified live with screenshot:** Drove `Humphrey.say('try-again-reading', {text: 'Hummingbirds beat...', image: 'Hummingbird Wings', duration: 30000})` on live Discovery Dome. Bubble rendered with real Wikipedia hummingbird composite image (natural 500×500, rendered 140×140), caption "Hummingbird".

### Build #6 Lane A — Drawing canvas

**SW v51 → v52.** Choices: Q1=B (both Nigel and Humphrey can draw, Humphrey is the priority), Q2=C (both Story Lab and Number Lab).

| File | Purpose |
|---|---|
| `js/canvas.js` | **NEW.** 18KB. Two-layer canvas (humphreyCanvas bottom + nigelCanvas top). Virtual 1000-wide coord space, scaled to device with DPR. mount/unmount/isMounted. Nigel pen: pointer-events (touch + mouse + Apple Pencil), 5 colors `['#0a0b2e', '#ec4899', '#14b8d4', '#22c55e', '#f59e0b']`, eraser 32px destination-out, undo 20-step PNG dataURL stack, clear. `getDataURL()` composites both layers + white bg → PNG. `loadDataURL(url)` restores Nigel layer. Ms. Humphrey API: `humphreyClear`, `humphreyDrawLine`, `humphreyDrawCircle`, `humphreyDrawArrow`, `humphreyDrawText`, `humphreyDrawNumberLine(min, max, opts)` composite helper. All Promise-returning. Animation via requestAnimationFrame so it looks like real drawing. Humphrey default color magenta `#ec4899`, font `600 24px Fredoka`. Toolbar: color swatches, eraser, undo, clear. |
| `js/canvas-skills.js` | **NEW.** 6KB. Skill registry. `parseAddSub()` handles "8 - 3 = ?" direct arithmetic AND word problems (extracts first 2 nums + infers op from verbs). `subtractionLine` and `additionLine` routines: clear → number line 0-10 → magenta dot at minuend → "Start at N" text → cyan arrow → "Back N" / "Add N" text → green result circle → "= N". Registered for: subtract_within_10, subtract_within_20, add_within_10, add_within_20, make_10, doubles, doubles_plus_one. |
| `css/canvas.css` | **NEW.** 3.5KB. `.ha-canvas` stage, toolbar, color swatches, eraser/undo/clear tools, `.zone-canvas-section/toggle/host`. 16:9 aspect ratio (4:3 mobile <480px). Toggle cyan→magenta when active. |
| `number-lab.html` | Added canvas.css link, `<section class="zone-canvas-section">` with toggle + `<div id="canvasHost">` after problem-card. Script tags for canvas.js + canvas-skills.js + init script for lazy-mount on first toggle click. |
| `js/number-lab.js` | In `handleWrong` walkthrough branch (`else` after 2-strikes-or-d=1): auto-opens canvas section + mounts if needed + calls `CanvasSkills.drawForSkill(session.currentSkillId, session.currentProblem)` with 200ms delay (lets Humphrey speech start first). |
| `story-lab.html` | Added canvas.css link, canvas.js script tag. |
| `js/story-lab.js` | Completed-story screen now renders `<div class="zone-canvas-section">🎨 Draw a picture for your story...` with `id="sl-canvas-host"`. `saveStory()` captures `Canvas.getDataURL()` into `story.drawing` field of localStorage entry. |
| `sw.js` | v52 + canvas files in CORE. |

**Verified live:**
- Canvas API exposed (17 methods)
- 7 skills in registry
- Canvas mounts with proper retina dimensions (442×248 CSS / 883×497 backing, dpr=2)
- Toolbar renders (5 colors + eraser + undo + Clear)
- Humphrey drew on her layer — `humphrey_drew_something: true` (pixel alpha > 0); screenshot showed magenta number line + ticks rendering

**Not yet verified live (Josh to test):**
- Full animated draw (CDP throttles rAF in test environment — works in real Chrome)
- Story Lab canvas flow end-to-end
- Drawing dataURL persistence in `ha_stories` localStorage entry

---

## 6. Known issues — top of Lane A2 backlog

### Word-problem parser is brittle on ambiguous verbs

**File:** `js/canvas-skills.js` line ~25
**Symptom:** "Gabriel **gives** him 5 more" is parsed as subtraction because "gives" is in the subtraction regex, even though "more" makes it clearly addition.
**Fix sketch:** Weight "more"/"plus"/"total"/"altogether"/"in all"/"combined" as STRONG addition signals that override "gives". Restructure parser to check addition signals first, then subtraction signals, then default to op-based-on-skill.
**Impact while unfixed:** Some `make_10` and other addition word-problem variants won't trigger Humphrey's drawing (additionLine bails when parser returns op='-').

### Canvas animation throttling under CDP testing

Not a real production issue — when Nigel uses the app in his actual Chrome tab, animations run at 60fps. The throttling only affects verification screenshots when Claude in Chrome is driving the tab.

### Caption color v51 fix uses CSS var

The Lane B caption color now uses `var(--ha-h-bubble-text, #2a2418)` with opacity 0.75. Works on cream and dark bubble themes. Already deployed.

---

## 7. Lane A2 deferred (next round of canvas work)

- Catalog more pre-canned skill drawings (currently covers add/subtract within 10/20, make_10, doubles)
- Harden parser (see above)
- DB-backed drawing persistence (`ha_drawings` table) — currently localStorage only
- AI-generated drawings via Haiku output of draw commands (Haiku returns JSON drawing instructions)
- Bedtime story canvas
- Math manipulatives layer (drag-drop coins, base-10 blocks)
- Visual aids in speech bubble for more zones (currently only Discovery Dome wires `image: card.title`)
- Word Tower could use the canvas for letter tracing

---

## 8. Critical technical notes that future-me must remember

### Audio gate

Ms. Humphrey's audio chain: pre-rendered MP3 → ElevenLabs TTS → Web Speech API → silent. Gate logic in `playAudio()`:
```js
if (!state.cfg.audioEnabled || isMuted() || !state.audioUnlocked) { return; }
```
The bubble (text + image) renders REGARDLESS of audio gate. `audioUnlocked` requires a real user gesture (click/tap). When driving via CDP, audio stays gated unless `setupAudioUnlock` has fired via a synthesized gesture.

### Service worker version tracking

SW version is the canary for "did the deploy land?" Always confirm via:
```bash
curl -fsSL "https://raw.githubusercontent.com/jemelike-lab/hero-academy/main/sw.js" | head -1
```
**Current:** `const CACHE_VERSION = "hero-academy-v52";`

Every deploy bumps this. CORE array includes core HTML/CSS/JS so new files added to CORE get pre-cached on SW install. Verify on live by `(await caches.keys()).filter(k => k.includes('hero'))` in console.

### Difficulty levels and walkthrough triggers in Number Lab

`handleWrong()` logic in `js/number-lab.js`:
- `session.strikesOnProblem === 1 && difficulty > 1` → "Almost!" + hint button + Humphrey says wrong-answer-math. NO canvas drawing yet.
- `else` → walkthrough fires. Humphrey says try-again-math AND canvas auto-opens + draws skill explanation.

So at difficulty 2 (default), Nigel must miss twice to see the canvas drawing. At difficulty 1, one miss triggers it.

**Nigel's current numberlab difficulty:** 3 (was bumped 2→3 via single-session aces during prior verification session — 5/5 correct in one session triggers a bump).

### `card.title` vs `card.topic` (Discovery Dome)

`card.topic` is a generic bucket ("animals", "weather", "space") — too vague for image search.
`card.title` is specific ("Hummingbird Wings", "Spider Webs", "Moon Phases") — use this for `image:` field.

### Word problem parser ambiguity

In addition to "gives" being treated as subtraction (see Known Issues), the parser uses fairly simple heuristics. Always verify by checking what `parseAddSub(question)` returns for a sample of problems before trusting it for new skills.

### Browser test environment quirks

- CDP throttles `requestAnimationFrame` to ~1Hz when tab isn't focus-visible to the OS. Test by driving real user gestures with `computer` tool clicks rather than synthetic events when possible.
- VPS web terminal at `bos2.hostingervps.com/3115` blocks synthetic JS keyboard events. Always drive with `computer` tool, never `dispatchEvent`.
- Sandbox network can't reach Vercel hosts (`host_not_allowed`). Use Chrome tab navigations + JS execution for live verification.

---

## 9. Important file paths

### On the repo (hero-academy)

```
.claude/HANDOFF.md                          ← this doc, current canonical context
api/humphrey/
  ├── tts.js                                ElevenLabs TTS
  ├── chat.js                               Haiku Q&A
  ├── listen.js                             ElevenLabs STT
  ├── summarize.js
  ├── assess-reading.js
  ├── assess-comprehension.js
  ├── assess-sentence.js
  ├── generate-passage.js
  ├── generate-word-tower-batch.js
  ├── generate-math-problems.js
  ├── generate-discovery-cards.js
  ├── generate-story-templates.js
  ├── generate-character-episode.js
  └── image-search.js                       ← NEW Lane B (Wikipedia proxy)
api/cron/saturday-email.js                  Folds retention_pct into Bianca's weekly email
js/
  ├── humphrey.js                           Corner portrait + speech bubble + image fetch
  ├── srs.js                                ← NEW Build #4 client SRS
  ├── review-page.js                        ← NEW Build #4 page logic
  ├── canvas.js                             ← NEW Lane A two-layer canvas + Humphrey API
  ├── canvas-skills.js                      ← NEW Lane A per-skill drawing routines
  ├── number-lab.js                         Highly minified — be careful with str_replace
  ├── story-lab.js
  ├── discovery-dome.js
  ├── word-tower.js
  ├── story-time.js
  └── characters.js                         Story arc / episode unlock logic
css/
  ├── humphrey.css                          Bubble + figure + img + caption + listening pulse
  ├── canvas.css                            ← NEW Lane A
  ├── review.css                            ← NEW Build #4
  └── ...
review.html                                 ← NEW Build #4 unified daily/friday quiz
index.html                                  Home with mission + daily practice tile
sw.js                                       Cache-version bumped on every deploy
```

### On the VPS

```
/tmp/hero-deploy/                           Clone of main; used for staging deploys
/tmp/<bundle>.tar.gz                        SCP'd bundles land here
/home/casesync/CLAUDE_CONTEXT.md            Per-product context (DO NOT confuse with this)
/home/casesync/AGENT_PROTOCOL.md            Agent protocol
```

### Sandbox

```
/home/claude/hero/                          Local staging directory mirroring repo structure
/mnt/user-data/outputs/                     Tarballs for Josh to SCP
```

---

## 10. Supabase highlights

**Project ID:** `yofqeuguxgujgqnaejmw`

**Key tables Hero Academy uses:**
- `ha_children` — Nigel's child_id: `2e0e51c5-f120-4152-8aa1-041eeecc8165`
- `attempted_word_items`, `attempted_math_problems`, `attempted_discovery_cards` — per-attempt log
- `ha_difficulty_state` — per-skill difficulty level (Nigel numberlab=3 currently)
- `ha_session_signals` — per-session aggregate (items_attempted, items_correct_first_try, longest_streak)
- `ha_srs_queue` — **NEW.** SRS items with SM-2 fields (ease_factor, interval_days, repetitions, due_at)
- `ha_friday_quiz_results` — **NEW.** Per-Friday-quiz outcome with per-zone breakdown JSON and retention_pct
- `ha_stories`, `ha_story_templates`, `ha_word_items`, `ha_math_problems`, `ha_discovery_cards` — content
- `ha_character_episodes`, `ha_character_arc_progress` — story arc state

**RPCs Hero Academy uses:**
- `ha_mark_word_attempt`, `ha_mark_math_attempt`, `ha_mark_discovery_attempt` — auto-enroll on 2nd miss now
- `ha_srs_enroll`, `ha_get_srs_due`, `ha_record_srs_review`
- `ha_record_friday_quiz_result`, `ha_get_friday_quiz_items`
- `ha_mark_story_completed`

---

## 11. Standing decisions / preferences

- **Single-source-of-truth for content:** AI-generated problems land in DB via Haiku endpoints; client always pulls from DB, never generates client-side.
- **Difficulty bumps:** Single-session aces (5/5 first-try in one session) bumps difficulty +1.
- **Mastery:** Per-skill `masteryCount` (configured per skill in `data/math-skills.js`, `data/word-skills.js`). Hitting it triggers POW! SKILL MASTERED celebration.
- **Story Lab cap:** `MAX_SAVED_STORIES = 20` — drops oldest when exceeded.
- **Audio language:** US English. ElevenLabs voice ID and voice settings live in `api/humphrey/tts.js`.
- **Privacy:** No PII shipped to client beyond Nigel's first name. All AI generation is keyed to the abstract child_id, not name. Memory/persistence in localStorage uses `ha_` prefix.
- **Color palette:** Used across canvas + Humphrey:
  - Navy `#0a0b2e` — primary text
  - Magenta `#ec4899` — Humphrey emphasis / "Start at"
  - Cyan `#14b8d4` — arrows / "Back N" / "Add N"
  - Green `#22c55e` — result / mastery
  - Gold `#f59e0b` — coin / streak
  - Cream bubble bg `#fff8eb`
  - Star border `#f0d9a6`

---

## 12. Next session: where to start

**Recommended priority:** Build #5 (parent dashboard interactive UI). The Saturday email is already live and pulling retention numbers. Bianca will want to drill into specific weeks, see Nigel's progress per zone, view trend lines.

**Alternative:** Build #6 Lane A2 — harden the word-problem parser, expand the skill-drawing catalog, ship `ha_drawings` table.

**Or:** Build #8 (resilience + observability) — error tracking, retry logic on API failures, offline-first patterns. Lower-priority for Nigel's immediate experience but reduces 1am support pings.

**Things Josh said he'd test in his own browser before next session:**
1. Number Lab — get a problem wrong twice at difficulty ≥2; verify canvas auto-opens and Humphrey draws an animated number line
2. Sketch toggle — switch colors, draw freehand, undo, clear
3. Story Lab — write a story, see the canvas section, draw an illustration, tap SAVE
4. Verify drawing persists: `JSON.parse(localStorage.ha_stories).slice(-1)[0].drawing` should be a base64 string

---

## 13. SW version history (recent)

| Version | What shipped |
|---|---|
| v47 | Script-tag bug fix from Build #2 verification |
| v48 | Build #4 Lane 1 — SRS infrastructure + auto-enroll + Daily Practice tile |
| v49 | Build #4 Lane 2 — Friday cumulative quiz + Saturday email retention |
| v50 | Build #6 Lane B initial (had img-load timing bug) |
| v51 | Build #6 Lane B fix (unhide figure before src) |
| **v52** | **Build #6 Lane A — drawing canvas** |

---

## 14. Misc useful one-liners

```bash
# Confirm latest SW on main
curl -fsSL "https://raw.githubusercontent.com/jemelike-lab/hero-academy/main/sw.js" | head -1

# Inspect Nigel's SRS queue
psql -c "SELECT source_table, source_item_id, ease_factor, interval_days, repetitions, due_at FROM ha_srs_queue WHERE child_id = '2e0e51c5-f120-4152-8aa1-041eeecc8165' ORDER BY due_at;"

# Inspect Friday quiz results
psql -c "SELECT taken_at, items_total, items_correct, ROUND(100.0*items_correct/NULLIF(items_total,0)) AS pct, weak_areas FROM ha_friday_quiz_results WHERE child_id = '2e0e51c5-f120-4152-8aa1-041eeecc8165' ORDER BY taken_at DESC;"

# Force SW update + check version in browser console
(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const r of regs) await r.update();
  return (await caches.keys()).filter(k => k.includes('hero'));
})();

# Test image-search endpoint
curl -s "https://hero-academy-jemelike-6356s-projects.vercel.app/api/humphrey/image-search?q=Hummingbird" | jq
```

---

**End of handoff.** Drop this into `.claude/HANDOFF.md` on main, or have the next session read it directly from the bundle file.
