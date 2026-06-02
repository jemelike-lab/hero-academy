# Hero Academy — Session Handoff

_Last updated: end of session June 2, 2026 — Lane F (script-tag-bug fix + live verification) at v47._
_Truth source for next-session Claude. Read this first before touching anything._

---

## 0. The 30-second orientation

**Who.** Josh is building **Hero Academy**, a homeschool PWA for his 7-year-old son Nigel (2nd grade, Maryland). Superhero-training-themed learning portal aligned to COMAR 13A.10.01.01 with dual-coded CCSS + MD MCCRS standards across all required subjects.

**Why.** Replace 2nd-grade homeschool curriculum with a single playable platform: AI-tutored, fully personalized, adaptively difficult, infinite content, progress reported weekly to parents.

**Where everything lives.**
- **Live app:** `hero-academy-jemelike-6356s-projects.vercel.app`
- **Repo:** `github.com/jemelike-lab/hero-academy` (auto-deploys from `main` to Vercel)
- **VPS:** Hostinger `srv1641066`, IP `2.24.68.106`, deploy clone at `/tmp/hero-deploy`
- **Supabase:** project `hero-academy` (`yofqeuguxgujgqnaejmw`, us-east-1)
- **Nigel's `child_id`:** `2e0e51c5-f120-4152-8aa1-041eeecc8165`
- **Current SW version:** `hero-academy-v47`
- **Latest commit on main:** `29632f4` ("fix: include characters.js in all 4 zone HTMLs; SW v47")

**Truth source for picking up where prior Claude left off:** this file (`.claude/HANDOFF.md` on `main`).

---

## 1. What's LIVE right now (v47) — end-to-end verified on real client

All 4 of Josh's success criteria are achieved AND each step of the pipeline was tested on the live production URL with `Characters.recordSessionComplete` actually firing and `ha_session_signals`/`ha_difficulty_state` rows actually being created from the live client (not just synthetic SQL):

1. **Infinite curriculum** — pool top-ups in all 4 zones, verified
2. **Always personalized** — Nigel's life folded into every zone's content (heavy in Number Lab + Story Lab; tasteful in Word Tower + Discovery Dome where pedagogy benefits)
3. **Never the same content twice** — hard guarantee via synchronous `warmupPool` blocking when unseen < 5
4. **Real-time difficulty adaptation** — single-session evaluator: 1 acing session bumps, 1 struggle session drops, Ms. Humphrey narrates the change at +3.5s

### 1.1 Adaptive content banks (Build #2)

Each zone has a per-child Supabase content bank refilled on demand by a Haiku 4.5 generator endpoint.

| Zone | Pool table | Mastery rule | Generator endpoint | MIN_UNSEEN / BATCH |
|---|---|---|---|---|
| Word Tower | `ha_word_tower_items` | 5 correct → mastered | `/api/humphrey/generate-word-tower-batch` | 30 / 25 |
| Number Lab | `ha_math_problems` | 5 correct → mastered | `/api/humphrey/generate-math-problems` | 30 / 25 |
| Discovery Dome | `ha_discovery_cards` | 5 correct → mastered | `/api/humphrey/generate-discovery-cards` | 30 / 20 |
| Story Lab | `ha_story_templates` | 3 completions → mastered | `/api/humphrey/generate-story-templates` | 15 / 12 |

All 4 generators:
- Read `data/nigel-profile.json` at cold-start
- Read child's current difficulty level via `ha_get_difficulty` RPC before drafting
- Pass `DIFFICULTY_BANDS[level]` description into the Haiku system prompt
- Instruct Haiku to fold Nigel's life into ~30% of items where natural
- Bulk-insert via service-role REST with `Prefer: return=representation`
- Stamp `difficulty: <level>` on every inserted row

Per-item RPC pattern (per zone): `ha_get_<zone>_<thing>`, `ha_mark_<zone>_attempt`, `ha_<zone>_pool_status`, `ha_recent_<zone>_struggles`. All anon-only via SECURITY DEFINER — no direct table access from client.

### 1.2 Pool warmup — hard "never twice" guarantee (Lane E)

`window.HeroAcademy.Telemetry.warmupPool({...})` is the cross-zone helper that prevents Nigel from ever seeing a repeated item due to a depleted pool.

Three-tier behavior on every zone entry:

| Unseen count | Behavior |
|---|---|
| ≥ 30 | No-op. Pool is healthy. |
| 5 ≤ unseen < 30 | Fire-and-forget top-up. Kid plays current items while pool refills. |
| < 5 | **Block.** Show Ralphie+spinner overlay after 1.2s delay, await generator, refill, proceed. |

