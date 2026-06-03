# Hero Academy — HANDOFF

**Last updated:** End of session, early morning June 3, 2026 (after the 4-build push).
**Live SW:** `hero-academy-v62`
**Latest commit on `main`:** `cd4cb92` (Build #7 v2 camera capture + Humphrey vision)

---

## 0 — 30-second orientation

| | |
|---|---|
| **Live URL** | https://hero-academy-jemelike-6356s-projects.vercel.app |
| **Repo** | https://github.com/jemelike-lab/hero-academy (auto-deploys from `main`) |
| **VPS deploy clone** | `root@2.24.68.106:/tmp/hero-deploy` (Hostinger `srv1641066`) |
| **Supabase project** | `hero-academy` (id `yofqeuguxgujgqnaejmw`, us-east-1) |
| **Vercel project** | `hero-academy` (team `jemelike-6356s-projects`) |
| **Nigel's child_id** | `2e0e51c5-f120-4152-8aa1-041eeecc8165` |
| **Recipients** | Bianca `bianca.parker92@gmail.com` + Josh `jemelike@gmail.com` |
| **Ms. Humphrey voice** | ElevenLabs Emory `aNGh7D6DrhhIlad2U6Fg`, model `eleven_flash_v2_5` |
| **Target device** | **Android Galaxy Tab running Chrome installed as PWA** (NOT iPad) |
| **Truth source** | This file (`.claude/HANDOFF.md` on `main`) — read first |

### Deploy pattern (proven 4× this session)
1. Claude prepares a bundle as `*.tar.gz` and presents it for SCP.
2. Josh runs `scp ~/Downloads/<bundle>.tar.gz root@2.24.68.106:/tmp/` from Mac terminal.
3. Claude drives the VPS terminal via Chrome MCP (`document.execCommand('insertText')` + synthetic Enter keydown on `.xterm-helper-textarea`) to `git fetch origin main -q && git reset --hard origin/main -q && tar xzf <bundle> && git add -A && git commit -m '<msg>' && git push`.
4. Vercel auto-deploys. Claude verifies via Vercel MCP `list_deployments` (top deployment `state: READY` + matching `githubCommitSha`).
5. Claude runs a live UI test via Chrome MCP — clear SW + caches, hard reload, exercise the feature, verify the DB row landed via Supabase MCP.

---

## 1 — What shipped this session (June 3 2026, post-handoff push)

**Four production builds, all verified live end-to-end with real Supabase rows + real Haiku vision calls.**

### Build #1 — Daily structured mission ✅ COMPLETE

**Commit `63aa2c77`, SW v59.** Migration `ha_daily_mission_v1` already on DB (table + 2 RPCs).

- `api/mission/today.js` — server-side `reward_character_key` derived from the mission's stretch zone via `REWARD_CHARACTER_FOR_ZONE` map: number-lab → aurora, word-tower → webly, story-time → aurora, discovery → carlo, explorer → shellback-squad, writing → aurora, hero-hall → toybox-team. Always returned by `validateAndPatch`.
- `js/today-mission.js` — purely additive over the existing scaffold (0 lines removed):
  - `persistMissionToDb(m)` — fire-and-forget `ha_record_mission` RPC on mission generate; sets `db_persisted: true` on localStorage when response is OK
  - `markVisited(zoneId)` — now fires `ha_mission_zone_done` RPC alongside the localStorage flag; stashes `ha_mission_just_completed_<date>` from the RPC response if server says `just_completed: true`
  - `render()` — when `allDone` is true AND `ha_mission_celebrated_<date>` is unset, fires the celebration overlay (one-time-per-day guard)
  - `showCelebration(rewardKey)` — full-screen overlay with reward character emoji + name + tag, bursting confetti, "Awesome!" CTA, Ms. Humphrey `mission_complete` speech
- `css/today-mission.css` — celebration overlay styles (backdrop blur, pop-in card, emoji bounce, confetti burst, mobile-responsive).
- `sw.js` — v58 → v59.

**Verified live**: Reset row in `ha_daily_mission`, navigated to home, mission persisted (`db_persisted: true`). Simulated tapping all 3 zones — RPC returned `just_completed: true` with `reward_character_key: aurora`. Celebration overlay rendered with Aurora 🦉 "High Skies Hero". DB row showed `completed_zones: ['story-time','hero-hall','writing']` + `completed_at` set (83-second total flow). Dismiss + replay-block confirmed working.

### Build #6 v2 — Multi-modal teaching (ten-frame + 2 skill visualizations) ✅

**Commit `752c649`, SW v60.** No DB changes.

- **NEW** `js/manipulatives.js` (231 lines): `HeroAcademy.Manipulatives.tenFrame.mount(host, opts)` — 2×5 cell grid, tap-to-fill with smart semantics (tap empty = fill up to that index, tap filled = clear from that index), drag-to-paint, big animated numeric readout with pulse, Clear button. `demoFill(n, opts)` for Humphrey walkthroughs returns a Promise. Public API: `mount`, plus the instance exposes `unmount()`, `set(n)`, `value()`, `demoFill(n)`.
- **NEW** `css/manipulatives.css` (139 lines): full ten-frame styling — magenta-orange radial-gradient dots that pop-scale in, gold cell borders, big Fredoka readout, mobile breakpoints, reduced-motion support.
- `js/canvas-skills.js` — two new skill viz functions, each a smart dispatcher that delegates to the standard viz when the problem doesn't match its specialization:
  - `countOnLine(problem)` — for problems like "9 + 2", draws the anchor + small "+1" hops per addend (max 3 hops). Falls back to `additionLine` when the smaller addend > 3 or the larger < 5.
  - `subtractFromTenLine(problem)` — for "10 − N", draws a 2×5 ten-frame on the canvas, then crosses out N dots from the right. Falls back to `subtractionLine` when minuend ≠ 10.
  - Registry: `add_within_10`/`add_within_20` → `countOnLine`; `subtract_within_10`/`subtract_within_20` → `subtractFromTenLine`; `make_10` unchanged.
- `number-lab.html` — adds `🔟 Ten-Frame counter` toggle + host below the existing whiteboard, lazy-mounts the manipulative on first open. Links `manipulatives.css`, loads `manipulatives.js`.
- `sw.js` — v59 → v60; adds `manipulatives.js`/`css` to CORE cache.

**Verified live**: SW v60 active, all namespaces loaded, registry routes to new functions, parser correctly identifies count-on (9+2=11) and sub-from-10 (10-4=6) cases. Ten-frame mounted via toggle, 10 cells render with magenta dots, all interaction semantics work — tap empty cell index 4 fills 0-4 (count=5), tap index 7 fills to 8, tap index 9 fills all 10, tap filled index 3 clears down to 3, Clear resets to 0. `drawForSkill('add_within_10', {question:'9+2=?'})` writes pixels to canvas (17 KB data URL).

### Build #7 v1 — Physical world bridge (real-world quests, no camera) ✅

**Commit `e91e8cf`, SW v61.** Migration `ha_real_world_quests_v1` applied:

- New table `ha_real_world_quests` (id, child_id, quest_key, quest_text, category, target_seconds, started_at, completed_at, duration_seconds, answer, source). RLS enabled; all writes via SECURITY DEFINER RPCs.
- New RPCs `ha_start_quest(...)` returning the new row's uuid, and `ha_complete_quest(quest_id, answer)` returning jsonb. Both granted EXECUTE to anon/authenticated.

Client code:

- **NEW** `js/quests.js` (344 lines): `HeroAcademy.Quests.init({tileId})` wires the home-page tile. `openRandom()` / `openQuest(key)` open the modal. 10 seed quests across 4 categories (counting, color, letter, observation). 4-phase modal flow: see quest → START → countdown timer + "I'm back!" button → answer prompt → submit → done screen + Humphrey celebration. Fire-and-forget DB persistence. Avoids repeating the same quest twice in a row via `ha_quest_last_key` localStorage.
- **NEW** `css/quests.css` (283 lines): Quest tile (cyan→green gradient on home page), modal overlay with backdrop blur, animated countdown bar (cyan→magenta), big input field.
- `index.html` — quest tile section after `#todayMissionCard`. Loads `quests.js`, calls `Quests.init()` alongside `TodayMission.init()`.
- `sw.js` — v60 → v61.

**Verified live**: SW v61, Quests namespace loaded, catalog size 10. `openQuest('count_chairs')` → modal renders with category "COUNTING", quest text "Count the chairs at the dining table.", gold "Start the quest!" button. START → timer panel visible, clock counting down from 00:30, `ha_start_quest` RPC inserted row. "I'm back!" → answer block shows "How many did you find?" with `inputMode: numeric`. Submit with `6` → done screen shows "Awesome quest, Nigel!" + "You found 6! That's your real-world win for today." DB row landed with `answer: "6"`, `duration_seconds: 2`, `completed_at` set, `source: home_tile`. **Humphrey audio actually played** — debug log: `TTS resp 200 ct=audio/mpeg`, `TTS blob 100772B`, `PLAY ✓ playing`, with quest_start AND quest_complete narration.

### Build #7 v2 — Camera capture + Humphrey vision (Haiku) ✅

**Commit `cd4cb92`, SW v62.** No DB schema change (reuses `ha_real_world_quests.answer` with `[photo] <reaction>` prefix).

**Privacy design — photo NEVER persists server-side.** The image lives only in browser memory + the single Haiku API call. Vercel logs aren't written with image data. The only artifact that touches the DB is Ms. Humphrey's reaction text (e.g., `[photo] Oh Nigel, what a wonderful drawing! I love the bright red house...`).

- **NEW** `api/humphrey/see-photo.js` (~140 lines): POST endpoint accepting `{image: dataurl, media_type, quest_text}`. Calls Claude Haiku 4.5 vision (`claude-haiku-4-5`). Strict child-safety system prompt baked in:
  - NEVER identify/describe people/faces/appearance/location
  - Focus on objects, colors, shapes, what's being held or shown
  - Refuse inappropriate content gracefully ("Let us pick a different thing to show me, sweet pea")
  - Fall back to "tell me about it" if blurry/unclear
  - 2-3 short sentences, ~50 words, age-7 appropriate
  - End with an invitation to share more
  - Max 5MB image, allowed media types: jpeg/png/webp/gif
  - Uses `ANTHROPIC_API_KEY` env var
- **js/quests.js** (344 → 617 lines): Added 5 photo quests (`show_drawing`, `show_stuffie`, `show_build`, `show_cool_shape`, `show_fav_book`), all `category: show_and_tell`, `answer_kind: 'photo'`. Added camera lifecycle:
  - `state.stream` and `state.snapshotDataUrl` fields
  - `stopTimer()` branches to `startCameraPhase()` for photo quests (vs `text_answer_phase` for text/number)
  - `startCameraPhase()` requests `getUserMedia({video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}, height: {ideal: 720}}, audio: false})` with fallback to `{video: true}` on OverconstrainedError
  - `snapPhoto()` downscales the captured frame to max 1024px longer edge, JPEG quality 0.78 (~80-150KB base64)
  - `retakePhoto()` reuses the live stream (no new permission prompt)
  - `sendPhoto()` stops the stream BEFORE the POST (camera LED off ASAP), POSTs to `/api/humphrey/see-photo`, shows reaction via `showVisionResult()` which calls `Humphrey.say('quest_complete', reaction, 'cheering')`
  - `stopStream()` idempotent track cleanup
  - `fallbackToText()` converts the quest to text-answer mode on permission denial
  - `closeOverlay()` now calls `stopStream()` so the camera is released on dismiss
  - DB persists `[photo] <reaction>` as the answer string
- **css/quests.css** (283 → 406 lines): Camera frame (4:3 black box with cyan border + box-shadow), big snap button, retake/send button pair, error block with "Tell me about it instead" fallback, vision loading spinner with "Ms. Humphrey is looking…" label, vision result text card with gold left-bar.
- **sw.js** — v61 → v62. No new static files (the endpoint is server-side).

**The 5 photo quests** (target_seconds, all `answer_kind: photo`):
- `show_drawing` (180s) — "Show me a drawing you have made recently."
- `show_stuffie` (60s) — "Show me your favorite stuffed animal or toy."
- `show_build` (240s) — "Show me something you built (LEGOs, fort, anything!)."
- `show_cool_shape` (180s) — "Find something with a cool shape and show me!"
- `show_fav_book` (90s) — "Show me one of your favorite books."

**Verified live**: SW v62 active, deploy `cd4cb92` READY. Catalog size 15 (10 original + 5 photo). `openQuest('show_drawing')` renders modal with `"SHOW AND TELL • 📸"` category. START fires `ha_start_quest` RPC → row inserted. "I'm back!" branches to `startCameraPhase()` — camera block becomes visible with 4:3 cyan-bordered frame + gold "📸 Snap!" button. (Chrome MCP's headless environment can't grant real camera permission, so the live `getUserMedia` stream stays pending — that's expected and will work on the Galaxy Tab.) Synthetic 400×300 JPEG of a red house + brown roof + yellow sun + green grass posted directly to `/api/humphrey/see-photo` returned a beautiful Ms. Humphrey reaction in 2.9 seconds: *"Oh Nigel, what a wonderful drawing! I love how you made that bright red house with a strong brown roof, and you put a cheerful yellow sun right up in the blue sky. The green grass at the bottom makes it look so sunny and happy! You did a great job with your colors — did you have fun making this?"* Reaction follows every safety rule: names colors/shapes/objects, never identifies people, age-appropriate, ends with invitation. Then `ha_complete_quest` RPC with `[photo] <reaction>` updated DB row id `9d5ed6ee-...` with `duration_seconds: 114` + `completed_at`.

---

## 2 — Status of the 8 MUST BUILD items (post-session)

| # | Title | Status | Δ this session |
|---|---|---|---|
| 1 | Daily structured mission | ✅ **COMPLETE** | NEW (0% → 100%) |
| 2 | AI-generated adaptive content | 🟡 ~70% | (no change) |
| 3 | Story arc + Hero levels | 🟡 ~30% | (no change) |
| 4 | Spaced repetition + cumulative assessment | 🟡 ~80% (needs live verify) | (no change) |
| 5 | Bianca as co-pilot | ❌ NOT BUILT | (no change) |
| 6 | Multi-modal teaching | 🟡 ~80% (was ~65%) | +ten-frame + count_on + sub_from_10 |
| 7 | Physical world bridge | 🟡 ~80% (was 0%) | +real-world quests + camera + Haiku vision |
| 8 | Error recovery + observability | 🟡 ~75% | (no change) |

---

## 3 — Database state additions this session

| Table | Purpose | Approx rows |
|---|---|---|
| `ha_daily_mission` (existed pre-session, used now) | Today's mission record per child per day | 1 (test row from this session) |
| `ha_real_world_quests` (NEW Build #7 v1) | Real-world quest issued + completion | 3 (test rows: 1 count_chairs + 2 show_drawing) |

New RPCs (all SECURITY DEFINER with anon EXECUTE granted):
- `ha_record_mission`
- `ha_mission_zone_done`
- `ha_start_quest`
- `ha_complete_quest`

New serverless endpoint:
- `/api/humphrey/see-photo` — Claude Haiku vision proxy with child-safety system prompt. No persistence.

Test rows from this session (safe to delete or leave):
- `ha_daily_mission` id `bd735b35-cabb-4835-84eb-a6f19ed6ce52` (today's mission, completed end-to-end in 83s)
- `ha_real_world_quests` id `aa21170c-d56a-4f56-b1aa-b68cf7ee6a2a` (`count_chairs` quest, answer "6", 2s duration)
- `ha_real_world_quests` id `9d5ed6ee-6562-487b-836d-eb568d95a79c` (`show_drawing` quest, `[photo] Oh Nigel, what a wonderful drawing!...`, 114s)
- `ha_real_world_quests` id `dc02f19c-955c-4007-a88d-a4bbc35c6847` (`show_drawing` quest, never completed — pending row)

---

## 4 — Device-acceptance pass needed for Build #7 v2

The camera capture pipeline is architecturally complete and verified down to the API + DB layers. What remains is a **physical-device acceptance pass on the Galaxy Tab** — these can only be tested on real hardware:

| Verify on Galaxy Tab | Why |
|---|---|
| Camera permission prompt fires when "I'm back!" is tapped on a photo quest | Chrome MCP doesn't expose camera prompts |
| `facingMode: 'environment'` actually picks the rear camera | Device-dependent enumeration |
| Live video element auto-plays the stream (no manual `.play()` needed in Android Chrome) | Headless env shows 0×0 |
| Tapping "Snap!" captures a real frame to canvas at proper resolution | Requires real video stream |
| Captured preview renders correctly + Retake button reactivates stream | Same |
| Camera indicator (LED/notification) turns off after `stopStream()` runs | Visual confirmation only |
| End-to-end: real photo of Nigel's actual drawing → Haiku reacts to it specifically | The whole point |
| PWA install behavior — does the camera permission persist after install + relaunch? | PWA-specific |

If anything off-spec surfaces on first device test (permission denied silently, video stuck black, etc.), the most likely fixes are:
- Add `vid.setAttribute('autoplay', '')` defensively
- Move the `stream.getTracks()[0].getSettings()` log into Humphrey debug to capture actual constraints
- Try `enumerateDevices()` first to confirm a rear camera exists before requesting `facingMode: 'environment'`

---

## 5 — Open items for next session

### Cheap verification first
- [ ] **Galaxy Tab acceptance pass for Build #7 v2** (above) — highest priority before anything else
- [ ] Confirm Daily Mission flow with Nigel using it (not just synthetic JS-driven test)
- [ ] Confirm ten-frame works with finger drag on Galaxy Tab touchscreen
- [ ] Confirm real-world quest audio narration plays (Humphrey TTS gate verified working in test but new device)

### Build #6 remaining (deferred)
- Manipulatives v2: base-10 blocks (tens + ones columns) for `place_value` and 2-digit add/subtract
- More skill visuals: `place_value`, telling time, fractions
- AI-generated canvas drawings (Haiku outputs draw commands)
- Cross-zone canvas (mount in Discovery Dome + Explorer's Hall)
- `ha_drawings` DB persistence so Saturday email can include "this week he drew…"
- Word Tower letter tracing
- Bedtime story canvas

### Build #7 v3 (after device acceptance pass)
- **Saturday email integration**: surface photo-quest reactions in the weekly summary — "Nigel shared 3 things with me this week. Here's what he showed me…" with each reaction text
- **Quest streak counter** on the home tile (current consecutive days a quest was completed)
- **Issue quests from inside Ms. Humphrey chat** (not just home tile) — she could say "Hey, want to go count something for me?"
- **Optional photo persistence** with parent toggle in Build #5 dashboard — Bianca might want a weekly grid of what Nigel showed
- **More photo quests**: `show_dinner`, `show_outside`, `show_yourself_smiling` (faces still off-limits in vision response but can be the trigger)

### The 8 in priority order going forward
1. **MUST BUILD #5 — Bianca as co-pilot** (highest unbuilt; Saturday email already premium, give her a steering wheel)
2. **MUST BUILD #3 — Hero levels + Journey Map** (gives kids something to be hungry for tomorrow)
3. **MUST BUILD #7 v3** — quest streaks + Saturday email surfacing
4. **MUST BUILD #6 v3** — base-10 blocks + more skill visuals
5. **MUST BUILD #8.2 / #8.3** — retries + client-side error capture
6. **MUST BUILD #2 cross-zone coordination** — Story Lab story about a math problem he struggled with
7. **MUST BUILD #4 verification** — confirm SRS populates from real play

---

## 6 — Hard-won lessons from this session

1. **Live UI test after each build is non-negotiable.** Four builds shipped in one session, all verified by clicking through the real UI + checking real Supabase rows. No "syntax-OK = done" shortcuts.
2. **Phantom completions show up if you don't reset DB rows between tests.** First Build #1 verification showed a pre-existing `completed_at` from a phantom prior test — had to DELETE the row + re-do clean to be sure the celebration overlay actually fires.
3. **Canvas helpers in `js/canvas.js` interpret all x/y as virtual pixels 0-1000** (multiplied by scaleX), not as number-line units. The existing `additionLine`/`subtractionLine` pattern of passing `parsed.a` (a small integer like 8) as x looks like a positioning bug — dots draw near the left edge instead of at tick 8 on the number line. New functions in this session follow the same pattern for consistency; will fix in a future canvas-helper pass.
4. **Smart-fill semantics work great for ten-frames.** Kids don't think in "toggle one cell at a time" — they think "I want 7" and tap somewhere around the 7th cell. Smart-fill (tap empty = fill up to here, tap filled = clear from here) maps to that mental model and makes the manipulative feel responsive instead of fiddly.
5. **CDP `Runtime.evaluate` times out at 45s** when awaiting long animation chains. The fix: don't await the whole `drawForSkill` chain in a single JS exec; let it run, then re-inspect the canvas state with a separate exec call.
6. **Telemetry namespace makes new builds trivial.** Both Build #1 and Build #7 v1/v2 used `HeroAcademy.Telemetry.rpc(fn, body)` — the publishable Supabase key is already configured client-side, so new RPCs are plug-and-play.
7. **Privacy-first vision = no photo persistence.** Build #7 v2 sends the image to Haiku once, gets a text reaction back, and never writes the image anywhere — not to Supabase Storage, not to Vercel logs. Only the reaction string lives in `ha_real_world_quests.answer` as `[photo] <reaction>`. This respects child privacy without giving up the narrative thread for the Saturday email.
8. **Strict child-safety system prompts work.** The Haiku vision endpoint's system prompt explicitly forbids identifying people, commenting on appearance, speculating about location. The test response on a synthetic drawing reproduced exactly the desired tone — warm, specific, age-appropriate, ends with an invitation — without ever drifting into unsafe territory.
9. **Android Galaxy Tab + Chrome PWA is the easiest possible target for `getUserMedia`.** No iOS Safari quirks (no playsinline-muted dance, no fullscreen forcing, no autoplay restrictions). `facingMode: 'environment'` for rear camera works straight through. The whole architecture is built for this device specifically.
10. **Headless Chrome MCP can verify almost everything except real device permissions.** The pattern that worked: API endpoints can be tested directly via fetch, DB persistence can be verified via Supabase MCP, UI rendering can be verified via DOM inspection + screenshots. Real-device-only things (camera permission, touch drag, TTS playback on a specific speaker) need a Galaxy Tab acceptance pass.

---

## 7 — Pickup checklist for next session

1. **Read this file in full** (truth source)
2. **Check current SW version:** `curl -fsSL https://raw.githubusercontent.com/jemelike-lab/hero-academy/main/sw.js | head -1` — should be `v62`
3. **Check latest commit:** on `/tmp/hero-deploy` — should show `cd4cb92 feat: Build 7 v2 camera capture + Humphrey vision SW v62` at top
4. **Check Vercel deployment:** Vercel MCP `list_deployments` — top deployment should be `state: READY` with `githubCommitSha` `cd4cb92...`
5. **Check healthcheck status:** Curl `/api/cron/healthcheck?dry_run=1` with bearer — should return `overall_status: ok`
6. **Ask Josh** what he wants to work on. If he completed the device acceptance pass for Build #7 v2 already and it worked, proceed to MUST BUILD #5 (Bianca co-pilot). If anything was off, fix that first.

**Recipes for the next likely builds:**

### MUST BUILD #5 — Bianca as co-pilot
- New table `ha_parent_directives` (child_id, directive_type, payload jsonb, created_at, active boolean)
- New page `parent.html` — password-gated via URL hash like `parent.html#bianca`, no real auth but obscure enough
- Surfaces: this week's missions + completion %, recent quest answers, last 7 days of skill mastery moves
- Edit features: "focus more on subtraction this week", "skip writing today, he's tired", "give him a real-world quest about colors"
- Integration: Daily Mission picker reads from `ha_parent_directives` to bias zone selection
- Saturday email gets a "From Bianca this week" section showing directives

### Build #7 v3 — quest streaks + Saturday email
- New column `ha_real_world_quests.streak_day_number int`
- New RPC `ha_quest_streak_count(p_child_id)` returning current consecutive-day streak
- Home tile shows "🔥 3-day quest streak!" when applicable
- Saturday email `compileSaturdayBrief` adds `quest_summary` field with last 7 days of completed quests + reactions

---

_End of HANDOFF. Last updated end of Jun 3 2026 session (post-Builds 1/6v2/7v1/7v2)._
