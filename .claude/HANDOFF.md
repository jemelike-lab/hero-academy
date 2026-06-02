# Hero Academy — Session Handoff (end of June 2, 2026)

---

## 1 · What shipped this session

### v37 (commit `1782764`, deployed `dpl_EmWZFsgd7d8jtZ4aDRXH76w33aZK`)
**Saturday email cron + telemetry + Today's Mission card.**

New files:
- `vercel.json` — Saturday `0 12 * * 6` cron → `/api/cron/saturday-email`
- `api/cron/saturday-email.js` — pulls 7d of `ha_*` data from Supabase (service-role REST), drafts parent briefing via Claude Haiku 4.5 in Ms. Humphrey voice, POSTs to Zapier webhook. `?dry_run=1` skips the Zapier send. Auth via `Bearer $CRON_SECRET`. Deterministic fallback if Haiku fails.
- `api/mission/today.js` — Haiku-generated daily mission (warmup / stretch / win) from zone progress, recent zones, homework_due flag. Strict JSON output, deterministic fallback.
- `js/telemetry.js` — client wrapper for `ha_start_session`, `ha_record_attempt`, `ha_end_session`, `ha_unlock_character`. Auto-starts a session by URL match; ends on `pagehide` via fetch `keepalive`.
- `js/today-mission.js` — home-page mission card; caches per day in `ha_mission_<date>`; detects completion via `zoneProgress` delta or `ha_mission_visited_<date>` keys.
- `css/today-mission.css` — card styling.

Patched:
- `index.html` — added `<section id="todayMissionCard">` after hero, plus CSS link and init script.
- `js/app.js` — `openZoneModal` enterBtn → `TodayMission.markVisited(zone.id)` before navigation.
- `js/number-lab.js`, `js/discovery-dome.js`, `js/word-tower-reading.js` — surgical `Telemetry.recordAttempt(correct, …)` calls on handleCorrect/handleWrong/handlePass/handleMiss.
- All 8 game HTMLs — `<script src="/js/telemetry.js">` added.
- `sw.js` — v36 → v37, CORE array extended.

### v38 (commit `d6d75ac`, deployed `dpl_51CtxmdYH6BkMMk7eM2sLw1YZDwc`)
**Story Time listener VAD + Mission card title contrast + empty-transcript guard.**

Patched:
- `js/humphrey-listener.js` — silence-based VAD via Web Audio `AnalyserNode`. After a minimum 2.5s of recording, if RMS stays below 0.018 for 1.5s straight, the MediaRecorder auto-stops. Hard `maxMs` ceiling still applies as backup. Kid now reads at his own pace; Ms. Humphrey only decides he's done after sustained silence, not on a hard timeout. New `opts.vad = { enabled, minRecordMs, silenceEndMs, rmsThreshold }` for tuning.
- `js/story-time.js` — empty-transcript guard. If STT returns nothing or < 3 chars, re-prompt *"I didn't quite catch that — try once more, a bit louder?"* and don't count the attempt or fall through to the "tricky sentence" failure path.
- `css/today-mission.css` — `.tm-eyebrow` was `#1f2937` (dark navy) on a 16%-opacity gradient over the dark page → invisible. Now `#ffd147` (gold) with text-shadow. Card surface bumped 16/10/10 → 28/20/18. `.tm-hint` switched to light translucent so the footer line is readable too.
- `sw.js` — v37 → v38.

### Saturday email pipeline — LIVE end-to-end

```
Sat 12:00 UTC (8am ET DST / 7am ET standard)
  ↓
Vercel cron → /api/cron/saturday-email
  ↓ (Bearer $CRON_SECRET)
Supabase REST (service_role) — pulls 7d of ha_sessions, ha_attempts,
                                ha_topic_mastery, ha_character_unlocks
  ↓
Claude Haiku 4.5 (claude-haiku-4-5) — drafts briefing in Ms. Humphrey voice
  ↓
POST → https://hooks.zapier.com/hooks/catch/27395227/4bruass/
  ↓
Zap 366816761 (published) — Webhooks Catch Hook → Gmail Send Email
  ↓
📬 bianca.parker92@gmail.com + jemelike@gmail.com
```

Real test confirmed: `HTTP/2 200`, `"zapier":"ok (200)"`, email landed in both inboxes.