Wired into:
- `number-lab.js` → inside `loadSkill(id)` (async)
- `discovery-dome.js` → inside `loadServerQueue()`
- `story-lab.js` → inside `loadServerTemplates()`
- `word-tower-reading.js` → inside `loadServerQueue(level)`

The overlay UI is installed lazily (one-time `<style>` injection on first use): Ralphie thinking pose + spinner + "Getting fresh problems just for you, Nigel..." text.

**Verified live**: forced trigger of warmup with `blockThreshold:999` produced the overlay (Ralphie image, spinner, correct text), generator completed in 3.2s, overlay removed cleanly.

### 1.3 Real-time difficulty adaptation (Lane D + E)

**Tables**

```sql
ha_difficulty_state (child_id, zone, current_level, last_eval_at, eval_count)
  -- one row per (child, zone). current_level ∈ {1, 2, 3, 4}. Default = 2.

ha_session_signals (id, child_id, zone, session_at, items_attempted,
                    items_correct_first_try, longest_streak, level_at_session)
  -- one row per completed session. Indexed on (child_id, zone, session_at desc).
```

**RPCs**

```
ha_get_difficulty(p_child_id, p_zone) → int
  Returns current_level or 2 if no row exists. Used by generators + clients.

ha_record_session_signal(p_child_id, p_zone, p_items_attempted,
                         p_items_correct_first_try, p_longest_streak)
  → TABLE(new_level int, change_direction text)
  Inserts the signal, evaluates PURE SINGLE-SESSION logic (no smoothing window):
    - aces (≥85% first-try AND streak ≥5)  → bump +1 (capped at 4)
    - struggles (<50% first-try)           → drop -1 (floored at 1)
    - mediocre                             → hold
    - Story Lab: accuracy ignored, advances every 5 completed stories
  Upserts ha_difficulty_state. Returns (new_level, direction='up'|'same'|'down').
```

**Generator-side**

Each generator reads `ha_get_difficulty` before drafting. Body param `target_difficulty` overrides for force-test scenarios. Stored `difficulty` on each inserted row reflects level at insert time.

**Client-side**

`js/characters.js → recordSessionComplete(zoneId, signal)` accepts a 2nd-arg signal object `{items_attempted, items_correct_first_try, longest_streak}`. If provided:
1. POSTs to `ha_record_session_signal`
2. Reads back `new_level` + `change_direction`
3. If direction !== 'same', schedules a Ms. Humphrey narration 3.5s later:
   - 'up': *"Wow, Nigel, you are so good at this. I am going to give you something a little trickier next time."*
   - 'down': *"Let me give you a little more practice with the basics, Nigel. We will build it up again together."*

Each zone passes a signal:
- Number Lab: `{problemsAttempted, firstTryCorrect, longestStreakEver}`
- Discovery Dome: `{queue.length, correctThisSession, longestStreakEver}`
- Story Lab: `{1, 1, 1}` (zone uses completion-count branch in SQL)
- Word Tower: computed from `session.results[]` at end-card

**Adaptive scaffolds at difficulty=1** (Number Lab + Discovery Dome)

When client loads `session.difficulty = 1` (read at zone entry from `ha_get_difficulty`):

- **Number Lab**: in `renderCurrentProblem`, the first hint from `MATH_SKILLS[skill].hints[0]` is shown UPFRONT (`hintDisplay.hidden = false`). In `handleWrong`, the 1st-strike branch is gated on `(session.difficulty || 2) > 1`; at difficulty=1 it skips the "almost!" + hint-button reveal and jumps straight to the walkthrough.
- **Discovery Dome**: same pattern. `handleWrong` 1st-strike branch gated. At difficulty=1 the walkthrough fires on the first wrong, not the second.

Levels 2–4 keep the standard 2-strike rule.

**Verified live (June 2)**: force-set `session.difficulty = 1` in Number Lab, called `renderCurrentProblem()` → hint visible from start with real text ("Try counting up from the bigger..."). Clicked wrong answer → feedback class became `feedback scaffold` with 👩‍🏫 + "Let me show you, Nigel" pattern immediately (not the 2nd-strike threshold).

### 1.4 Character story arc progression (Build #3)

5 Surprise Squad characters, each with 3 episodes:

| Character | Zone | Ep 1 | Ep 2 | Ep 3 |
|---|---|---|---|---|
| Webly Quickfoot 🕷️ | Word Tower | 1 session | 5 sessions | 10 sessions |
| Captain Carlo 🦫 | Discovery Dome | 1 session | 5 sessions | 10 sessions |
| Aurora the Aviator 🦉 | Number Lab | 1 session | 5 sessions | First math skill mastered |
| Toybox Team 🧸 | Story Lab | 1 session | 5 sessions | 10 sessions |
| Shellback Squad 🐢 | Cross-zone | 2 zones | 4 zones | 4 zones × 3 sessions each |

