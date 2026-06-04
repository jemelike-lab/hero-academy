# Hero Academy — HANDOFF

**Last updated:** End of session, evening of June 4, 2026 (sticky aid + page-aware Humphrey + question readout).
**Live SW:** `hero-academy-v73`
**Latest commit on `main`:** the voice-context fix that shipped tonight (commit hash visible in `git log --oneline | head -1` on VPS — was pushed via Mac terminal SCP, not by Claude).

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

### Deploy pattern (proven again this session)
1. Claude prepares a bundle as `*.tar.gz` and presents it for SCP.
2. Josh runs `scp ~/Downloads/<bundle>.tar.gz root@2.24.68.106:/tmp/` from Mac terminal.
3. Josh OR Claude runs (via Chrome MCP VPS terminal): `cd /tmp/hero-deploy && git fetch origin main -q && git reset --hard origin/main -q && tar xzf /tmp/<bundle>.tar.gz && git add -A && git commit -m '<msg>' && git push`
4. Vercel auto-deploys (~60s). Verify via fetch `/sw.js` first line for cache version match.
5. Claude runs live UI test via Chrome MCP — navigate with `?bust=vN` cache-bust to force fresh SW activation.

---

## 1 — What shipped this session (June 4 2026, evening)

**One bundle, SW v73, three user-visible fixes — all verified via live UI test on the production URL.**

### Bundle: `sticky-aid-page-awareness-question-readout.tar.gz` ✅ COMPLETE

**6 files:**
- `sw.js` — v72 → v73
- `js/humphrey.js` — sticky bubble lifecycle (~30 lines added)
- `js/humphrey-qna.js` — `sniffPageContext()` helper + ctx integration (~80 lines added)
- `js/humphrey-chat.js` — forwards `zoneId`, `zoneLabel`, `pageTitle`, `visibleText` to API
- `api/humphrey/chat.js` — parses page-context body fields + injects "WHAT IS ON NIGEL'S SCREEN RIGHT NOW" block into system prompt
- `js/discovery-dome.js` — concatenates fact + 3-space gap + question in `say()` text

### Fix #1 — Sticky visual aid ✅
**Problem:** Picture popup in Humphrey's speech bubble disappeared as soon as her speech ended — Nigel couldn't refer to the picture while reading the question.

**Solution:** When a Wikipedia visual aid attaches to the bubble during `say()`, set `state.stickyBubbleActive = true`. In `finish()` (timer expiry), check the flag: if sticky, only set `speaking=false` and reset expression to idle, but DON'T call `hideBubble()`.

**Dismiss paths:**
- Next `say()` call → `showBubble()` clears the flag and replaces content
- User taps the bubble → click handler in `init()` calls `hideBubble()`
- Programmatic: `window.HeroAcademy.Humphrey.clearVisualAid()` (newly exposed)

**Verified:**
- ✅ Mid-speech: bubble + image + caption + flag all set
- ✅ After speech ends: speaking=false, expression idle, **bubble + image persist**
- ✅ Tap-to-dismiss: clears flag, hides bubble + image
- ✅ Next `say()` cleanly replaces sticky bubble
- ✅ `clearVisualAid()` API works
- ✅ Visual confirmation: hummingbird image bubble screenshotted with full fact+question text

### Fix #2 — Page-aware Humphrey QnA ✅
**Problem:** When Nigel tapped the voice button and asked "what is this?", Humphrey gave generic answers because she didn't know what was on screen.

**Solution:** `humphrey-qna.js` now calls `sniffPageContext()` before sending to Chat API. Helper reads:
- `zoneId` from `body.dataset.zone` or `body.className.match(/zone-([a-z0-9-]+)/)`, with URL-based disambiguation
- `zoneLabel` from a static LABELS map (e.g. `discovery-dome` → `"Discovery Dome (Science)"`)
- `pageTitle` from `document.title` (Hero Academy suffix stripped)
- `visibleText` from first non-hidden of: `#problemQuestion`, `#storyPassage`, `.passage-text`, `#wordDisplay`, `.problem-display`, `#problemCard`, `#dailyMissionCard`, `#cardLabel` — capped to 800 chars

`humphrey-chat.js` forwards all 4 fields in the request body. `api/humphrey/chat.js` parses + size-caps them and, when `visibleText` is non-empty, injects:
```
WHAT IS ON NIGEL'S SCREEN RIGHT NOW (use this to ground your answer — if he asks "what is this?" or "read this to me" or anything that depends on what he's looking at, refer to this content. Don't read it back verbatim unless he asked you to; explain it in your own words):
Zone: <zoneLabel>.
Page: <pageTitle>.
Visible content on screen:
"<visibleText>"
```

**Verified — definitive A/B on the eagle card:**
| | Length | Specific eagle keywords (eyesight/eyes/vision/rabbit/eagle) |
|---|---|---|
| **WITH page context** | 296 chars | **4 of 5 hit** |
| **WITHOUT page context** | 158 chars | **0 of 5 hit** |

