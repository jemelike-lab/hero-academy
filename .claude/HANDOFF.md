# Hero Academy — HANDOFF

**Last updated:** End of session, late evening June 2 → early morning June 3, 2026
**Live SW:** `hero-academy-v58`
**Latest commit on `main`:** `a7eaab7` (Build #5 polish dark-mode fix)

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
| **Truth source** | This file (`.claude/HANDOFF.md` on `main`) — read first |

### Deploy pattern
Bundle locally → `scp ~/Downloads/<bundle>.tar.gz root@2.24.68.106:/tmp/` → Claude drives VPS terminal via Chrome MCP to extract + `git commit -am '…' && git push` → Vercel auto-deploys. **Keep commit messages short** — the VPS web terminal disconnects on long commands (≥120 chars). Send commands one at a time in problem sessions.

---

## 1 — What shipped this session (June 2–3, 2026)

Four production builds in one night, all verified live end-to-end.

### Build #8.1 — System healthcheck cron + transition alerts ✅

- New endpoint `/api/cron/healthcheck` runs every 6h via Vercel cron `0 */6 * * *`
- 5 parallel dependency checks: `env`, `supabase`, `anthropic`, `saturday_email_cron`, `zapier_dns`
- Computes `overall_status` (`ok` / `degraded`) and writes a row to `ha_health_checks` every run
- **Transition-debounced alerts** via Zapier hook: only fires when status changes (`ok → degraded` red banner, `degraded → ok` green recovery banner). Repeat `ok → ok` = no email.
- Migration `ha_health_checks_v1` applied (table with id, checked_at, overall_status, checks jsonb, duration_ms, alerted)
- **Verified live**: recovery email actually delivered via Zapier (Jun 2, 22:29 ET)
- Commit: `2036d72` initial + `413f9f7` fix1 (empty 201 body from `Prefer: return=minimal`)

### Build #8.1.1 — Cron freshness + external watchdog ✅

- **Internal:** `cron_freshness` check inside every healthcheck reads prev row's `checked_at`; if >7h old, flags `degraded` (catches partial Vercel cron schedule outages)
- **External:** `HEALTHCHECKS_PING_URL` env var → handler POSTs to healthchecks.io on every successful run, POSTs `/<uuid>/fail` on degraded
- healthchecks.io check created (`Hero Academy heartbeat`, 6h period / 2h grace, 3 integrations attached: email + Slack + WhatsApp)
- Ping URL: `https://hc-ping.com/ec0311a8-d63a-4f89-828f-8d985dd28889`
- Now belt-and-suspenders: internal freshness check catches partial cron miss + external watchdog catches complete cron outage
- Commit: `c5fe105`

### Build #6 A2.1 — Canvas parser hardening + make_10 visual ✅

- Rewrote `js/canvas-skills.js` parser. New regex split: `STRONG_ADD` (more / altogether / in all / total / combined / both / added / joined / earned / found / bought) **overrides** `SUB_VERBS` (gives away / gave away / takes away / lost / fewer / less / left / ate / sold / etc.)
- Fixes the "Gabriel gives him 5 **more** apples" bug that used to parse as subtraction because "gives" matched
- New `makeTenLine` function: 2-arrow decomposition (anchor → 10 jump + 10 → sum jump with pause-dot at 10). Falls back to `additionLine` for non-cross-ten problems
- Registry: `make_10` now → `makeTenLine` (was → `additionLine`, comment had literally said "refine later")
- Exposed `_parseAddSub` and `_inferOp` on `NS.CanvasSkills` for console debug
- **Verified live**: 13/13 parser test cases pass via `HeroAcademy.CanvasSkills._parseAddSub(...)` in production browser console; make_10 visualization renders (number line + jumps + result)
- Commit: `068b8ca`

### Build #5 polish — Premium Saturday email + Ms. Humphrey audio ✅

- Complete HTML redesign in `api/cron/saturday-email.js`:
  - Gradient hero banner (purple → magenta → orange)
  - Circular Humphrey portrait (the 512px PNG asset)
  - 4-card colored stats grid (amber/pink/cyan/green tints)
  - Letter-style briefing with magenta accent bar, serif font (Georgia)
  - Per-zone cards with emoji + stats
- **NEW: Audio briefing** — handler now:
  1. Generates MP3 via ElevenLabs Emory TTS (`synthesizeBriefingAudio`)
  2. Uploads to Supabase Storage bucket `humphrey-audio` (`uploadAudioToStorage`)
  3. Returns public URL for the email "▶ Play Ms. Humphrey's voice note" button
- Try/catch wraps audio block — failure degrades gracefully (email still ships text-only)
- New migration `ha_humphrey_audio_bucket` applied: public bucket, 5 MB cap, MP3-only, public read policy
- New env var: `HEALTHCHECKS_PING_URL` and (no new env vars for Build #5 — uses existing `ELEVENLABS_API_KEY` + `SUPABASE_*`)
- **Live test #1 (commit `8990998`)**: real email sent to both inboxes, audio synthesized (799 KB), Zapier `ok (200)`, but Josh found letter text invisible in Gmail dark mode
- **Dark-mode fix (commit `a7eaab7`, SW v58)**:
  - `<meta name="color-scheme" content="light only">` + `supported-color-schemes` (opt out)
  - `<font color="…">` tags wrap every text node (Gmail dark mode respects HTML4 attributes even when it overrides CSS `color:`)
  - `bgcolor=` attributes on table cells
  - Solid `#fdf2f8` letter card background (replaced gradient that Gmail's heuristic was inverting)
  - `[data-ogsc]` selectors with `!important` for Gmail dark-mode wrapper
  - 37 `<font>` wrappers, 11 `.ha-text-dark` elements verified in shipped HTML
- **Live test #2**: real email shipped with dark-mode fix to both inboxes (awaiting Josh's visual confirmation as of session end)

---

## 2 — Status of the 8 MUST BUILD items

Honest pass on each. Tonight's work changed the picture on #2, #6, and #8.

### MUST BUILD #1 — Daily structured mission ❌ NOT BUILT (highest leverage gap)

> _"Today's Mission, 3 zones, 25 minutes, finish to unlock Aurora the Aviator."_

The app is a buffet, not a journey. Nigel sees 10 zones, picks math, skips writing. Without a structured daily plan, the structural problem isn't fixed.

**Next-step recipe:**
- New `ha_daily_mission` table: `child_id`, `mission_date`, `zone_sequence[]`, `target_minutes`, `reward_character_id`, `completed_at`
- New endpoint `/api/humphrey/today-mission` that returns today's mission (regenerates daily, considers SRS due items + zones least-touched in past 7d + Bianca's weekly priority once #5 ships)
- Hero Hall tile becomes the mission card with progress dots
- Completion fires character unlock (uses existing `js/characters.js` infrastructure that's been loaded but unused since Build #3)

**Effort:** 1 session for the table + generator + tile UI.

### MUST BUILD #2 — AI-generated adaptive content 🟡 PARTIALLY BUILT (~70%)

> _"Infinite curriculum. Always personalized. Never the same twice."_

Done across all 4 active zones via Haiku generators with pool top-up:
- Word Tower (`ha_word_tower_items`, ~57 rows)
- Number Lab (`ha_math_problems`, ~146 rows)
- Discovery Dome (`ha_discovery_cards`, ~89 rows)
- Story Lab (`ha_story_templates`, ~16 rows)
- Adaptive difficulty via `ha_difficulty_state` + `ha_session_signals` + auto-evaluating RPC (last 3 signals → bump/hold/drop)
- Personalization via `data/nigel-profile.json` (him + family + friends + interests injected into prompts, capped ~30%)
- "Never twice" enforced via `warmupPool` helper with 3-tier blocking behavior

**Tonight's contribution:** Build #6 A2.1 parser hardening + make_10 visualization make the in-zone walkthroughs (post-2nd-strike) richer.

**What's missing:**
- Cross-zone coordination (Story Lab story about a math problem he struggled with)
- Longer narrative arcs in content (multi-day story continuation)
- Story Time read-aloud library (only ~16 templates; needs Haiku generation here too)
- The Saturday email briefing now adapts (Build #5) but doesn't influence content selection

**Effort:** ~3-4 sessions for cross-zone wiring + Story Time generator + multi-day arcs.

### MUST BUILD #3 — Story arc + Hero levels 🟡 PARTIALLY BUILT (~30%)

> _"Hero levels, mentor characters, Hero Journey Map. Something to be hungry for tomorrow."_

Done:
- 5 Surprise Squad characters with infrastructure loaded (`js/characters.js`): Captain Carlo, Aurora the Aviator, Shellback Squad, Webly Quickfoot, Toybox Team
- 3-episode arcs per character (`ha_character_progress` + `ha_character_episodes`)
- Hero Hall trophy room page exists
- Episode unlocks fire from `recordSessionComplete`
- Level-change Humphrey narration plays

**What's missing:**
- **Nigel's own level** — there's no "Hero Level 3" he's pushing toward. Coins are earned but buy nothing
- **Hero Journey Map page** — visible long-term progress with markers (first 5-correct streak, first saved story, first 100% session)
- **Boss/villain narrative** — nothing creates tension/momentum
- **Surprise Squad currently invisible until Hero Hall is opened** — they should appear and join Humphrey at milestones in the zones themselves

**Effort:** 1 session for hero levels + mentor-cameo system, 1 session for the journey map page.

### MUST BUILD #4 — Spaced repetition + cumulative assessment 🟡 BUILT, NEEDS LIVE VERIFICATION (~80%)

> _"Saturday morning, before the parent email, Nigel does a 10-question cumulative quiz. Real data."_

Build #4 (earlier session) shipped:
- **SRS engine**: `ha_srs_queue` table with SM-2 scheduler, auto-enroll on 2nd-miss, `js/srs.js` module, unified `review.html` (supports `?mode=daily` and `?mode=friday`)
- **Daily Practice tile** on `index.html` surfaces due-item count
- **Friday cumulative quiz** + Saturday email retention number

**What's missing / needs verification:**
- Confirm `ha_srs_queue` actually populates from real 2nd-miss events (need a real Nigel session)
- Confirm Daily Practice tile shows count on the device Nigel uses (iPad)
- Confirm Friday quiz fires and emits retention number into Saturday email
- The Saturday email (Build #5 polish tonight) shows the briefing but doesn't yet pull from `ha_srs_queue` retention data — needs wiring

**Effort:** 1 session to verify via real Nigel play + wire retention number into briefing.

### MUST BUILD #5 — Bianca as co-pilot ❌ NOT BUILT

> _"Bianca should be a participant, not just a recipient."_

The Saturday email is now beautiful and audio-enabled (Build #5 polish tonight) — but it's still one-way.

**Next-step recipe:**
- New `ha_parent_directives` table: `child_id`, `created_at`, `directive_type` (weekly_priority / custom_prompt / real_world_event), `payload jsonb`, `consumed_at`
- New parent page `parent.html`, password-gated via URL hash (no auth needed for v1)
- Form fields:
  - "This week's priority" → influences Daily Mission picker (depends on #1)
  - "Ask Nigel about [topic]" → injects into next Humphrey conversation
  - "We did [activity] in real life — count it" → bumps Discovery Dome / Explorer's Hall progress
  - "Suggest 5 minutes of [skill] this weekend" → goes into next Saturday briefing
- Email signature now becomes "Reply to set next week's priority"
- Live dashboard (mirror of Saturday email) visible anytime

**Effort:** 2 sessions — table + page + integration with mission picker and briefing.

### MUST BUILD #6 — Multi-modal teaching 🟡 PARTIALLY BUILT (~65%)

> _"A whiteboard canvas Ms. Humphrey sketches into. Manipulatives Nigel can drag. Illustrations."_

Done:
- Build #6 Lane A: drawing canvas mounted in Number Lab + Story Lab, Nigel pen + Humphrey programmatic API
- Build #6 Lane A2.1 tonight: parser hardening + specialized `make_10` decomposition visualization
- Build #6 Lane B: visual aids in Humphrey speech bubble + image generation
- Skill catalog covers: add/subtract within 10/20, make_10, doubles, doubles_plus_one (some use additionLine fallback)

**What's missing:**
- **Manipulatives layer** — drag/drop coins, base-10 blocks, ten-frames
- **More skill visualizations** — `subtract_from_10`, `count_on`, place_value, telling time, fractions
- **AI-generated drawings** — Haiku outputs canvas-draw commands the engine interprets
- **Bedtime story canvas** — simple illustrations during Story Time reads
- **Word Tower letter tracing** — write the letter with finger, canvas validates
- **Cross-zone canvas** — currently only mounted in 2 zones; should extend to Discovery Dome (cycle diagrams), Explorer's Hall (map sketching), etc.
- **`ha_drawings` DB persistence** — currently localStorage only; should persist Nigel's drawings to DB so Saturday email can include "this week he drew…"

**Effort:** 1-2 sessions for manipulatives + 3 more skill visuals, 1 session for AI-generated drawings, 1 session for DB persistence + Saturday email integration.

### MUST BUILD #7 — Bridge to the physical world ❌ NOT BUILT

> _"Go count the spoons in the kitchen drawer. Hold up your drawing to the camera."_

Not started. Pure-screen learning has diminishing returns at age 7. Homeschool's structural advantage is mixing screen + world.

**Next-step recipe:**
- "Real-world quest" component that Humphrey can issue: 30-second timer, "go count [X], come back and tell me how many you found"
- Camera capture flow: simple "show me your drawing" → snapshot → Haiku vision call → "Wow, I love the spots on your dragon!"
- A few seed activities (counting, color hunt, "find something blue", letter scavenger hunt)
- Logged into a new `ha_real_world_quests` table for Saturday email mentions

**Effort:** 2 sessions — camera capture is the trickiest piece (PWA permissions, iPad quirks).

### MUST BUILD #8 — Error recovery + observability 🟡 PARTIALLY BUILT (~75%, big push tonight)

> _"Fallbacks everywhere. Telemetry so you know about failures before he does."_

Done tonight:
- Build #8.1: System healthcheck cron with transition-debounced alerts
- Build #8.1 fix1: empty body edge case
- Build #8.1.1: cron freshness self-check + healthchecks.io external watchdog
- 5 dependency checks (env, supabase, anthropic, saturday_email_cron, zapier_dns) + cron_freshness
- `ha_health_checks` table logs every run with status + duration + per-check results
- Both alert paths verified live (degraded→ok recovery email delivered)
- External watchdog ping registered ("up" on healthchecks.io as of Jun 2, 23:16 ET)

**What's missing:**
- **Build #8.2: Retry + graceful degradation** — when Anthropic / Supabase / Zapier has a transient 5xx, retry with backoff before flagging degraded. Auto-recoverable failures shouldn't page Josh.
- **Build #8.3: Client-side error capture** — JS errors in the browser silently lose the kid's session. Need a `window.addEventListener('error', …)` hook posting to a new telemetry endpoint, surfaced in `ha_client_errors` and rolled up in healthcheck.
- **Per-check runbook hints in alert email** — for each failing check, include "most common cause + where to look first" (e.g., anthropic 5xx → check API keys → console.anthropic.com).
- **Manual recheck command in alert email** — copy-paste curl Josh runs after fixing to immediately verify recovery (instead of waiting up to 6h).

**Effort:** 1 session for #8.2 retry, 1 session for #8.3 client capture, 30 min for alert email enrichments.

---

## 3 — Database state

20+ `ha_*` tables in Supabase. Tonight added `ha_health_checks` + Storage bucket `humphrey-audio`.

| Table | Purpose | Approx rows |
|---|---|---|
| `ha_children` | Child records | 1 (Nigel) |
| `ha_standards` | CCSS + MD MCCRS standards | 46 |
| `ha_topics` | Curriculum topic DAG | 20 |
| `ha_sessions` | Per-zone session log | 27 |
| `ha_attempts` | Question/answer log | 5 |
| `ha_topic_mastery` | Per-topic mastery state | live |
| `ha_character_unlocks` | Squad unlock log | live |
| `ha_character_progress` | 5 squad chars, 3-episode arcs | 5 |
| `ha_character_episodes` | Haiku-generated episode stories | 7 |
| `ha_daily_summary` | Per-day aggregates | live |
| `ha_word_tower_items` | Adaptive phonics items | ~57 |
| `ha_math_problems` | Adaptive math problems | ~146 |
| `ha_discovery_cards` | Adaptive science fact cards | ~89 |
| `ha_story_templates` | MadLib story templates | ~16 |
| `ha_difficulty_state` | Per-zone per-child level (1-4) | live |
| `ha_session_signals` | Bump/hold/drop signals | live |
| `ha_srs_queue` | SM-2 SRS items | live (needs verify) |
| `ha_friday_quiz_results` | Cumulative quiz | live (needs verify) |
| `ha_health_checks` | **NEW** Healthcheck cron log | 5+ |

**Synthetic test row**: `ha_health_checks` id `101dcc2b-c045-442c-a5c0-06eaa9672042` — manually inserted Jun 2 22:29 ET to test the recovery alert path. Its `checks.anthropic.error` starts with `SYNTHETIC:` so it's easy to filter. **Safe to leave or delete** (`delete from ha_health_checks where id = '101dcc2b-c045-442c-a5c0-06eaa9672042';`).

**Storage bucket**: `humphrey-audio` (public read, 5 MB cap, audio/mpeg only). One file uploaded: `briefing-2026-06-03.mp3` (~800 KB, overwritten on each Saturday cron run).

---

## 4 — Infrastructure inventory

### Vercel env vars (all `Sensitive`, Production + Preview)
- `CRON_SECRET` — **rotated tonight**, value ends `…ace0` (64-char hex). Stored externally by Josh.
- `ZAPIER_WEBHOOK_URL` — webhook receiving `to/subject/html/text/reply_to/kid_name/week_ending/audio_url` payload
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — service role bypasses RLS for inserts
- `ANTHROPIC_API_KEY` — used by every Haiku call
- `ELEVENLABS_API_KEY` — used by Humphrey TTS + Saturday audio briefing
- **NEW**: `HEALTHCHECKS_PING_URL` — `https://hc-ping.com/ec0311a8-d63a-4f89-828f-8d985dd28889`

### Vercel cron schedules (`vercel.json`)
- `/api/cron/saturday-email` — Saturday 12:00 UTC (the parent briefing + audio)
- `/api/cron/healthcheck` — every 6h `0 */6 * * *` (NEW tonight)

### Healthchecks.io
- Account: jemelike@gmail.com (project UUID `4317c619-29e5-400f-b8de-c40d5505cd26`)
- Check: `Hero Academy heartbeat`, 6h period / 2h grace, 3 integrations attached
- Detail URL: https://healthchecks.io/checks/ec0311a8-d63a-4f89-828f-8d985dd28889/details/

### Zapier
- Catch-Hook Zap → Gmail → both parent emails
- History viewable at https://zapier.com/app/history
- Note: the Zap also receives `audio_url` in the payload now; **Bianca-side action item** if you ever want to attach the MP3 to the email (currently only linked as button): add an "Attachments" field in the Gmail step mapped to `audio_url`. Current setup links to the MP3 (clicking the button plays in browser) — works in all email clients.

---

## 5 — Hard-won lessons from this session

1. **Gmail dark mode inverts CSS `color:` but respects HTML4 `<font color>` attributes.** Wrap every text node in both. Add `<meta name="color-scheme" content="light only">` + `supported-color-schemes`. Use solid card colors (not gradients) so Gmail's inversion heuristic doesn't kick in. Build #5 fix details in `api/cron/saturday-email.js`.
2. **Supabase REST insert with `Prefer: return=minimal` returns 201 + empty body.** The `sb()` helper choked when trying to JSON.parse it. Fix: detect 201/204 + empty body and return null gracefully. (Build #8.1 fix1, commit `413f9f7`.)
3. **`CRON_SECRET` is not displayed in Vercel UI once set — store it externally before rotation.** The old value was unrecoverable; Josh saved the new one in 1Password.
4. **VPS web terminal disconnects on long commands (≥120 chars or with chained `&&`).** Workaround: short commit messages, single commands per turn. When it dies, the new tab has a fresh shell (all shell vars lost — need to repaste `CRON_SECRET`).
5. **Chrome MCP `screenshot` tool sometimes errors with `clip.scale` deserialize on HTTP (non-HTTPS) responses.** Workaround: use `get_page_text` for text content verification, or move the page to HTTPS hosting.
6. **A watchdog needs its own watchdog.** Internal cron-freshness check catches partial outages; external healthchecks.io ping catches total outages. Both needed because they fail independently.
7. **Don't claim "Saturday email fully live" without firing the real cron path.** The previous handoff said it was live; in fact it had been 401-ing silently for ~2 days because `CRON_SECRET` had drifted between Vercel and Josh's local copy. The Build #8.1 healthcheck would have caught this within 6h going forward.
8. **Parser brittleness on word problems gets resolved by signal priority, not bigger regex.** Strong-add signals override sub-verbs; sub-verbs override default-add. 16/16 test cases pass with this ordering. (Build #6 A2.1.)
9. **For ElevenLabs Flash 2.5 TTS:** A ~1000-char briefing → ~780 KB MP3 → ~1:20 audio → ~$0.05/call. Negligible at one email/week.
10. **Vercel env var changes don't auto-redeploy.** New env var only applies to deployments created AFTER. Plan env-var-first, then push code, so one deploy picks up both.

---

## 6 — Open items for next session

### Verification (cheap)
- [ ] Confirm Build #5 dark-mode fix lands cleanly in both inboxes (Bianca + Josh) — awaiting Josh's visual confirmation as of session end
- [ ] Confirm `ha_srs_queue` populates from real 2nd-miss events (need real Nigel play session)
- [ ] Confirm Daily Practice tile shows count on iPad (Nigel's device)
- [ ] Confirm Friday cumulative quiz fires and surfaces retention number

### Cleanup (5 min)
- [ ] Decide on synthetic test row in `ha_health_checks` (delete or leave; safe either way)
- [ ] Refresh `userMemories` to reflect: CRON_SECRET rotation, healthcheck cron live, healthchecks.io watchdog live, Saturday email genuinely live with audio, Build #6 A2.1 parser hardening live

### The 8 in priority order I'd push for next
1. **MUST BUILD #1 — Daily structured mission** (highest leverage, ~1 session, fixes the buffet problem)
2. **MUST BUILD #5 — Bianca as co-pilot** (the Saturday email is now premium; let her steer the loop)
3. **MUST BUILD #8.2 + #8.3 — retries + client-side error capture** (finish the observability story while it's fresh)
4. **MUST BUILD #6 — More multi-modal** (manipulatives + more skill visuals; canvas is the single biggest learning unlock)
5. **MUST BUILD #3 — Hero levels + Journey Map** (gives the journey something to be hungry for)
6. **MUST BUILD #4 verification** (confirm SRS actually populates + fold retention into Saturday email)
7. **MUST BUILD #7 — Physical world bridge** (camera + real-world quests)
8. **MUST BUILD #2 — Cross-zone coordination** (Story Lab story about a math problem he struggled with)

---

## 7 — Pickup checklist for next session

When you open the next session:

1. **Read this file in full** (it's the truth source)
2. **Check current SW version:** `curl -fsSL https://raw.githubusercontent.com/jemelike-lab/hero-academy/main/sw.js | head -1` — should be `v58` or higher
3. **Check latest commit:** `git log --oneline -5` on `/tmp/hero-deploy` — should show `a7eaab7 dark mode fix v58` at top
4. **Check Vercel deployment:** Vercel MCP `list_deployments` — top deployment should be `state: READY` with `githubCommitSha` matching latest commit
5. **Check healthcheck status:** Curl `/api/cron/healthcheck?dry_run=1` with bearer — should return `overall_status: ok` and `pinged: "skipped"` (skipped on dry_run is correct)
6. **Check what Josh wants to work on tonight** — open by asking, don't assume from this file

**If Josh wants to ship the Daily Mission (MUST BUILD #1)**: that's the highest-leverage next build. Recipe is in §2.

**If Josh wants to refine Build #5 (the email)**: dark-mode fix may still need iteration; Gmail dark-mode rendering varies across iOS/Android/web/Outlook.

**If anything seems broken**: check `ha_health_checks` for the most recent row's `overall_status` + check Zap History for recent failures.

---

_End of HANDOFF. Last updated 1:30 AM EDT Wed Jun 3, 2026._