**Tables**: `ha_character_progress`, `ha_character_episodes`.
**Endpoint**: `/api/humphrey/generate-character-episode` — Haiku writes 3-4 sentence Ms. Humphrey-voiced story snippets. Cached per (child × character × episode). Hardened against ~20% Haiku JSON failures with retry-once + regex salvage.

**Staging rule**: one episode unlock per session. Qualifying for ep3 still grants ep1 first, ep2 next, ep3 after.

**Hero Hall UI**: 3 episode pips per card, gold ★ SQUAD badge + glow on squad-ready. Modal opens with Met/Trained/Squad story log fetched async.

### 1.5 Saturday cron email

Vercel cron Sat 12:00 UTC → `/api/cron/saturday-email` → 7d Supabase fetch → Haiku draft (Ms. Humphrey voice) → Zapier Catch Hook `https://hooks.zapier.com/hooks/catch/27395227/4bruass/` → Gmail Send → `bianca.parker92@gmail.com` + `jemelike@gmail.com`.

**Env vars set in Vercel**: `CRON_SECRET`, `ZAPIER_WEBHOOK_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`.

Empty-week short-circuit: when `sessions_total = 0`, skips Haiku entirely.

**Pending V2 polish**: tighten the Haiku prompt so a week with content-bank activity but no actual sessions doesn't read as "missed week."

### 1.6 Other live features

- **Today's Mission** daily plan (Build #1) — v37/38
- **Tue/Thu 10-problem homework** with Ms. Humphrey announce + celebrate, `localStorage ha_homework_<date>`
- **Telemetry coverage** (Lane A.5): all 4 zones instrumented via `js/telemetry.js`. `NS.Telemetry.rpc` + `NS.Telemetry.childId()` + `NS.Telemetry.warmupPool` exposed for cross-module use.
- **Ms. Humphrey widget**: 5 expressions live at 512×512 (idle, encouraging, concerned, surprised, cheering). 200ms crossfade. ElevenLabs agent + voice fallback chain.

---

## 2. CRITICAL LESSON FROM THIS SESSION — read this section in full

### 2.1 The script-tag bug (commit 29632f4)

After shipping v45 and v46 ("all 4 goals achieved!"), Josh asked: *"Did you actually test each of these to see if it worked? Live tab was open."*

He was right to press. The answer was no — I had verified SQL behavior and file syntax, but not opened the live URL and inspected `window.HeroAcademy.Characters` in the actual zone pages. When I finally did, this came back:

```js
scripts_loaded: "math-skills.js | number-lab.js | humphrey.js | humphrey-listener.js |
                 humphrey-chat.js | humphrey-memory.js | humphrey-qna.js | telemetry.js |
                 sw-register.js"
NS_Characters: false
```

**`js/characters.js` was only included in `hero-hall.html`.** The 4 zone HTML files never loaded it. So every `recordSessionComplete()` call from gameplay had been a silent no-op since Build #3 shipped:

```js
// number-lab.js (paraphrased)
if (window.HeroAcademy &&
    window.HeroAcademy.Characters &&    // ← always undefined on number-lab.html
    typeof window.HeroAcademy.Characters.recordSessionComplete === "function") {
  // ← never executed
  setTimeout(function () {
    window.HeroAcademy.Characters.recordSessionComplete("numberlab", {...}).catch(...);
  }, 1200);
}
```

The guard clause swallowed the failure. No console error. No visible breakage. Just nothing happening.

This meant:
- **Build #3 was non-functional in production.** Webly / Carlo / Aurora / Toybox episode unlocks never fired from actual play. The Hero Hall ep1 stories Nigel sees existed only because I pre-seeded them as QA fixtures.
- **Lane D adaptive learning was non-functional in production.** Session signals never posted from gameplay. `ha_difficulty_state` would stay empty no matter how many sessions Nigel completed.
- **Ms. Humphrey level-change narration never played** from real gameplay.

The fix was 4 lines — add `<script src="js/characters.js"></script>` after the telemetry.js include in each of `number-lab.html`, `discovery-dome.html`, `story-lab.html`, `word-tower.html`. Committed as 29632f4.

### 2.2 The meta-lesson: end-to-end verification protocol

**Syntax check + SQL verify + 1 generator force-test is NOT the same as end-to-end verification.**

Going forward, before claiming any feature is "complete":

1. **Open the live URL** in a real client (the existing Number Lab tab on Claude in Chrome works fine for this).
2. **Inspect the namespace**: confirm the API you just shipped actually exists where it needs to. E.g.:
   ```js
   typeof window.HeroAcademy.Characters.recordSessionComplete === "function"
   ```
