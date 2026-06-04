# Hero Academy — HANDOFF

**Last updated:** End of session, late evening June 4, 2026 (after SW v74 — zone voice consistency push).
**Live SW:** `hero-academy-v74`
**Latest commit on `main`:** `ae5ec65` — `feat: Number Lab problem readout + Cauldron/Diner Humphrey voice (SW v74)`

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

### Deploy pattern (now proven 5×)
1. Claude prepares a bundle as `*.tar.gz` and presents it.
2. Josh runs `scp ~/Downloads/<bundle>.tar.gz root@2.24.68.106:/tmp/` from Mac terminal.
3. Josh OR Claude (via Chrome MCP VPS terminal) runs: `cd /tmp/hero-deploy && git fetch origin main -q && git reset --hard origin/main -q && tar xzf /tmp/<bundle>.tar.gz && git add -A && git commit -m '<msg>' && git push`
4. Vercel auto-deploys (~60s). **Verify SW version with cache-busted fetch** to the live URL or the VPS itself, NOT GitHub raw (which has a 5-min CDN cache that lies).
5. Claude runs live UI test via Chrome MCP — navigate with `?bust=vN` to force fresh SW activation.

---

## 1 — What shipped THIS session (June 4 2026, late evening)

**Two bundles tonight. Both verified live via Chrome MCP.**

### Bundle 1: `sticky-aid-page-awareness-question-readout.tar.gz` (SW v73) ✅

Three user-visible fixes from a screenshot of the Yangtze turtle card:

1. **Sticky visual aid** — `state.stickyBubbleActive` flag in `js/humphrey.js`. When a Wikipedia image attaches mid-`say()`, the bubble persists past speech end. Dismiss: next `say()`, bubble tap, or new `Humphrey.clearVisualAid()` API.

2. **Page-aware QnA** — `js/humphrey-qna.js` adds `sniffPageContext()` (zone from `body.className` + URL, visible text from a list of candidate containers). `js/humphrey-chat.js` forwards `zoneId`, `zoneLabel`, `pageTitle`, `visibleText`. `api/humphrey/chat.js` injects a "WHAT IS ON NIGEL'S SCREEN RIGHT NOW" block into the system prompt. **A/B proven:** 4-of-5 vs 0-of-5 eagle-content keywords with vs without context.

3. **Discovery Dome reads question after fact** — `js/discovery-dome.js` `showCard()` changed `text: card.fact` → `text: card.fact + '   ' + card.question`. Three-space gap creates a natural TTS pause.

### Bundle 2: `zone-voice-readout-fix.tar.gz` (SW v74) ✅

Audit of every zone revealed the "show on screen but don't read aloud" pattern from Discovery Dome bit two more zones, AND two Phaser zones were using browser system TTS instead of Emory.

1. **Number Lab now reads every problem** — `js/number-lab.js` `renderCurrentProblem()` adds a `Humphrey.say('try-again-reading', { text: question })` immediately after setting `problemQuestion.textContent`. Whitespace-collapsed for clean speech.

2. **Cauldron Café uses Humphrey's voice** — `cauldron-cafe.html` local `speak()` upgraded to prefer `window.HeroAcademy.Humphrey.say()` when loaded, falling back to `speechSynthesis`. All 4 existing call sites (`startLevel`, `winLevel`, `failLevel`, `winGame`) auto-upgrade.

3. **Diner Lanes uses Humphrey's voice** — same upgrade for `diner-lanes.html`. Closes the prior `TODO: swap for ElevenLabs TTS via Miss Humphrey (agent_5901kssbzjm1e0yvd0kdwxa3r49m)` comment.

**Live A/B evidence for v74 (from production logs):**

```
[Number Lab — after click on GOT IT]
19:05:04.420 say() try-again-reading → Nigel's soccer team scored 7 goals on Monday. They scored 6 goals on Wednesday. How many goals did they score in all?
19:05:04.441 TTS fetch "Nigel's soccer team scored 7 g"
19:05:05.303 TTS resp 200 ct=audio/mpeg
19:05:05.482 TTS blob 111639B
19:05:05.528 TTS play started ok

[Cauldron Café — on startLevel(0)]
19:05:56.400 say() try-again-reading → Wanda the Witch says: I want 3 carrots.

[Diner Lanes — on startLevel(0)]
19:06:59.653 say() try-again-reading → Mia from California wants 4 fish tacos.
```

**Bonus finding:** Number Lab problems are personalization-aware. The math word problem above ("Nigel's soccer team scored 7 goals") confirms Word-Tower-style profile-folding now reaches Number Lab generation too. Worth confirming where this lives and whether other zones get the same treatment.

---

## 2 — Current live state