**First automatic fire:** Saturday June 6, 2026, 12:00 UTC.

---

## 2 · Current live state (as of end of session)

### Production
- **Live URL:** `hero-academy-jemelike-6356s-projects.vercel.app`
- **Latest deployment:** `dpl_51CtxmdYH6BkMMk7eM2sLw1YZDwc` (v38, commit `d6d75ac`, action=push)
- **Service Worker:** `hero-academy-v38`

### Vercel env vars (all Production + Preview, all Sensitive)
| Key | Source | Added |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic console | 2d ago |
| `ELEVENLABS_API_KEY` | ElevenLabs | 3d ago |
| `SUPABASE_URL` | `https://yofqeuguxgujgqnaejmw.supabase.co` | this session |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | this session |
| `CRON_SECRET` | `openssl rand -hex 32` (regenerated mid-session) | this session |
| `ZAPIER_WEBHOOK_URL` | `https://hooks.zapier.com/hooks/catch/27395227/4bruass/` | this session |

> ⚠️ `CRON_SECRET` was regenerated late in the session. The Mac shell variable that exists from
> `CRON_SECRET=$(openssl rand -hex 32) && echo -n "$CRON_SECRET" \| pbcopy && …`
> matches Vercel's stored value. **It will be gone when the Mac terminal restarts.**
> If you need to re-fire the cron from terminal in a future session, regenerate again
> (Vercel marks the key Sensitive — value is unrecoverable after save).

### Supabase (`yofqeuguxgujgqnaejmw`, us-east-1)
- Tables: `ha_children` (1 row, Nigel `2e0e51c5-f120-4152-8aa1-041eeecc8165`), `ha_standards` (46), `ha_topics` (20), `ha_sessions` (0), `ha_attempts` (0), `ha_topic_mastery` (0), `ha_character_unlocks` (0), `ha_daily_summary` (0).
- Writes via `SECURITY DEFINER` RPCs: `ha_start_session`, `ha_record_attempt`, `ha_end_session`, `ha_unlock_character`. Anon cannot touch tables directly.
- **Telemetry tables are still empty** — Nigel hasn't played a real session since v37 deploy. First play will populate `ha_sessions` + `ha_attempts`.