3. **Trace one real call through the system** — invoke from the page, then query Supabase to verify the row landed:
   ```js
   await window.HeroAcademy.Characters.recordSessionComplete("numberlab", {
     items_attempted: 10, items_correct_first_try: 9, longest_streak: 6,
   });
   // Then: SELECT * FROM ha_session_signals WHERE child_id = ... ORDER BY session_at DESC LIMIT 1;
   ```
4. **For UI-bearing features**, capture the visible state at the moment it should be present (overlay DOM at 1.5s after warmup trigger, or `Humphrey._state.lastSpoken.text` at 4s after a level change).
5. **Only after all four checks pass** can the feature be claimed "live."

This is more time-consuming than syntax + SQL, but it's the only way to catch silent no-ops from guard clauses, missing script tags, stale SW caches, and similar invisible failures.

### 2.3 Additional honesty lesson

When asked "did we achieve the goal," I am to do a **rigorous goal-by-goal audit before claiming success** — not a confidence-bolstering summary. Earlier in this same session I overstated "all 4 goals achieved" and Josh correctly pressed for honest re-audit twice. Both times that surfaced real gaps (single-session bump timing; adaptive scaffolds missing; eventually the script-tag bug). Trust pressure-testing more than confidence.

---

## 3. End-to-end verification log (June 2, post-fix at v47)

After commit 29632f4, the full chain was re-tested live. Each step was confirmed in the production browser:

| Test | How verified | Result |
|---|---|---|
| `js/characters.js` loads on each zone page | `Array.from(document.scripts).map(s => s.src)` | ✅ Present on number-lab.html, discovery-dome.html, story-lab.html, word-tower.html |
| `NS.Characters.recordSessionComplete` exists | `typeof ...` | ✅ `function` |
| `NS.Characters.recordDifficultySignal` exists | `typeof ...` | ✅ `function` |
| `NS.Telemetry.warmupPool` exists | `typeof ...` | ✅ `function` |
| Warmup overlay renders mid-flight | DOM sample at 1.5s into a forced warmup | ✅ Ralphie image + spinner + "Getting fresh problems just for you, Nigel..." |
| Warmup overlay removed on completion | DOM check after warmup resolves | ✅ Removed |
| `session.difficulty` loads from DB on entry | Inspect `window.session.difficulty` after `loadSkill` | ✅ Value=2 (default when no DB row) |
| Adaptive scaffold #1 (hint upfront at d=1) | Force-set `session.difficulty=1`, call `renderCurrentProblem()`, sample DOM | ✅ Hint visible from start, real text rendered |
| Adaptive scaffold #2 (walkthrough on 1st wrong at d=1) | Click wrong answer button at d=1 | ✅ Feedback class became `feedback scaffold` with 👩‍🏫 emoji, not "Almost!" |
| Live signal POST → DB | Call `recordSessionComplete("numberlab", {10,9,6})`, query DB | ✅ Row created in `ha_session_signals` |
| Difficulty evaluator bumps level | Same call as above | ✅ `ha_difficulty_state.current_level` went 2→3 (single acing session) |
| Difficulty evaluator drops level | Call with `{10,3,1}` against current level 3 | ✅ Went 3→2 (single struggle session) |
| Ms. Humphrey speaks level-change line | Captured `Humphrey._state.lastSpoken.text` at +4s after drop | ✅ *"Let me give you a little more practice with the basics, Nigel. We will build it up again together."* |

Post-verification cleanup: `ha_session_signals` + `ha_difficulty_state` rows for Nigel deleted. State is back to baseline; first real gameplay session will populate fresh.

One small consequence of QA: Aurora's episode 2 was unlocked during my test (because `recordSessionComplete` triggered the milestone check against Nigel's pre-seeded session counter). The Haiku-generated ep2 story is now cached in `ha_character_episodes`. This is benign — when Nigel actually plays his next Number Lab session, that cached story will be the one he sees for Aurora's ep2 unlock. Leaving it in place.

---

## 4. Database state

| Table | Rows | Purpose |
|---|---|---|
| `ha_children` | 1 | Nigel's profile metadata |
| `ha_standards` | 46 | CCSS + MD MCCRS pairs |
| `ha_topics` | 20 | Curriculum topics with prerequisite DAG |
| `ha_sessions` | 5 | Session boundaries (Lane A.5 telemetry) |
| `ha_attempts` | 0 | Per-attempt log (currently fire-and-forget at low priority) |
| `ha_topic_mastery` | 1 | Per-topic mastery |
| `ha_daily_summary` | 2 | Daily rollup |
| `ha_character_unlocks` | 0 | Legacy table — superseded by ha_character_progress |
| `ha_word_tower_items` | 57 | 33 curated + 24 Haiku |
| `ha_math_problems` | 10 | All Haiku |
| `ha_discovery_cards` | 42 | 32 curated + 10 Haiku |
| `ha_story_templates` | 16 | 10 curated + 6 Haiku |
| `ha_character_progress` | 5 | Ep1 seeded for all 5 characters |
| `ha_character_episodes` | 6 | 5 ep1 + Aurora ep2 (Haiku-cached during QA) |
| `ha_difficulty_state` | 0 | Awaiting first real Nigel session |
| `ha_session_signals` | 0 | Awaiting first real Nigel session |

