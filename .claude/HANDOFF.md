# Hero Academy — Session Handoff

**Last updated:** 2026-06-05 (after v86 ship, Friday late night)
**Current SW cache:** `hero-academy-v86`
**Most recent commit message convention:** `feat:` / `fix:` / `docs:` followed by SW version in parens

---

## TL;DR for the next Claude

1. **Read this whole file before doing anything.** It is the canonical truth source.
2. **Live UI verification is mandatory.** Code on disk + DB row counts are not enough. Drive the actual review.html / index.html / parent.html flow in Chrome MCP, capture state, and confirm features work as a 7-year-old would experience them. Josh has called this out three times across sessions — do not skip it.
3. **Ms. Humphrey reads every educational interaction aloud.** This is the core product moat. Any new zone, quiz, or interactive element MUST wire `NS.Humphrey.say()` for question/instruction read-aloud. See "Read-aloud coverage" below.
4. **SW cache version must be bumped on every deploy and every new file added to the `CORE` array.** v82 shipped without bumping the cache name — caused confusion. Don't repeat it.

---

## Purpose & context

Josh is building **Hero Academy** — a superhero-themed homeschool PWA for his son Nigel (age 7, 2nd grade, homeschooled in Upper Marlboro, MD). The app serves as a full daily curriculum platform aligned to CCSS + MD MCCRS standards across all required subjects, with an AI tutor character (Ms. Humphrey) as the central teaching presence. Success looks like a structured daily learning journey with adaptive content, progress visibility for parents, and genuine engagement that feels like a narrative adventure rather than a subject buffet.

**Key people**
- Nigel — student
- Josh — builder/parent, `jemelike@gmail.com`
- Bianca — co-parent, `bianca.parker92@gmail.com` (Saturday email recipient)
- Ms. Humphrey — AI tutor. Indian woman in her late 40s, warm and professional. Navy cardigan + magenta/purple/teal silk scarf + small gold earrings + dark hair in low bun. Pixar 3D style matching Ralphie the turtle mascot. Voice: ElevenLabs Emory `aNGh7D6DrhhIlad2U6Fg` (flash model).

**Primary target device**
Android Galaxy Tab running Chrome, installed as PWA. Touch-only input, ~10-inch screen, standalone PWA mode, rear camera available. No iOS-specific audio workarounds needed.

---

## Infrastructure — all live

| | |
|---|---|
| App URL | `hero-academy-jemelike-6356s-projects.vercel.app` |
| Repo | `github.com/jemelike-lab/hero-academy` |
| Vercel project | `prj_oqgpbeK3B8E4t69aV8AcNdLp6sPw` (team `team_fASanR2j8wd8bhOUYS07f3NL`) |
| VPS | Hostinger `root@2.24.68.106`, deploy path `/tmp/hero-deploy` |
| Supabase | `hero-academy` (id `yofqeuguxgujgqnaejmw`, us-east-1) |
| Nigel child_id | `2e0e51c5-f120-4152-8aa1-041eeecc8165` |
| ElevenLabs agent | `agent_5901kssbzjm1e0yvd0kdwxa3r49m` |

**Backend conventions**
- Schema prefix `ha_*`. All writes via `SECURITY DEFINER` RPCs.
- Anon cannot touch tables directly — by design.
- Mastery threshold: ≥80% in a session.

**Saturday cron email (live since Jun 2)**
Vercel cron Sat 12:00 UTC → `/api/cron/saturday-email` → 7-day Supabase fetch → Claude Haiku draft in Ms. Humphrey voice → Zapier Catch Hook → Gmail → both parents. Env vars: `CRON_SECRET`, `ZAPIER_WEBHOOK_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`. Zap ID 366816761, webhook `https://hooks.zapier.com/hooks/catch/27395227/4bruass/`.

---

## Ms. Humphrey — universal read-aloud (the moat)

Ms. Humphrey reads **every educational interaction aloud**. This is the core competitive moat — she is "a teacher with memory who narrates everything," not a quiz grader. If you add a new feature, wire `NS.Humphrey.say()` for question/instruction narration.

### Read-aloud coverage (as of v86, fully complete with manual fallback)