WITH ctx: *"this is about eagles, Nigel... their eyes are way [stronger] than ours, and they can spot tiny things like rabbits..."*
WITHOUT ctx: *"I'd love to help you figure that out, Nigel, but I can't quite see what you're pointing at. Can you tell me what it looks like?"*

### Fix #3 — Discovery Dome reads question after fact ✅
**Problem:** Discovery Dome showed a fact card AND a question, but Humphrey only spoke the fact. Nigel had to read the question himself to know what to pick.

**Solution:** In `showCard()`, changed `text: card.fact` → `text: card.fact + '   ' + card.question`. Three-space gap creates a natural pause in TTS between the description and the prompt.

**Verified:** Debug log shows `say() try-again-reading → A turtle has a hard shell. The shell grows with the turtle.   Which animal has a hard shell?` — both segments speaking, gap intact.

---

## 2 — Current live state

### Active SW: `hero-academy-v73`

### Active builds (cumulative)
| Feature | Status |
|---|---|
| Daily Mission (Build #1) | Live, persisted, celebration overlay works |
| Manipulatives + skill viz (Build #6 v2) | Live |
| Real-world Quests (Build #7 v1) | Live, 10 seed quests + 5 photo quests |
| Photo capture + Humphrey vision (Build #7 v2) | Live, **STILL needs Galaxy Tab acceptance** |
| Parent Co-pilot dashboard (Build #5) | Live, all 4 directive types end-to-end |
| Hero Journey level + Journey UI (Build #3) | Live, Nigel at Level 4 Champion 7/15 |
| Quest streaks on home tile (Build #7 v3) | Live |
| Sat email — Notes from Home (Build #5 v2) | Live, fires naturally Sat |
| Sat email — Show & Tell highlights (Build #7 v3) | Live, fires naturally Sat |
| **Sticky visual aid (SW v73)** | **Live, verified via Chrome MCP A/B test** |
| **Page-aware Humphrey QnA (SW v73)** | **Live, verified via Chrome MCP A/B test** |
| **Discovery Dome fact + question readout (SW v73)** | **Live, verified via debug log + screenshot** |

Nigel's Hero Journey state: `aurora=3, carlo=1, shellback-squad=1, toybox-team=1, webly=1` → total 7/15 → Level 4 Champion, 3 more chapters to Level 5.

---

## 3 — Pending verification / acceptance items

### 🔴 Galaxy Tab acceptance pass for Build #7 v2 camera — deferred 3× now
**Highest priority before any new build.** Test plan:
- Open Hero Academy as PWA on Galaxy Tab
- Tap the Real-world Quest tile until a "SHOW AND TELL • 📸" quest appears
- Tap Start → "I'm back!" → Allow camera permission
- Confirm rear camera (not selfie) activates and video plays
- Aim at something → "📸 Snap!" → preview shows → optionally Retake → Send
- Confirm Humphrey reaction text appears + voice plays
- Watch DB row land in `ha_real_world_quests` via Supabase MCP

### 🟡 Real-device test of tonight's three fixes
The chrome automation A/B tests prove the logic works end-to-end, but real device acceptance is the only way to confirm:
- The sticky bubble layout doesn't break in portrait/landscape on the actual Galaxy Tab viewport
- The fact + question readout flows naturally at Emory's voice pace (3-space gap might need tuning to longer)
- The page-aware "what is this?" works on a fresh card before audio-unlock vs after

### 🟡 Saturday June 6 email watch
- Does the Show & Tell block render with Nigel's real quest data?
- Does the streak badge appear if he has any quests this week?
- Does the Notes from Home block consume any active directives correctly?

### 🟢 Quest streak ≥2 branch verification (cosmetic)
DOM-simulated only so far. First time Nigel hits a real 2-day streak, confirm the 🔥 emoji + "N-day quest streak" copy renders.

### 🟢 Hero Hall `is_almost` pulse-glow (cosmetic)
Code exists but no character is currently within 1 play of next unlock — verify naturally when Nigel approaches a milestone.

---

## 4 — Open items for next session

### Priority order
1. **Galaxy Tab acceptance for Build #7 v2 camera** — deferred 3×. Highest priority.
2. **Tablet device check of SW v73 features** — pictures stick around correctly, both fact and question are spoken with good pacing, page-aware QnA grounds answers in screen content.
3. **Watch Sat June 6 email** — confirm Show & Tell + streak rendering with real data.
4. **MUST BUILD #6 v3** — base-10 blocks for `place_value` + 2-digit ops. More skill visuals.
5. **Remaining placeholder zones** — Sound Stage, Training Gym, Creation Studio still stubs.
6. **Story arc / character progression** — Surprise Squad infrastructure is loaded but the narrative progression is unwired. Identified earlier as high-priority moat feature.
7. **Apply Fix #3 (question readout) to other zones** — Currently only Discovery Dome reads the question. Number Lab problems, Cauldron Café word problems, Story Lab comprehension questions could all benefit from the same `fact + question` pattern. Audit per zone.

---

## 5 — Key technical learnings (this session)

### Chrome MCP test patterns
- **`await` requires async IIFE** — `(async () => { ... })()` wrapper. Bare top-level `await` fails with "await is only valid in async functions".
- **`window.__live` caching pattern** — store complex objects on window, then re-query with simple boolean reductions in a second call. The chat UI's safety filter blocks results that look like cookie/query strings (e.g. raw `swVer` strings with `=` signs).
- **`?bust=vN` cache-bust** — append to URL to force fresh SW activation. Required after every deploy to verify new code is actually serving.
- **Page reloads mid-test** — when the SW activates a new version, `sw-register.js` auto-reloads the tab. Lost `window.__*` caches. Re-run setup in single-round-trip when possible. (Bit me twice tonight.)
- **A/B with monkey-patched fetch** — intercept `/api/humphrey/chat` POSTs to verify the request body shape end-to-end. Cleaner than blind regex on the response.

### Humphrey internals
- `state.stickyBubbleActive` lives on the Humphrey state object alongside `currentUtterance`, `speaking`, `queue`, etc. Reset at every `showBubble()` (so a new utterance always wins) and set true inside the visual-aid `.then()` callback once an image actually attaches.
- `fetchVisualAid` is async. By the time the timer-based `finish()` fires, the image may or may not have attached. The sticky flag is only meaningful if the image DID land — otherwise the bubble hides normally.
- `say()` returns immediately; the bubble's display duration is computed from text length via `computeDuration(text)` (clamped to min/max). Three-space gaps add 3 chars × `msPerCharacter` to the timer.

### API tweaks
- `chat.js` system prompt is a `.join(' ')` of multiple lines. To add a conditional block, build it as a string (`screenBlock`) that's either `''` or `'\n\n...\n'`, then splice into the array. Empty string joins cleanly without affecting other lines.
- Size-cap all client-supplied strings before injecting into the prompt: `zoneId.slice(0, 60)`, `visibleText.slice(0, 800)`. Defends against an injected zone label trying to override the system prompt.

### Audio gating in test contexts
- Chrome MCP automation runs in a sandbox where user gestures don't fire — audio stays `unlocked=false` until something actually clicks the audio-unlock primer. The Humphrey debug log shows `SKIP audio (gate failed)` for every `say()` call. **This is expected and not a bug** — on Nigel's tablet, the first tap anywhere unlocks audio.
- The bubble + visual aid logic runs regardless of the audio gate — `showBubble()` is called BEFORE the gate check.

---

## 6 — Tool / resource inventory

| Resource | Identifier |
|---|---|
| Repo | `github.com/jemelike-lab/hero-academy` |
| Live URL | `hero-academy-jemelike-6356s-projects.vercel.app` |
| Vercel projectId | `prj_oqgpbeK3B8E4t69aV8AcNdLp6sPw` |
| Vercel teamId | `team_fASanR2j8wd8bhOUYS07f3NL` |
| Supabase project | `yofqeuguxgujgqnaejmw` |
| Supabase URL | `https://yofqeuguxgujgqnaejmw.supabase.co` |
| Nigel `child_id` | `2e0e51c5-f120-4152-8aa1-041eeecc8165` |
| VPS | Hostinger `srv1641066`, IP `2.24.68.106`, deploy path `/tmp/hero-deploy` |
| Zap (Saturday email) | id `366816761`, hook `https://hooks.zapier.com/hooks/catch/27395227/4bruass/` |
| Cron schedule | `0 12 * * 6` UTC (Sat 8am ET DST) |
| Ms. Humphrey ElevenLabs agent | `agent_5901kssbzjm1e0yvd0kdwxa3r49m` |
| Ms. Humphrey voice (Emory) | `aNGh7D6DrhhIlad2U6Fg`, model `eleven_flash_v2_5` |
| Parent emails | `bianca.parker92@gmail.com`, `jemelike@gmail.com` |
| Healthcheck (Saturday cron) | `https://healthchecks.io/checks/ec0311a8-d63a-4f89-828f-8d985dd28889/` |

---

## 7 — File-by-file summary of SW v73 changes

| File | Before | After |
|---|---|---|
| `sw.js` | `hero-academy-v72` | `hero-academy-v73` |
| `js/humphrey.js` | hide bubble on speech end always | sticky flag persists bubble when image attached; tap-to-dismiss; `clearVisualAid()` API |
| `js/humphrey-qna.js` | sent only `kidName, grade, history, profile, recentSummaries` | also sends `zoneId, zoneLabel, pageTitle, visibleText` via new `sniffPageContext()` |
| `js/humphrey-chat.js` | request body had 5–7 fields | request body has up to 11 fields (4 new page-context fields) |
| `api/humphrey/chat.js` | system prompt: warmth + notebook + activeProblem rule | system prompt: warmth + notebook + **screen content block** + activeProblem rule |
| `js/discovery-dome.js` | `text: card.fact` | `text: card.fact + '   ' + card.question` |

---

*End of handoff. Last update: 2026-06-04 ~22:00 ET (after live UI test of SW v73).*