**Migrations on main** (14 total, ordered):
```
ha_01_schema_core
ha_02_rpc_functions
ha_03_seed_standards_grade2
ha_04_seed_topics_grade2
ha_05_seed_child_nigel
ha_06_fix_local_today_search_path
ha_word_tower_items
ha_math_problems
ha_discovery_cards
ha_story_templates
ha_character_progression
ha_difficulty_adaptation
ha_difficulty_single_session_bump       ← superseded
ha_difficulty_pure_single_session       ← current
```

---

## 5. API endpoint inventory (`api/`)

| Path | Purpose |
|---|---|
| `humphrey/tts.js` | ElevenLabs proxy for Ms. Humphrey voice |
| `humphrey/chat.js` | General Ms. Humphrey free-form chat |
| `humphrey/listen.js` | Voice transcription |
| `humphrey/summarize.js` | Passage summarization |
| `humphrey/assess-reading.js` | Reading assessment |
| `humphrey/assess-comprehension.js` | Comprehension assessment |
| `humphrey/assess-sentence.js` | Sentence-level assessment |
| `humphrey/generate-passage.js` | Reading passage generator |
| `humphrey/generate-word-tower-batch.js` | Word Tower content generator |
| `humphrey/generate-math-problems.js` | Number Lab content generator |
| `humphrey/generate-discovery-cards.js` | Discovery Dome content generator |
| `humphrey/generate-story-templates.js` | Story Lab content generator |
| `humphrey/generate-character-episode.js` | Character story snippet generator |
| `cron/saturday-email.js` | Weekly Saturday cron email to parents |

---

## 6. File reference (current at v47)

| Path | Purpose / Notable state |
|---|---|
| `sw.js` | Cache `hero-academy-v47`. CORE array enumerates JS files, HTML pages, asset paths. **Always bump CACHE_VERSION on every deploy and add new files to CORE.** |
| `js/telemetry.js` | Foundation. Exposes `rpc`, `childId`, `recordAttempt`, `startSession`, `endSession`, `warmupPool` (the Lane E helper). Auto-starts session on DOMContentLoaded based on URL→zone map. |
| `js/characters.js` | Character progression + episode unlocks + `recordSessionComplete(zone, signal?)` + `recordDifficultySignal(zone, signal)` (with auto-scheduled Humphrey narration at +3.5s on level change). **Must be loaded in every zone HTML.** |
| `js/number-lab.js` | `loadSkill` is async (awaits warmup + difficulty load). `renderCurrentProblem` auto-shows hint at d=1. `handleWrong` first-strike branch gated on `d > 1`. |
| `js/discovery-dome.js` | `loadServerQueue` block-awaits warmup + loads `session.difficulty`. `handleWrong` first-strike branch gated on `d > 1`. |
| `js/story-lab.js` | `loadServerTemplates` block-awaits warmup. Passes `{1,1,1}` signal on story completion. |
| `js/word-tower-reading.js` | `loadServerQueue(level)` block-awaits warmup. Threshold constants `TOPUP_THRESHOLD=30`, `TOPUP_BATCH_SIZE=25`. Computes signal from `session.results[]` at end-card. |
| `js/humphrey.js` | Ms. Humphrey widget + audio chain (pre-rendered MP3s → ElevenLabs agent → Web Speech fallback). |
| `number-lab.html` | **Includes `js/characters.js`** (fixed in 29632f4). |
| `discovery-dome.html` | **Includes `js/characters.js`** (fixed in 29632f4). |
| `story-lab.html` | **Includes `js/characters.js`** (fixed in 29632f4). |
| `word-tower.html` | **Includes `js/characters.js`** (fixed in 29632f4). |
| `hero-hall.html` | Includes `js/characters.js`. Renders character cards with episode pips + squad badge + async story-log modal. |
| `index.html` | Home / Today's Mission / homework tile. Does NOT load characters.js (not needed for home screen). |

---

## 7. Pending work (priority order)

### 7.1 Immediate next — Build #4: SRS + weekly cumulative quiz