### Active SW: `hero-academy-v74`

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
| Sticky visual aid (SW v73) | **Live, verified Chrome MCP A/B** |
| Page-aware Humphrey QnA (SW v73) | **Live, verified Chrome MCP A/B** |
| Discovery Dome fact + question readout (SW v73) | **Live, verified debug log + screenshot** |
| **Number Lab problem readout (SW v74)** | **Live, audio chain to Emory confirmed end-to-end** |
| **Cauldron Café Humphrey voice (SW v74)** | **Live, speak() delegation verified** |
| **Diner Lanes Humphrey voice (SW v74)** | **Live, speak() delegation verified, TODO resolved** |

Nigel's Hero Journey state: `aurora=3, carlo=1, shellback-squad=1, toybox-team=1, webly=1` → 7/15 → Level 4 Champion.

---

## 3 — Pending verification / acceptance items

### 🔴 Galaxy Tab acceptance pass for Build #7 v2 camera — DEFERRED 3× NOW
**Highest priority before any new build.** Test plan:
- Open Hero Academy as PWA on Galaxy Tab
- Tap Real-world Quest tile until "SHOW AND TELL • 📸" quest appears
- Start → "I'm back!" → Allow camera → confirm rear camera + video plays
- Snap → preview → Send → Humphrey reaction text + voice plays
- Watch DB row land in `ha_real_world_quests`

### 🔴 Galaxy Tab device check of SW v73 + v74 features
Chrome MCP A/B passes proved the logic, but real device acceptance is the only way to confirm:
- **Sticky bubble:** layout doesn't break portrait/landscape on Galaxy Tab viewport
- **Fact + question readout (Discovery Dome):** flows at natural Emory pace; 3-space gap may need tuning
- **Page-aware "what is this?":** works on a fresh card before audio-unlock vs after
- **Number Lab problem readout chatty-check:** with Humphrey reading every problem AND reacting to every answer, is the talking pace right? If too much, easy tune: gate on `session.problemsAttempted === 0` (first-of-skill only) or on question length > 15 chars (word problems only)
- **Cauldron/Diner Humphrey voice swap:** confirm Emory voice on order announce vs the prior robotic system TTS

### 🟡 Saturday June 7 email watch
- Show & Tell block renders with Nigel's real quest data
- Streak badge appears if he has any quests this week
- Notes from Home consumes any active parent directives

### 🟡 Personalization audit
This session surprised me — Number Lab is folding Nigel's family/friends/interests into word problems (saw "Nigel's soccer team scored 7 goals on Monday"). Worth confirming:
- Where exactly this happens (likely Haiku generator endpoint with profile context)
- That it's consistent across skills, not just one type
- That the rate is appropriate (Word Tower aims for ~30%)
- Whether Cauldron Café / Diner Lanes / Discovery Dome benefit from the same treatment

### 🟢 Quest streak ≥2 branch — cosmetic
DOM-simulated only. Verify naturally when Nigel hits a real 2-day streak.

### 🟢 Hero Hall `is_almost` pulse-glow — cosmetic
Code exists but no character within 1 play of next unlock yet.

---

## 4 — Open items for next session

### Priority order
1. **Galaxy Tab acceptance — Build #7 v2 camera + tonight's SW v73 + v74 features.** Deferred 3×; one device session covers acceptance for ALL the recent work. This is the bottleneck.
2. **Watch Sat June 7 email** — confirm Show & Tell + streak rendering with real data.
3. **Tune Number Lab readout chattiness if needed** — based on tablet test feedback. Heuristic flags ready: first-of-skill only OR word-problem-only.
4. **MUST BUILD #6 v3** — base-10 blocks for `place_value` + 2-digit ops. More skill visuals.
5. **Remaining placeholder zones** — Sound Stage, Training Gym, Creation Studio still stubs.
6. **Story arc / character progression** — Surprise Squad infrastructure loaded but narrative progression unwired. High-priority moat feature.
7. **Personalization audit** (see §3) — if Number Lab is folding in Nigel's profile, audit which other zones do and standardize.

---

## 5 — Key technical learnings (this session)

### GitHub raw CDN lies for ~5 minutes after push
`raw.githubusercontent.com/.../sw.js?cb=<ts>` returns a STALE cached file for up to `max-age=300` regardless of query string. To verify a deploy actually landed on `main`:
- Either check via the **VPS terminal** (`head -1 sw.js && git log --oneline -3` in `/tmp/hero-deploy`),
- OR fetch the **live Vercel URL** (`https://hero-academy-jemelike-6356s-projects.vercel.app/sw.js`) which uses Vercel's own cache (much fresher).
- DON'T trust GitHub raw for the first few minutes after a push. Bit me tonight — sent Josh on a false-alarm sw.js-bump fix.