| Surface | Status | Wired in |
|---|---|---|
| Number Lab (math) | ✅ | v74 — reads every problem |
| Cauldron Café (math) | ✅ | v74 |
| Diner Lanes (Explorer's Hall) | ✅ | v74 |
| Discovery Dome (science) | ✅ | v73 — speaks fact + question |
| Word Tower (reading) | ✅ | pre-existing — reading IS the activity |
| Story Time (listener) | ✅ | pre-existing + VAD tuning |
| Story Lab (writing) | ✅ | pre-existing |
| Review page (Friday quiz + daily SRS) | ✅ | **v84** (auto) + **v86** (manual Listen button) |
| Today's Mission step taps | ✅ | **v85** |
| Quest tile / overlay | ✅ | **v85** |
| Home mic-tap briefing | ✅ | v80 |
| Hero Hall (character unlocks) | ✅ | event-driven speech (no reading content) |

### Auto-fire vs. manual fallback principle (lesson from v86)

PWA autoplay-policy will block the **first** speech call on a fresh page if no in-session user gesture has happened. On the Galaxy Tab, that means Q1 of the Friday quiz wouldn't auto-read after navigating from home. **Every educational surface must have a manual fallback** — a visible, kid-discoverable button that:
1. Re-reads the current content on demand
2. Acts as the audio-unlock gesture for subsequent auto-fires

For the review page, that's the v86 "🔊 Hear it again" button. For any new zone, follow the same pattern.

### Speech pattern

Standard call:
```js
var H = (window.HeroAcademy && window.HeroAcademy.Humphrey) || null;
if (H && typeof H.say === 'function' && (!H.isMuted || !H.isMuted())) {
  try {
    H.say('event_name_snake_case', {
      text: 'Spoken text here.',
      expression: 'encouraging',   // or 'idle', 'concerned', 'surprised', 'cheering'
      priority: 'high',            // optional; interrupts any in-flight speech
    });
  } catch (e) { /* never break UI for narration */ }
}
```

Always wrap in try/catch. Always respect `isMuted()`. Always use `priority: 'high'` for content that should interrupt reactions (e.g., next question after "Yes!" feedback).

### Read-aloud philosophy

For multiple-choice items, read the **question + all choices**: `"Reading question. Which word has the 'ch' sound at the beginning? Your choices are: ship, chip, this, or dish."` — Nigel is 7 and many quiz items use vocabulary above his read-on-his-own level. He listens, then taps.

For step/tile taps that navigate, fire speech THEN delay navigation by ~550ms so the first words can start playing before the page unloads. The destination page's own Humphrey welcome picks up on arrival.

For overlays that open without navigation (quest tile), speak the content the moment the overlay slides in. Don't make Nigel read it himself first.

---

## Current architecture snapshot

### Zones (all live)

| Zone | File | Purpose |
|---|---|---|
| Cauldron Café | `cauldron-cafe.html` | Number Lab / Math — Phaser game |
| Diner Lanes | `diner-lanes.html` | Explorer's Hall — Phaser bowling math |
| Story Lab | `story-lab.html` | Writing — fill-in-the-blank stories |
| Discovery Dome | `discovery.html` | Science — fact cards + MCQ |
| Word Tower | `word-tower.html` | Reading — words + sentences |
| Story Time | `story-time.html` | Read-along with Humphrey |
| Hero Hall | `hero-hall.html` | Trophy room — Surprise Squad characters |
| Review | `review.html?mode=friday|<empty>` | Daily SRS + weekly Friday quiz |
| Parent | `parent.html#josh\|#bianca` | Parent dashboard |

**Placeholder zones still pending build:** Sound Stage, Training Gym, Creation Studio.

### Daily journey (the "not a buffet" arc)

The home page's **Today's Mission card** (`js/today-mission.js`) is the central daily flow. v80 shipped a 72-min fixed 7-step plan:

1. Warmup (5 min)
2. Math (15 min, bumps to 22 on Tue/Thu homework days)
3. Reading (15 min)
4. Writing (10 min)
5. Science (10 min)
6. Social Studies (10 min)
7. Win (celebration / Hero Hall)

The Mission generator (`api/mission/today.js`) calls Haiku to fill ONLY titles + blurbs per step, themed to Nigel's recent activity + parent directives. Server caches per `(child, date)`. Cache key `ha_mission_v2_*`. Parent `skip_zone_today` directives drop steps.

Each step tile is tappable. v85: tap fires `H.say('mission_step_tap', { text: title + blurb })` then navigates after 550ms. Zone's own Humphrey welcome picks up on arrival.

### Friday quiz (the weekly proof-of-learning, v82 redesign)

**Lifetime no-repeat, freshly curated by Haiku each week, themed to Nigel's actual zone activity.** See "Recent ships → v82" for full design.

Endpoint: `POST /api/quiz/friday/items { child_id }` → returns 10 items, 2 per subject, shape matches the older `ha_get_friday_quiz_items` RPC so `js/srs.js` consumes it seamlessly.

Behavior: checks cache first (per ISO week) → if empty, reads `ha_get_weekly_activity_summary` + `ha_get_quiz_seen_hashes` → calls Haiku with the activity summary as themes AND the past-question text as "NEVER REPEAT" instruction → validates 2-per-subject → falls back to `ha_quiz_bank` per subject if Haiku is short → persists each item via `ha_insert_weekly_quiz_item` (which also hashes the question into `ha_quiz_seen` for lifetime no-repeat).

Server-side fields:
- `ha_weekly_quiz_items` — cache (child_id, week_start_date, item_index)
- `ha_quiz_seen` — SHA256 hash of every question ever shown to a child
- RPC `ha_get_weekly_activity_summary(child_id)` — assembles zones, math skills, reading words, science cards, writing themes, social quests for last 7 days
- RPC `ha_get_weekly_quiz(child_id, week_start)` — returns cached items in `srs.js` row shape
- RPC `ha_get_quiz_seen_hashes(child_id, limit)` — fed to Haiku as no-repeat list
- RPC `ha_insert_weekly_quiz_item(...)` — service-role only, atomic insert + hash record

### Parent dashboard (`parent.html`)

Hash gate: `#josh` or `#bianca` reveals the dashboard. Any other URL hits the gate.

v83: Home page "For parents" link now goes to `parent.html#josh` (it's Josh's device). Bianca uses her email link with `#bianca`. The gate page itself has parent-picker buttons ("I'm Josh" / "I'm Bianca") as defensive UX for anyone landing on bare `parent.html`.

v83: `.parent-overlay[hidden] { display: none !important; }` rule fixes the pre-existing CSS bug where the directive composer overlay would bleed through every other page state.

Cards on the dashboard:
- **Today at a glance** (v80) — daily mission status, per-subject minutes
- **This week's activity** (v80) — daily roll-up with per-subject minute bars
- **Daily missions** — calendar grid of completed days
- **Quest stories** — quest history
- **Active notes for Ms. Humphrey** — directive list + composer (Send a note button)

Active directives (parent-issued):
- `skip_zone_today { zone_id }` — drops a mission step
- `focus_more_on { skill_id }` — biases SRS toward a skill
- Note for Ms. Humphrey — surfaced in cron emails + future Humphrey context

### Surprise Squad characters

`js/characters.js` loaded with: Captain Carlo, Aurora the Aviator, Shellback Squad, Webly Quickfoot, Toybox Team. Trophy room in Hero Hall surfaces them on unlock. **Story arc / Hero level progression is loaded but unwired** — identified as a high-priority moat feature for the journey arc.

### Ms. Humphrey assets

- ElevenLabs Emory voice `aNGh7D6DrhhIlad2U6Fg` (flash model)
- 5 expressions live (idle, encouraging, concerned, surprised, cheering) at 512×512
- 200ms crossfade between expressions
- BASE portrait = MJ Variant 1 (leftmost, May 30 2026 job `5332b3e9`) — use as `--cref` for remaining variants
- 6th expression `idle/smile` still pending
- Portraits at 128/256/512/1024 px in WebP+PNG
- VAD on Story Time listener: 2.5s min recording, 1.5s silence threshold at RMS 0.018

---

## Recent ships log (this session)

### v80 — 72-min all-subjects mission + mic-tap briefing + parent daily report
Commit: `feat: 72-min all-subjects mission + mic-tap home briefing + parent daily report (SW v80)`

- Fixed 7-step daily plan (warmup/math/reading/writing/science/social/win)
- Haiku writes titles + blurbs ONLY; Math bumps to 22 min on Tue/Thu homework days
- Parent `skip_zone_today` directives drop steps
- Mic-tap home briefing — first tap = full briefing (greeting + yesterday recap + 5-subject preview); subsequent taps = "what's next" pep. QnA stays inside zones, NOT on home.
- Parent dashboard "Today at a glance" + weekly subject roll-up with per-subject minute bars

Files: `api/mission/today.js`, `js/today-mission.js`, `js/humphrey-qna.js`, `css/today-mission.css`, `parent.html`, `js/parent.js`, `css/parent.css`, `sw.js`. Client packs `all_steps` array into `p_warmup.all_steps` for DB persistence (no schema migration).

Migration: `v80_parent_dashboard_surface_all_steps` — `ha_parent_dashboard` RPC was stripping `all_steps`; this migration adds it to the warmup planned-entry projection.

### v81 — static Friday quiz bank + parents link
Commit: `feat: cross-subject Friday quiz (ha_quiz_bank) + parents link on home (SW v81)`

- Created `ha_quiz_bank` table (50 grade-2 questions, 10 per subject, CCSS/MD-MCCRS tagged)
- Rewrote `ha_get_friday_quiz_items` RPC for balanced 2-per-subject × 5 = 10 questions
- Added discreet "👨‍👩‍👧 For parents →" link in home footer

**Superseded by v82.** ha_quiz_bank is now fallback-only, not the primary path.

### v82 — Friday quiz becomes Haiku-generated weekly + lifetime no-repeat
Commit message intended: `feat: Friday quiz becomes Haiku-generated weekly + lifetime no-repeat (SW v82)`
**Cache name bump missed in this bundle** — sw.js stayed at v81. v83 jumps to v83 to compensate.

New tables:
- `ha_weekly_quiz_items` — cache per (child, ISO week, item_index 0–9)
- `ha_quiz_seen` — SHA256 hashes for lifetime no-repeat

New RPCs:
- `ha_iso_week_start(date)` — Monday of containing ISO week
- `ha_get_weekly_activity_summary(child_id)` — week's zones, math skills, reading words, science cards, writing themes, social quests
- `ha_get_weekly_quiz(child_id, week_start)` — cached items in `srs.js` row shape
- `ha_get_quiz_seen_hashes(child_id, limit)` — no-repeat list for Haiku
- `ha_insert_weekly_quiz_item(...)` — service_role only, atomic insert + hash record

New endpoint `api/quiz/friday/items.js` (341 lines):
- Checks `ha_get_weekly_quiz` cache → reads activity summary → reads seen hashes → calls Haiku with strict 2-per-subject schema + "NEVER REPEAT" rule with actual past questions in prompt → validates → falls back to `ha_quiz_bank` per subject if Haiku is short → persists via `ha_insert_weekly_quiz_item` (auto-hashes into `ha_quiz_seen`)
- Token cost: ~1.5k in + 1.5k out per generation, cached per week

Client updates:
- `js/srs.js` — `loadFridayQuiz()` now POSTs `/api/quiz/friday/items` instead of calling the RPC. `normalizeItem` recognizes `ha_weekly_quiz_items` source_table (identical payload shape to `ha_quiz_bank`).
- `js/review-page.js` — `zoneKey()` handles new source_table for the Friday results breakdown.

Migrations:
- `v82_weekly_quiz_tables`
- `v82_weekly_quiz_rpcs`
- `v82_activity_summary_correct_columns` (fixed column refs — `ha_sessions.zone_id` not `zone`, `ha_math_problems.skill_id` not `topic`)

Live-UI verified end-to-end on this session — all 10 questions Haiku-generated and themed correctly to Nigel's Jun 1-5 activity (digraphs ch/sh, make_10 + subtract_within_10 math, "spider weaves silk" writing theme matching Story Lab work, spider silk + hail science cards, counting + show-and-tell social quests).

### v83 — parent overlay fix + gate picker + home link → #josh
Commit: `fix: parent overlay [hidden] respect + gate picker buttons + home link goes to #josh (SW v83)`

Three fixes in one bundle:
1. **CSS regression** — `.parent-overlay[hidden] { display: none !important }` added. Pre-existing bug where `.parent-overlay { display: grid }` overrode the `[hidden]` attribute, causing the Send-a-note composer to bleed through every page state. Only exposed by the new home → parent.html route.
2. **Home `For parents` link** — now `parent.html#josh` directly. Lands on dashboard instantly. Bianca's email link still uses `#bianca`.
3. **Gate as picker** — `parent.html` no-hash route now shows two buttons (👨 I'm Josh / 👩 I'm Bianca). Tap → sets hash → boots dashboard.
4. SW v81 → v83 (skipping v82 to compensate for the missed bump).

### v84 — Ms. Humphrey reads every quiz question aloud
Commit: `feat: Ms. Humphrey reads every Friday-quiz/SRS question + choices aloud (SW v84)`

Problem: `review.html` rendered questions visually but Humphrey never spoke them. Reactions ("Yes!"/"Almost") worked, but the question itself was silent — a fundamental gap for a 7-year-old.

Fix: `js/review-page.js` `renderCurrent()` now calls `speakItem(item, row)` which:
- Strips the leading emoji + visual "Reading — " prefix from question text
- Prepends a spoken subject intro: "Reading question. " / "Math question. " / "Writing question. " / "Science question. " / "Social studies question. "
- Reads the choices: "Your choices are: ship, chip, this, or dish." (skips for Word Tower `kind:'word'` self-report items)
- Uses `priority: 'high'` so the new question interrupts the lingering "Yes!"/"Almost" reaction for clean transitions
- Bails on `NS.Humphrey.isMuted()`
- Wrapped in try/catch — never breaks the UI

Live-UI verified: 9 `review-question` events captured walking all 10 Friday quiz items + 7 `review-wrong` + 3 `review-correct` + 1 `review-done` = 20 total `say()` calls. All subject intros and choice-list grammar correct.

### v85 — Mission step taps + quest tile overlay open
Commit: `feat: Humphrey reads mission step on tap + quest text on overlay open (SW v85)`

**Today's Mission step taps** (`js/today-mission.js`):
- Tap fires `H.say('mission_step_tap', { text: title + '. ' + blurb, priority: 'high' })`
- Title's leading emoji stripped before speech
- 550ms `setTimeout` before `window.location.href = url` so the first words can start playing before page unload

**Quest tile** (`js/quests.js`):
- `openOverlay()` speaks `'I have a quest for you, Nigel. ' + quest.text + ' Tap Start when you are ready.'` as the overlay slides in. Previously Humphrey only spoke after Start, which meant Nigel had to read the quest himself first.
- `startTimer()` simplified to `'Off you go! I will wait right here. Come back when you are ready.'` — no longer repeats the quest text.

Live-UI verified: `mission_step_tap` captured for Story Lab tap with text "Story Lab. Write about your favorite adventure — use your best words and sentences." Quest tile tap on home produced `quest_intro` with full quest text; Start tap produced `quest_start` with "Off you go!" only.

### v86 — always-visible "Hear it again" Listen button on review page
Commit: `feat: always-visible 🔊 Hear it again button on review page (SW v86)`

Problem: Josh tested v85 on the actual Galaxy Tab and reported the Friday quiz still wasn't reading aloud. v84's `speakItem()` auto-fire was being blocked by PWA autoplay-policy on Q1 (no in-session user gesture since navigation), and there was no manual fallback — Nigel had no obvious way to trigger speech.

Fix: A prominent, always-visible "🔊 Hear it again" button on `review.html` between the question/help and the choices.

Files:
- `review.html` — new `<button id="reviewListenBtn">` with 🔊 icon + "Hear it again" label
- `js/review-page.js` — `state.currentItem` + `state.currentRow` tracked in `renderCurrent`; init wires the button to call `speakItem(state.currentItem, state.currentRow)`
- `css/review.css` — new `.review-listen-btn` styling (magenta gradient, 52px+ min-height, large tap target)
- `sw.js` — v85 → v86

Behavior:
- Button is **always visible** on every question, every render (no hidden state)
- 54px × 177px on desktop — tablet-friendly tap target
- Tap → calls `speakItem` with the current item, fires `review-question` event with full text + choices, priority `high`
- First tap also serves as audio-unlock gesture — subsequent Q2-Q10 auto-fires play correctly
- Works mid-quiz at any item index

Live-UI verified on the desktop browser:
- Button renders at 54×177 px, magenta gradient, text "🔊 Hear it again"
- Tap on Q1 → captured `review-question` say with full text + choices
- Advance to Q2 → auto-fire works (audio now unlocked)
- Tap button on Q2 → re-reads Q2

Still pending: Galaxy Tab acceptance test on actual tablet (needs PWA cold-launch to pick up v86 SW).

---

## DB schema additions (this session)

```
ha_weekly_quiz_items (v82)
  id              uuid PK
  child_id        uuid FK → ha_children
  week_start_date date  (Monday of ISO week)
  item_index      int   (0-9, UNIQUE per child + week)
  subject         text  (reading/math/writing/science/social)
  question        text
  question_hash   text  (SHA256 of normalized question)
  choices         jsonb
  answer          text
  help_text       text
  theme           text  (descriptive, e.g. 'ch_digraph', 'spider_silk_strength')
  generated_by    text  ('haiku' or 'bank')
  created_at      timestamptz
  RLS: enabled, no anon policies; service_role + SECURITY DEFINER only

ha_quiz_seen (v82)
  id            uuid PK
  child_id      uuid FK
  question_hash text  (UNIQUE per child)
  question      text  (kept for debugging)
  subject       text
  source_table  text
  first_seen_at timestamptz
  RLS: enabled, no anon policies

ha_quiz_bank (v81 — now fallback-only)
  id, subject, question, choices, answer, help_text, ccss, mccrs, active
  50 grade-2 questions seeded, 10 per subject
```

New RPCs (all SECURITY DEFINER):
- `ha_iso_week_start(date) → date`
- `ha_get_weekly_activity_summary(child_id) → jsonb` (anon|authenticated|service_role)
- `ha_get_weekly_quiz(child_id, week_start) → table` (anon|authenticated|service_role)
- `ha_get_quiz_seen_hashes(child_id, limit) → table` (anon|authenticated|service_role)
- `ha_insert_weekly_quiz_item(...) → uuid` (**service_role only**)

---

## On the horizon (prioritized)

### 🔴 Top priority

1. **Galaxy Tab acceptance pass** — now deferred 5×. Cover EVERY v80–v85 feature on the actual Android tablet:
   - Mic-tap home briefing (audio quality, VAD if applicable)
   - Mission step tap → audio survives navigation?
   - Friday quiz audio narration (Q1 may have autoplay-policy issue if no prior gesture in session)
   - Quest tile → overlay opens → quest_intro speech plays?
   - Camera quest (snap + send) end-to-end
   - Parent dashboard via new home `For parents` link

2. **Update Saturday email prompt v2** — empty-data weeks should read as "Nigel didn't open the app this week" rather than "missed a scheduled session". The Sat Jun 7 cron will fire whether or not this lands.

3. **Soft PIN on `parent.html`** — close the soft-security gap from v83. Nigel could tap "I'm Josh" on the gate. A 4-digit PIN (not auto-fill, not in localStorage) would lock down the dashboard properly.

### 🟡 Medium priority

4. **Story arc / Hero level progression** — Surprise Squad infrastructure is loaded but unwired. This is the highest-leverage feature for turning the buffet into a journey.

5. **Build #8 observability**:
   - 8.2 — Saturday cron retries on transient failure
   - 8.3 — Client error capture (track JS errors into Supabase for diagnosis)

6. **Build #6 v3** — base-10 blocks manipulative for `place_value` + 2-digit ops in Number Lab.

7. **Ms. Humphrey 6th expression** — `idle/smile` variant. Use MJ BASE portrait Variant 1 as `--cref`.

8. **Remaining placeholder zones** — Sound Stage, Training Gym, Creation Studio.

### 🟢 Lower priority / nice-to-haves

9. **VAD tuning validation on Story Time** — confirm `minRecordMs`, `silenceEndMs`, `rmsThreshold` calibrated against a real Galaxy Tab session.
10. **Parent co-pilot for Bianca** — Bianca-specific dashboard view.
11. **More prominent Ms. Humphrey portrait on review page** — currently just the bottom-left corner avatar; consider showing her face above the question card so she feels present in the lesson, not just available via QnA.
12. **Audit ALL other zones for manual-fallback Listen buttons** — they have auto-fire wired but may suffer the same Q1 autoplay-block on PWA cold-load. Pattern: copy the v86 button + handler into each zone.

---

## Verification discipline (do not skip)

**The mantra:** code shipped is not feature shipped. After every deploy:

1. Confirm Vercel deploy reaches `state: READY` with matching commit SHA via `list_deployments` (projectId `hero-academy`, teamId `jemelike-6356s-projects`).
2. **Drive the actual UI in Chrome MCP.** Tap the thing a user would tap. Capture the resulting state. Read the DB row that was supposed to be written. Don't just confirm "the API responded 200."
3. For Humphrey speech features: install a `say()` interceptor on `window.HeroAcademy.Humphrey.say` and capture every utterance. Confirm `event`, `text`, and `priority` per item.
4. For Phaser games: **cannot be verified via Chrome MCP screenshots** — the hidden tab throttles `requestAnimationFrame` to zero, freezing the game loop. Galaxy Tab is the only path.
5. For features that navigate (mission step tap), capture state IMMEDIATELY after click within ~80ms — the 550ms `setTimeout` for nav hasn't fired yet. Then re-navigate fresh for the next test.

Three production-shipped-but-broken bugs were caught by this discipline in earlier sessions. Don't bypass it.

---

## Approach & patterns

### Working mode
Claude acts autonomously — handles all code authoring, browser automation, and config. Hand Josh only the 1–2 steps requiring account credentials or sensitive data. Multi-step instructions asking Josh to do things already done cause friction. Keep handoffs minimal and precise.

### Deploy workflow
```bash
scp ~/Downloads/<bundle>.tar.gz root@2.24.68.106:/tmp/ && ssh root@2.24.68.106 'cd /tmp/hero-deploy && git fetch origin main -q && git reset --hard origin/main -q && tar xzf /tmp/<bundle>.tar.gz && git add -A && git commit -m "<message>" && git push'
```
Single one-liner from Josh's Mac. Vercel auto-deploys from main.

### Session handoff
This file (`.claude/HANDOFF.md` on main) is the canonical truth source. Read it before any work. Update it at the end of every session — or when an upcoming session is expected to need different context.

### File patching
Python string replacement (`s.replace(old, new, 1)`) preferred over `sed` for multi-line or unicode-containing strings. Always verify with `grep -n` immediately after.

### SQL-only changes
DB migrations and RPC updates go via Supabase MCP `apply_migration`. No SCP needed. Verify with a `SELECT` immediately after.

### Bundle scope
Each bundle ships ONE coherent feature or fix set. Keep them small (5–25 KB typical). Always include sw.js with bumped CACHE_VERSION.

### Design decisions
Claude makes reasonable design calls without seeking approval on every detail. Josh corrects course directly when needed.

---

## Tools & resources

| | |
|---|---|
| Hosting | Vercel (auto-deploy from GitHub main) |
| VPS | Hostinger `srv1641066` (`2.24.68.106`) |
| Repo | `github.com/jemelike-lab/hero-academy` (team `jemelike-6356s-projects`) |
| Backend | Supabase `yofqeuguxgujgqnaejmw` |
| Voice | ElevenLabs Emory `aNGh7D6DrhhIlad2U6Fg` (flash model), agent `agent_5901kssbzjm1e0yvd0kdwxa3r49m` |
| AI for content | Anthropic Claude Haiku (Saturday email, daily mission, Friday quiz) |
| Automation | Zapier Zap 366816761, webhook `https://hooks.zapier.com/hooks/catch/27395227/4bruass/` |
| Game engine | Phaser 3.70 via CDN |
| Frontend stack | Vanilla HTML/CSS/JS, no framework, no build step |
| Namespace | `window.HeroAcademy` |
| Design tokens | `:root` in `css/style.css` — `--gold:#ffd147`, `--orange:#ff8b3d`, `--magenta:#ec4899`, `--cyan:#14b8d4`, `--font-display:Fredoka` |
| Browser automation | Claude in Chrome MCP — `browser_batch`, `javascript_tool`, `tabs_context_mcp` |

### Critical gotchas

- **SW cache version must be bumped on every deploy** and new files added to the `CORE` array. v82 shipped without bumping — confused state for a session.
- **Large file transfers (>5KB) must go via SCP from Mac**, not pasted into the VPS web terminal. Web terminal disconnects on large pastes.
- **Phaser games cannot be verified via Chrome MCP** — hidden-tab `requestAnimationFrame` throttling freezes them.
- **Dual-code curriculum content** to CCSS + MD MCCRS for homeschool compliance reporting (COMAR 13A.10.01.01).
- **Empty-data Saturday emails** need prompt-level handling — silence should be attributed to non-use, not missed sessions.
- **Vercel UI commit messages may not match what was shipped** — always verify via live API/file fetch, not the dashboard text.
- **Slate.js fields in Zapier**: use `+` button or `/` shortcut — do NOT type `{{` for autocomplete; clear with `End`+`Backspace` ×50.
- **Zap editor canvas requires tab to be focused/visible**; background tabs report 0×0 and all clicks silently fail.
- **VPS xterm input**: `document.execCommand('insertText')` + `keydown Enter` on `.xterm-helper-textarea` is the only reliable method; tab must be in foreground for output scraping.
- **GitHub raw URLs** (`raw.githubusercontent.com/jemelike-lab/hero-academy/main/[file]`) are accessible from Claude's bash environment for pulling current file contents.
- **Chat UI obfuscates `user@ip` strings** — always use shell variable (`VPS=2.24.68.106; ssh root@$VPS`) in code blocks.
- **`window.location.href` setter cannot be reliably overridden** for blocking navigation in tests. Capture state within ~80ms of triggering action instead.
- **CSS `[hidden]` attribute can be silently overridden** by any `display:` rule on the same selector without `!important`. Always pair custom display rules with `selector[hidden] { display: none !important; }`.
- **PWA autoplay-policy blocks first speech on a fresh page** if no in-session user gesture has occurred since navigation. Auto-fire `speakItem()` calls on Q1 of any new page may not play. The fix is always a visible manual fallback button (see v86 "Hear it again"). For any new educational zone, ship a manual fallback alongside any auto-fire.

---

## File map (key files only)

```
api/
  cron/saturday-email.js       — Vercel cron, runs Sat 12:00 UTC
  mission/today.js             — Daily mission generator (Haiku, cached per child+date)
  quiz/friday/items.js         — v82 Friday quiz endpoint (Haiku, weekly cache, lifetime no-repeat)
  humphrey/*                   — Ms. Humphrey TTS proxy + agent endpoints

js/
  characters.js                — Surprise Squad roster (Captain Carlo, Aurora, etc.)
  humphrey.js                  — Speech queue, audio unlock, expression crossfade
  humphrey-qna.js              — In-zone Q&A mode
  manipulatives.js             — Count-on-line + subtract-from-ten-line (v74)
  parent.js                    — Parent dashboard
  quests.js                    — Real-world quest tile + overlay (v85 speaks quest_intro on overlay open)
  review-page.js               — Daily SRS + Friday quiz UI (v84 speakItem auto-fire + v86 manual Listen button)
  srs.js                       — SRS engine + Friday quiz loader (v82 calls /api/quiz/friday/items)
  today-mission.js             — Today's Mission card on home (v85 mission_step_tap)

css/
  style.css                    — Design tokens + global styles
  parent.css                   — Parent dashboard (v83 .parent-overlay[hidden] fix)
  today-mission.css            — Mission card layout

parent.html                    — Parent dashboard (v83 gate picker)
index.html                     — Home page (v83 parents link → #josh)
review.html                    — Review/quiz container
sw.js                          — Service worker, CACHE_VERSION bumped per deploy

.claude/HANDOFF.md             — This file
```

---

## Open items checklist for next session

- [ ] **🔴 Galaxy Tab acceptance pass (6× deferred, blocking)** — touch EVERY v80–v86 feature on the actual Android tablet. After v86 the read-aloud should finally work reliably. Cold-launch the PWA first to get v86 SW.
- [ ] Saturday Jun 7 email arrives at noon UTC — read it; if empty data, polish prompt
- [ ] Update Saturday email prompt v2 (empty-week framing)
- [ ] Soft PIN on parent.html
- [ ] Story arc / Surprise Squad progression wiring
- [ ] Build #6 v3 — base-10 blocks
- [ ] Build #8.2 — cron retry on transient fail
- [ ] Build #8.3 — client error capture
- [ ] Ms. Humphrey 6th expression (idle/smile)
- [ ] Make Ms. Humphrey portrait more prominent on review page (currently just bottom-left corner; consider showing her face above the question card)
- [ ] Audit ALL other zones for Listen-button-equivalent manual fallbacks (Number Lab, Cauldron Café, etc. — they have auto-fire but may have the same Q1 autoplay issue on PWA cold-load)
- [ ] Remaining placeholder zones (Sound Stage, Training Gym, Creation Studio)

---

*End of handoff.*