Now that all 4 content tables exist + telemetry is populated + adaptive difficulty works end-to-end, the natural next step.

**Suggested entry point**:
- New table `ha_srs_queue (child_id, source_table, source_item_id, leitner_box int, last_reviewed_at, due_at, ease numeric)`.
- Pull recent misses by joining `ha_*_items` filtered on `last_wrong_at > now() - interval '14 days'` (these timestamps already populated via `ha_mark_*_attempt` RPCs).
- Initial Leitner box intervals: box 1=1 day, box 2=3 days, box 3=7 days, box 4=14 days, box 5=30 days. Promote on correct, demote to box 1 on miss.
- Surface as "Daily Practice" tile on `index.html`. Saturday's tile becomes a cumulative 10-item mixed-zone quiz biased toward struggle areas.

### 7.2 Saturday email V2 polish

Tighten Haiku prompt so an empty-data week reads as "in-app catch up" rather than implying Nigel missed a session.

### 7.3 6th Ms. Humphrey expression — cheering pose variant

Per memory: want a 6th expression. Current 5: idle, encouraging, concerned, surprised, cheering at 512×512. Use BASE portrait (Variant 1 from May 30 MJ generation) as `--cref` anchor.

### 7.4 Remaining MBD 8-build list

| # | Build | Status |
|---|---|---|
| 1 | Today's Mission daily plan | ✅ Live |
| 2 | Adaptive AI content (all 4 zones) | ✅ Live + verified |
| 3 | Story arc + character progression | ✅ Live + verified at v47 |
| **4** | **SRS + weekly cumulative quiz** | **Next** |
| 5 | Parent dashboard UI | Pending (cron email already live) |
| 6 | Multi-modal (canvas, manipulatives) | Pending |
| 7 | Bridge to physical world | Pending |
| 8 | Resilience + observability fallback layer | Pending |

### 7.5 Standing items

- Hero avatar customizer for Nigel
- 6–12 months of daily curriculum content across all COMAR subjects
- Custom domain setup
- Suno music tracks to wire in once downloaded
- Cauldron Café + Diner Lanes Phaser games — separate codepath, not yet adaptive
- `walkthrough()` functions for remaining Number Lab math skills

---

## 8. Hard-won knowledge

### 8.1 New from this session

- **Silent guard-clause no-ops are the worst bugs.** When code is wrapped in `if (window.X && window.X.Y && ...)` and `X` is undefined because a script tag is missing, you get no error, no warning, just silence. The feature appears to ship, the integration "passes" SQL and syntax checks, and Nigel could play 100 sessions without a single side effect firing. **Always grep every HTML page for the script tags of every new module before shipping.**
- **End-to-end live verification is non-negotiable.** SQL + syntax + one isolated generator force-test ≠ verified. The browser is the only source of truth for client-side wiring. See §2.2 for the protocol.
- **Press-back on victory claims surfaces real bugs.** When Josh asks "did we actually achieve this," default to a rigorous goal-by-goal re-audit, not a confidence-bolstering yes. Both times he pressed in this session, real gaps emerged.
- **Haiku JSON failures (~1-in-5 stochastic)**: Haiku embeds unescaped double-quotes in dialogue/string fields, breaks `JSON.parse`. Mitigation pattern: prompt rule "Use SINGLE quotes for any dialogue, never double-quote characters inside the string value" + retry-once wrapper + regex salvage attempt before final fail.
- **SW cache traps**: live tabs running an older SW version still load stale modules until both the SW updates AND the tab reloads. Verify with `caches.keys()` + `navigator.serviceWorker.getRegistrations()`. QA with fresh tab + cache-bust query param. To force-pickup: unregister registrations + clear caches + navigate with `?bust=<timestamp>`.
- **Per-child Haiku content works at scale**: Haiku produces curriculum-grade content (NGSS-aligned, CCSS-aligned, grade-2 decodable) when given tight system prompt + Nigel's profile + structural validation. Validation catches the rare malformed item; pool-check short-circuits prevent runaway cost.
- **Personalization-as-hook principle**: best content uses Nigel's interests as the OPENING into curriculum, not the lesson itself. Spider-Man → real spiders; soccer → friction; guitar → vibrations; cassava leaf + "churn" digraph word. Story Lab is the exception by design (Nigel IS the protagonist).
- **One-episode-per-session staging**: even if multiple criteria fire, drip episodes across sessions for narrative pacing.
- **Migration → seed → endpoint → client patch → SW bump → SCP → commit → push** order is the reliable deploy chain. SW bump must come before push or stale clients won't pick up the new modules.
- **Surgical edits — anchor whitespace matters**: `'source:     '` vs `'source: '` will silently miss. `s.replace(old, new, 1)` with `assert old in src` immediately surfaces the failure. Always `grep -n` verify after edits.
- **Python re.sub typo class**: `).unseen||0)>=30)` vs `.unseen || 0) >= 30` — an extra leading character in the replacement string introduces an extra paren. Always view the post-substitution result for the first instance.
- **Single-session difficulty bump trade-off**: pure single-session is maximally reactive but can over-correct on a lucky/distracted day. 3-session smoothing is more stable but lags real-time. Chose single-session per Josh's spec; can revert to smoothed if Nigel's experience shows it's too jittery.
- **Warmup overlay timing**: 1.2s delay before showing the overlay prevents flash for fast warmups (most Haiku batches return in 6-10s; warmup with a small batch can be faster).