### Bundle deploy gotcha
If Josh re-extracts an older bundle on top of a newer one (e.g. re-running an older SCP command), files unique to the older bundle revert while files unique to the newer bundle stay. Symptom tonight: `sw.js` went back to v73 while `number-lab.js`/`cauldron-cafe.html`/`diner-lanes.html` stayed at v74. Turned out to be the GitHub raw cache issue above, not actually a deploy problem, but worth noting because the failure mode IS possible if SCP commands get reused. **Fix pattern:** when in doubt, SSH the VPS, `head -1 sw.js`, and just `sed -i` + commit + push the version line directly if it's the only mismatch.

### Chrome MCP click affordances
`computer.left_click` with coordinates can miss buttons if the page repaints between screenshot and click. Two more reliable alternatives:
- `find` → returns a `ref_*`, then use it (but `click_element` is NOT a valid action name — that one threw an error tonight).
- `document.getElementById('btnId').click()` via `javascript_tool` — bulletproof, no coordinate issues. **Use this by default.**

### Number Lab is heavily minified
`js/number-lab.js` is one-line-per-function. To edit, find a unique short string anchor (e.g. `problemQuestion.textContent=session.currentProblem.question`) and replace with the same string + injected logic on one line. Always `node -c` syntax-check after.

### Phaser zones use a local `speak()` wrapper
Both Cauldron Café and Diner Lanes have an inline `speak()` function (system TTS) defined before the Phaser scene class. To make them use Humphrey, just upgrade the wrapper — keep all call sites intact, change the implementation to prefer Humphrey when loaded. Cleanest 1-spot fix.

### TTS audio gating in test contexts
Chrome MCP automation has `state.audioUnlocked === false` until a real user gesture. `speak gate: ... unlocked=false` followed by `SKIP audio (gate failed)` is **expected and not a bug** — the `Humphrey.say()` still routes correctly and the bubble still shows. Audio playback resumes after the first user click. Number Lab test caught this clearly: after my click on "GOT IT" (user gesture), the next say() showed `unlocked=true` → `TTS resp 200` → `TTS play started ok`.

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
| VPS | Hostinger `srv1641066`, `2.24.68.106`, `/tmp/hero-deploy` |
| Zap (Saturday email) | id `366816761`, hook `https://hooks.zapier.com/hooks/catch/27395227/4bruass/` |
| Cron schedule | `0 12 * * 6` UTC (Sat 8am ET DST) |
| Ms. Humphrey ElevenLabs agent | `agent_5901kssbzjm1e0yvd0kdwxa3r49m` |
| Ms. Humphrey voice (Emory) | `aNGh7D6DrhhIlad2U6Fg`, `eleven_flash_v2_5` |
| Parent emails | `bianca.parker92@gmail.com`, `jemelike@gmail.com` |
| Healthcheck (Saturday cron) | `https://healthchecks.io/checks/ec0311a8-d63a-4f89-828f-8d985dd28889/` |

---

## 7 — Cumulative file diff for SW v73 + v74

### SW v73 (sticky-aid + page-aware + Discovery Dome readout)
| File | Before | After |
|---|---|---|
| `sw.js` | `hero-academy-v72` | `hero-academy-v73` |
| `js/humphrey.js` | hide bubble on speech end always | sticky flag persists bubble when image attached; tap-to-dismiss; `clearVisualAid()` API |
| `js/humphrey-qna.js` | sent `kidName, grade, history, profile, recentSummaries` | also sends `zoneId, zoneLabel, pageTitle, visibleText` via `sniffPageContext()` |
| `js/humphrey-chat.js` | request body 5–7 fields | request body up to 11 fields |
| `api/humphrey/chat.js` | system prompt: warmth + notebook + activeProblem rule | also injects screen content block |
| `js/discovery-dome.js` | `text: card.fact` | `text: card.fact + '   ' + card.question` |

### SW v74 (zone voice consistency)
| File | Before | After |
|---|---|---|
| `sw.js` | `hero-academy-v73` | `hero-academy-v74` |
| `js/number-lab.js` | problem rendered silently | `Humphrey.say('try-again-reading', { text: question })` on render |
| `cauldron-cafe.html` | inline `speak()` → `speechSynthesis` | inline `speak()` → Humphrey if loaded, fallback to speechSynthesis |
| `diner-lanes.html` | inline `speak()` → `speechSynthesis` + TODO comment | inline `speak()` → Humphrey if loaded, TODO resolved |

---

*End of handoff. Last update: 2026-06-04 ~23:15 ET (after live UI test of SW v74).*