### Zapier
- Zap **366816761** (personal folder, Josh Emelike, Pro plan), **Published**.
- Trigger: Webhooks by Zapier → Catch Hook. Webhook URL: `https://hooks.zapier.com/hooks/catch/27395227/4bruass/`.
- Action: Gmail → Send Email (OAuth'd as `jemelike@gmail.com`).
- Field map (data pills from trigger):
  - **To** → `{{to}}` pill (the payload's `to` field)
  - **From** → `jemelike@gmail.com`
  - **From Name** → `Ms. Humphrey (Hero Academy)`
  - **Reply To** → `{{reply_to}}` pill
  - **Subject** → `{{subject}}` pill
  - **Body Type** → `html` (NOT plain — critical)
  - **Body** → `{{html}}` pill

### Live zones (playable)
- **Cauldron Café** (Number Lab / math) — Phaser 3.70, counting + addition
- **Diner Lanes** (Explorer's Hall / social studies) — Phaser 3.70, bowling + US geography
- **Word Tower** (literacy) — read-aloud single-word sessions, Haiku phonetic assessor
- **Story Time** (reading) — 3-sentence decodable passages generated by Haiku, sentence-level read-aloud
- **Discovery Dome** (science) — 32 NGSS cards, reuses number-lab chassis
- **Story Lab** (writing) — MadLib-style narrative builder
- **Hero Hall** — trophy room

### Placeholder zones (not yet built)
- Sound Stage, Training Gym, Creation Studio (per HANDOFF predecessor)

---

## 3 · Known issues / open V2 polish (in priority order)

### 🔴 High — needs verification next session

**P1. Listener VAD tuning unverified.** The defaults I picked are educated guesses; a real Story Time session with Nigel is needed to validate. If still cutting him off or not stopping when he's done, the three dials in `js/humphrey-listener.js` around line 167:

| Symptom | Dial |
|---|---|
| Still cuts mid-sentence | `silenceEndMs` 1500 → 2000–2500 |
| Won't stop when he's done | `silenceEndMs` → 1000, or `rmsThreshold` 0.018 → 0.025 |
| Cuts off if he hesitates at the start | `minRecordMs` 2500 → 3500 |

**P2. Telemetry validation.** Confirm `ha_sessions` + `ha_attempts` actually populate the next time Nigel plays a real game. Look at Supabase `ha_sessions` and `ha_attempts` table counts — should be > 0 after one session. If they don't populate, debug the `js/telemetry.js` auto-start (URL-match logic) and the SECURITY DEFINER RPC grant.

**P3. Haiku Saturday-email prompt tone.** Current empty-data briefing reads like a private tutor checking in about missed scheduled appointments ("we didn't meet", "reconnect next week"). The voice should be "Nigel didn't open the app this week, let's get him back into it" — Ms. Humphrey is the *in-app* tutor, not a calendar-bound tutor. Tighten the system prompt in `api/cron/saturday-email.js`. ~5 min change, one redeploy.

### 🟡 Medium — visible to Josh but not blocking

**P4. Today's Mission card not visually tested by Josh with intent.** Title contrast fix landed in v38, but I haven't seen Josh confirm "this looks right" with a real play-through. The mission generation logic (`/api/mission/today.js`) is also unverified end-to-end — Haiku draft may need iteration on warmup/stretch/win selection.

**P5. v37 deploy delivered Daily Mission card on home page** but no version of it has been screenshot-tested against the live page on iPad (where Nigel uses it). Worth checking on iPad's actual screen size (the @media (max-width: 480px) styles).

**P6. Mission card "Story Time" entry shown with ✅ checkmark in screenshots** — verify the completion detection works correctly. The card detects via `zoneProgress` delta OR `ha_mission_visited_<date>` keys.

### 🟢 Low — backlog

- 6th Ms. Humphrey expression: **cheering** (5 live: idle / encouraging / concerned / surprised / cheering — wait, double-check; per memory notes the 6th needed is "cheering" but 5 already include it. Memory may be stale, audit on next session.)
- Word Tower advancement: currently stuck at consonant-digraph level 3; add Level 4 (CVCe / silent-e words) when Nigel masters level 3.
- Suno music tracks to wire in once downloaded.
- Hero avatar customizer for Nigel.
- `walkthrough()` functions for remaining Number Lab math skills (the 2-strike rule needs problem-specific walkthroughs).

---

## 4 · What's next — priorities for next session

### Day 1 work (any order)
1. **Real Story Time session with Nigel** — validates VAD tuning. Tweak the three dials if needed.
2. **Tighten Haiku Saturday-email prompt** — make empty-data path read as "didn't open the app" not "missed our session." One edit to `api/cron/saturday-email.js` system prompt, one redeploy.
3. **Verify telemetry pipeline** — after Nigel plays one session, check Supabase for `ha_sessions` / `ha_attempts` rows.
4. **Inspect Daily Mission card on iPad** — does it render correctly? Are the warmup/stretch/win selections useful?

### Bigger pushes (pick one)
- **Vision Gap #2 (was deferred):** parent dashboard. Saturday email gives the weekly briefing; the dashboard would let Bianca/Josh see in-progress data anytime. Live read of Supabase `ha_*` tables (RLS would need to be set up for parent role since current writes are via SECURITY DEFINER).
- **Hero avatar customizer.** Lets Nigel pick his hero look — cape color, mask style, etc. Persists via `localStorage` initially, later sync to a `ha_children` profile JSON column.
- **6 months of curriculum content.** Goal-state of the project: a year of homeschool material across all COMAR subjects. Need a content authoring loop (probably Haiku-assisted authoring tool).

---

## 5 · Key technical learnings from this session

For anyone (Claude or human) picking this up next:

### Zapier (UI automation)
- The Zap editor uses **Slate.js** for field input. Typing `{{` in a field does **not** trigger autocomplete. The reliable patterns:
  - Click the **"Add a field mapping"** button (the `+` icon next to each field) → picker opens → click the matching pill option.
  - OR focus the field and type `/` (Zapier's inline shortcut to open the data picker).
- Inserted pills render in the DOM as `{{=gives["<step_id>"]["<field>"]}}` text inside the contenteditable. That's Zapier's underlying expression syntax. Don't try to type it raw — it doesn't get parsed back into a pill.
- The **Done button** in lesson games and the **Continue button** in Zapier editor both run `triple_click` poorly because Slate intercepts. Use `End` + `Backspace × N` to clear a Slate field if needed.
- The Zap editor's React Flow canvas needs the tab **focused and visible** (not 0×0 viewport) — earlier session failed because the tab was backgrounded.

### Vercel (UI automation)
- The "Add Environment Variable" dialog has a `<input>` for key and a `<textarea>` for value. Both are React-controlled. Use the React-aware native setter:
  ```js
  var setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', {bubbles:true}));
  el.dispatchEvent(new Event('change', {bubbles:true}));
  ```
- The **"Redeploy"** button shows a confirmation modal — need to click twice (button → modal's confirm). Adding an env var does NOT auto-trigger redeploy; click Redeploy manually.
- The kebab menu on individual env var rows does NOT respond reliably to programmatic clicks. To edit an existing env var value: hand off the 3-click flow to Josh.
- `CRON_SECRET` (and all env vars marked "Sensitive") are unrecoverable after save. Always print them once at generation time, OR be prepared to regenerate.

### Hostinger VPS terminal
- Programmatic input into the xterm.js terminal via Claude in Chrome **still does not work** (per prior handoff). The reliable pattern remains: Josh-pastes-from-Mac OR scripts run via SSH from Mac.
- For deploys: package files as `tar.gz` (e.g. 11 KB for v38), provide a self-contained bash script that SCPs + runs, Josh executes from Mac terminal.

### Service worker cache busting
- A new SW version (e.g. v37 → v38) installs in background. The auto-reload-on-activate logic in `js/sw-register.js` is supposed to reload the page on first activation. But verification against the SW from automation needs explicit cache clearing:
  ```js
  var regs = await navigator.serviceWorker.getRegistrations();
  for (var r of regs) await r.unregister();
  var keys = await caches.keys();
  for (var k of keys) await caches.delete(k);
  // then navigate
  ```
- On iPad PWA: close-and-reopen the PWA after a deploy to force the new SW.

### Bash sandbox constraints
- Bash network allow-list does NOT include `hooks.zapier.com`, `*.vercel.app` — so direct curl tests of the live endpoint from this sandbox fail. Use Claude Zapier MCP's `webhooks_by_zapier_post` action to fire arbitrary HTTP POSTs (it can take any URL, custom headers, JSON body — useful for triggering Zap test payloads from this side).
- `api.github.com` and `github.com` ARE allowed — `git clone --depth 1` works fine. Don't try to push from sandbox (no creds).

### Sensitive data handling
- Claude does not type API key values or secrets into UI forms. Pattern: pre-fill key names (left side), Josh types values (right side).
- When the user has copied a secret to clipboard (e.g. via `pbcopy`), prompt Josh to do the paste himself in the target UI.

---

## 6 · Tool/resource inventory

| Resource | Identifier |
|---|---|
| Repo | `github.com/jemelike-lab/hero-academy` |
| Live URL | `hero-academy-jemelike-6356s-projects.vercel.app` |
| Vercel projectId | `prj_oqgpbeK3B8E4t69aV8AcNdLp6sPw` |
| Vercel teamId | `team_fASanR2j8wd8bhOUYS07f3NL` |
| Supabase project | `yofqeuguxgujgqnaejmw` |
| Supabase URL | `https://yofqeuguxgujgqnaejmw.supabase.co` |
| Supabase publishable key (client) | `sb_publishable_Cigt6z_S1YTSvChOi5E7tA_t1H_nNRI` |
| Nigel `child_id` | `2e0e51c5-f120-4152-8aa1-041eeecc8165` |
| VPS | Hostinger `srv1641066`, IP `2.24.68.106`, deploy path `/tmp/hero-deploy` |
| Zap (Saturday email) | id `366816761`, hook `https://hooks.zapier.com/hooks/catch/27395227/4bruass/` |
| Cron schedule | `0 12 * * 6` UTC (Sat 8am ET DST / 7am ET standard) |
| Ms. Humphrey ElevenLabs agent | `agent_5901kssbzjm1e0yvd0kdwxa3r49m` |
| Ms. Humphrey voice (Emory) | `aNGh7D6DrhhIlad2U6Fg`, model `eleven_flash_v2_5` |
| Parent emails | `bianca.parker92@gmail.com`, `jemelike@gmail.com` |

---

*End of handoff. Last update: 2026-06-02 ~02:00 UTC (10pm ET Mon June 1).*