### 8.2 Preserved from earlier sessions

- **Phaser + Claude in Chrome**: `requestAnimationFrame` throttled to zero in hidden tabs. Never trust headless screenshots for Phaser; test on iPad.
- **Large file transfers**: Claude-in-Chrome paste injection breaks above ~15-20KB. Pattern: base64-encode locally → embed in self-contained bash deploy script.
- **MCP terminal helpers** (`window.__run`, `window.__scrape`): don't persist across page reloads. Reinstall at session start. Tab IDs are unstable; re-run `tabs_context_mcp` after any suspected disconnect. Also: the xterm in the VPS terminal tab can become unresponsive to programmatic paste-events without warning. When that happens, fall back to asking Josh to paste the command directly.
- **SSH/SCP in chat UI**: UI obfuscates `user@ip` as emails. Use shell variable assignment (`VPS=2.24.68.106; ssh root@$VPS`).
- **SW discipline**: bump `CACHE_VERSION` in `sw.js` and add new files to `CORE` array on every deploy.
- **ElevenLabs React fiber trick**: shared-library voice IDs aren't exposed via `/v1/voices`. Walk React fiber via `Object.keys(el).find(k => k.startsWith('__reactFiber$'))` then traverse `node.return`.
- **Credentials**: Claude pre-fills non-sensitive form fields but never enters API key values — Josh handles those directly.
- **Supabase SECURITY DEFINER warnings** from `get_advisors` are expected and intentional for this architecture. Don't treat as bugs.

---

## 9. Approach & patterns

- **Session pickup**: read this file first. Then sanity-check current SW version: `curl -fsSL https://raw.githubusercontent.com/jemelike-lab/hero-academy/main/sw.js?_=$(date +%s) | head -1`.
- **Deploy chain**: stage local → `present_files` → Josh SCPs `~/Downloads/*` to `/tmp/` on VPS → Claude drives VPS terminal to `cp` files into `/tmp/hero-deploy`, sed-bump SW, commit, push. Vercel auto-deploys from `main`.
- **Verification chain** (post-deploy): GitHub raw URL fetch (cache-busted) → reload live URL → namespace inspect → one live function call → DB row verify → DOM sample for UI. See §2.2.
- **Decision authority**: Josh prefers direct execution over explanation. Claude makes reasonable design decisions without asking on each detail. **Push back when honesty requires it.**
- **File-size threshold**: <5KB inline through Chrome terminal OK. >5KB SCP from Mac.
- **Adaptive content endpoint pattern** (reusable for new zones):
  1. Pool-check short-circuit (`status:'sufficient'` if unseen ≥ MIN)
  2. Build avoid list from existing items + recent struggles for retrieval practice
  3. `ha_get_difficulty` for current level
  4. Haiku 4.5 strict-JSON system prompt + personalization block + DIFFICULTY_BANDS + structural rules
  5. Validate each item against schema rules (length, range, dedup, kind allowlist)
  6. Bulk insert via service-role REST with `Prefer: return=representation`, stamping `difficulty: <level>`
- **HTML script-tag audit** (new this session): when shipping a new shared JS module, grep every `*.html` that should use it. The script tag is part of the deploy, not an afterthought.

---

## 10. Tools & resources (steady state)

- **Hosting**: Vercel (auto-deploy from GitHub `main`), Hostinger VPS
- **Backend**: Supabase (`yofqeuguxgujgqnaejmw`)
- **AI/Voice**: Anthropic (Haiku 4.5 for content); ElevenLabs (agent `agent_5901kssbzjm1e0yvd0kdwxa3r49m`, voice Emory `aNGh7D6DrhhIlad2U6Fg`, `eleven_flash_v2_5`); Web Speech API fallback; pre-rendered MP3s for static lines
- **Game engine**: Phaser 3.70 via CDN (Cauldron Café + Diner Lanes only)
- **Stack**: Vanilla HTML/CSS/JS, no framework / build step. `window.HeroAcademy` namespace for shared modules.
- **Design tokens**: `css/style.css` `:root` vars — `--gold:#ffd147`, `--orange:#ff8b3d`, `--magenta:#ec4899`, `--cyan:#14b8d4`, `--font-display:Fredoka`
- **Art**: Midjourney for Ralphie + Ms. Humphrey portraits; WebP derivatives at 128/256/512/1024px under `assets/`
- **Automation**: Claude-in-Chrome MCP drives Hostinger VPS xterm + Vercel + GitHub. Persistent tab IDs are unstable — refresh via `tabs_context_mcp` each session.
- **GitHub raw URLs**: `https://raw.githubusercontent.com/jemelike-lab/hero-academy/main/[file]?_=$(date +%s)` — fastest path to current state. The cache-bust param is essential; GitHub's raw CDN can serve stale.
- **Vercel env vars (set)**: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ZAPIER_WEBHOOK_URL`

---

## 11. Live verification samples (preserved evidence)

### Word Tower (post-v45 personalization)
- "Gabriel uses a brush to paint his toy cars." (brush, -sh)
- "We churn the milk to make cassava leaf sauce." (churn, ch-)
- "Spider-Man can smash through walls." (smash, -sh)
- "Nigel goes to church on Sunday." (church, ch-)
- "Nigel will shout when he scores a goal." (shout, sh-, difficulty=4)

### Number Lab (procedural + personalized)
- "Nigel has 3 Spider-Man action figures. His friend Gabriel gives him 2 more..."
- "Bianca cooked 5 plates of jollof rice. Josh cooked 2 plates..."

### Discovery Dome (NGSS-aligned with kid hooks)
- ⚽ "Kick and Roll" → friction (3-PS2-1)
- 🎸 "Sound from Vibration" → guitar (1-PS4-1)
- 🕷️ "Spider Silk Strength" → 2-LS4-1

### Story Lab (Nigel-protagonist)
- "Skylar's Treasure Hunt" (cousin)
- "The Tooth Fairy's Return" (real lost-tooth milestone)
- "Neighbor Larry's Wild Story" (real neighbor)
- "Gabriel's Soccer Goal" (best friend + hobby)
- "The Enchanted Piano"

### Character ep1 stories (all 5 cached) — sample (Captain Carlo):
*"Captain Carlo pops out from behind a giant gear wheel in the Discovery Dome, his goggles gleaming bright. He sees you standing there and his tail wiggles with excitement. 'Well, hello there, Nigel! I heard you just fixed a tricky problem in your lessons today—kind of like how I fix broken gadgets across the stars.'"*

### Single-session difficulty evaluator (live SQL + live client, both verified)
- Baseline (no row): level = 2 (default)
- After 1 acing session (10/9 first-try, streak 6): level → 3, direction='up'
- After 1 struggle session (10/3 first-try, streak 1): level → 2, direction='down'
- After 1 mediocre session (10/7 first-try, streak 2): level → 2 (held), direction='same'

### Ms. Humphrey level-change narration (captured live from `Humphrey._state.lastSpoken.text`)
*"Let me give you a little more practice with the basics, Nigel. We will build it up again together."* — fired automatically 3.5s after a level dropped 3→2 via `recordDifficultySignal`.

---

## 12. Pickup checklist for next-session Claude

1. Read this file end-to-end. Note current SW version (`v47`) and latest commit (`29632f4`).
2. Sanity-check the deployed SW: `curl -fsSL https://raw.githubusercontent.com/jemelike-lab/hero-academy/main/sw.js?_=$(date +%s) | head -1` — should show `hero-academy-v47` or higher.
3. Check recent commits on the VPS: `cd /tmp/hero-deploy && git log --oneline -10`.
4. If asked about adaptive learning behavior, §3 (verification log) and §11 (samples) are the canonical references.
5. **Before shipping any new shared JS module**: grep every `*.html` that should include it. The script-tag bug in §2.1 cost a full lane of rework. Do not repeat.
6. **Before claiming any feature is "complete"**: follow the §2.2 verification protocol. Live tab inspection > syntax check.
7. For **Build #4 (SRS)** entry point:
   - New table: `ha_srs_queue (child_id, source_table, source_item_id, leitner_box int, last_reviewed_at, due_at, ease numeric)`
   - Pull recent misses from each content table by joining filtered on `last_wrong_at`
   - Leitner intervals: 1d / 3d / 7d / 14d / 30d
   - Surface as "Daily Practice" tile on `index.html`; Saturday tile becomes cumulative mixed-zone quiz
   - Cumulative quiz biases item selection toward struggle areas via `ha_recent_*_struggles` RPCs

---

_End of HANDOFF. Last updated EOD June 2, 2026 at v47._
