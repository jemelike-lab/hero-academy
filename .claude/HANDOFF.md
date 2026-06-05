# Hero Academy — HANDOFF

**Last updated:** Late evening June 4 / early morning June 5, 2026 — after live UI verification of Build #2 (cross-zone coordination).
**Live SW:** `hero-academy-v79`
**Latest commit on `main`:** the v79 ship — `fix: explicit JSON schema in CROSS-ZONE prompt + threading audit (SW v79)` plus follow-up Supabase migration `build_2_prioritize_linked_templates_in_picker`.

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

### Deploy pattern (now proven 9× this session)
1. Claude prepares a bundle as `*.tar.gz` and presents it.
2. Josh runs `scp ~/Downloads/<bundle>.tar.gz root@2.24.68.106:/tmp/` from Mac terminal — or uses the one-line combined SCP+SSH command Claude generates.
3. Vercel auto-deploys (~60s).
4. **Claude IMMEDIATELY runs live UI verification via Chrome MCP** — navigate with `?bust=vN`, exercise the actual feature on the live site, show screenshot evidence.
5. If verification fails, ship the next bundle and repeat. "Code shipped" is NOT "feature shipped."

### Verification discipline (new standard as of this session)
Every deploy ends with live UI evidence. The mantra from Josh: *"I need you to always run a UI live site verification after each deployment. This is the true test."*

This session caught three production-shipped-but-broken bugs in Build #2 that DB-only verification would have missed entirely. See §5 for the receipts.

---

## 1 — What shipped THIS session (June 4–5, late night)

**Five bundles tonight + one direct SQL migration. All live, all verified.**

### Bundle 1 — `mic-help-v75.tar.gz` (SW v75) ✅

Granular mic-permission diagnosis. Original symptom: tapping Ms. Humphrey button said *"I cannot hear you, Nigel. Tap Allow on the microphone to try again."* — but no Allow prompt ever appeared because permission had been permanently denied at some point.

- **`js/humphrey-listener.js`** — capture DOMException `name` from `getUserMedia` rejection, cross-reference with `navigator.permissions.query({name:'microphone'})`. Returns granular code: `denied-permanent`, `denied-now`, `no-device`, `busy`, `security`, `unsupported`, `unknown`.
- **`js/humphrey-qna.js`** — on `no-mic`, show a **visible help modal** (not just audio) with detail-specific steps + retry button. Audio TTS may fail when mic is broken (same gesture path), so visible guidance is essential.

### Bundle 2 — `cross-zone-v76.tar.gz` (Build #2 v1, SW v76) ✅ (partial)

Initial cross-zone coordination ship. Schema + RPC + generator wiring + Story Lab Humphrey intro.

- **DB migration applied via Supabase MCP** (`build_2_cross_zone_struggle_thread_v2`):
  - `ALTER TABLE ha_story_templates ADD COLUMN linked_struggle_zone text, linked_struggle_concept text`
  - `DROP FUNCTION ha_get_story_templates(uuid, integer)` + `CREATE FUNCTION` with the two new columns in returns
  - `CREATE OR REPLACE FUNCTION ha_get_recent_struggles(uuid, integer)` returning last 7 days of wrong attempts (zone_id, prompt, expected, given, attempted_at) — SECURITY DEFINER, GRANT EXECUTE to anon+authenticated
- **`api/humphrey/generate-story-templates.js`** — fetch struggles via `ha_get_recent_struggles`, pass to `draftBatch`, validate + persist link fields on insert.
- **`js/story-lab.js`** — `mapServerTemplate` preserves link fields; new `maybeSpeakCrossZoneIntro()` fires Humphrey's connecting line on template pick, once per template per day, gated on `linked_struggle_concept`. New `friendlyZoneName()` maps zone_id → reading-friendly label.

### Bundle 3 — `mic-modal-v77.tar.gz` (SW v77) ✅

Mic modal copy fix. Live UI verification of v75 caught that the `denied-now` modal said *"Chrome will ask — tap Allow"* but Chrome wasn't going to ask (Permissions API was returning `'unknown'` on Android Chrome PWA, classifier landed on wrong branch).

- **`js/humphrey-qna.js`** — unified modal copy for all permission-related failures (denied-now, denied-permanent, security, unknown). Now shows BOTH paths in one message: "tap Allow if a prompt appears, otherwise tap Open mic settings". New **"Open mic settings"** button fires `window.location.href = chrome://settings/content/siteDetails?site=<origin>`. Dropped the misleading "Android Settings → Apps → Hero Academy → Permissions" path (doesn't expose mic for most Android Chrome PWA installs — Chrome holds permission at site level).

**Josh's tablet recovery path that actually worked tonight:** open Chrome browser (not PWA) → paste `chrome://settings/content/siteDetails?site=https://hero-academy-jemelike-6356s-projects.vercel.app` into address bar → Microphone → Allow → reopen PWA → mic works.

### Bundle 4 — `cross-zone-strong-v78.tar.gz` (SW v78) ✅ (partial)

Strengthened cross-zone prompt. Live UI verification of v76 showed `compliance: FAILED-haiku-ignored` — 0 of 8 templates threaded.

- **`api/humphrey/generate-story-templates.js`** — moved CROSS-ZONE THREAD section to LAST in the system prompt (after STORY THEME IDEAS, just before OUTPUT FORMAT), prefixed with `★★★ ... READ THIS CAREFULLY ★★★`. Changed wording from "weave AT MOST ONE OR TWO" to "you MUST do the following" when struggles list is non-empty. Added a full worked example showing a complete threaded template.

### Bundle 5 — `cross-zone-required-v79.tar.gz` (SW v79) ✅ FULLY VERIFIED

v78 ship still failed — Haiku now narrated struggle concepts into stories ("The Web-Maker's Gift", "The Sun's Long Journey") but still didn't tag with metadata. **Root cause: OUTPUT FORMAT schema still said `"...optional..."`** for both linked fields, contradicting the strong instruction above. Haiku trusted the schema.

- **`api/humphrey/generate-story-templates.js`** — OUTPUT FORMAT now shows TWO literal example items (one threaded with linked fields, one without) instead of a single abstract schema. All "optional" wording removed; replaced with explicit RULES: "EXACTLY ONE item MUST include both fields when struggles exist."
- **NEW: `threading_audit` field in response** — every generation now returns `{ struggles_supplied, items_threaded, threaded_titles[], compliance }` where compliance is `"ok"`, `"FAILED-haiku-ignored"`, or `"no-struggles-to-thread"`. This is the right pattern for any Haiku-driven endpoint: surface compliance to the caller so we see prompt drift immediately, not a week later.

### Direct SQL migration — `build_2_prioritize_linked_templates_in_picker` ✅

Live UI verification of v79 showed compliance OK + DB had 5 linked templates, BUT Story Lab picker still showed the 16 original seed templates (all `difficulty=1`) and buried the new linked ones (`difficulty=2`) at position 17+ in the queue. Nigel would never see them.

Applied directly via Supabase MCP (no SCP needed, SQL-only change):

```sql
ORDER BY
  i.seen_at NULLS FIRST,                          -- unseen first (was here)
  (i.linked_struggle_zone IS NOT NULL) DESC,      -- NEW: linked items surface first
  i.difficulty ASC,
  i.created_at ASC
```

After this, the picker shows linked templates at positions 1–5. End-to-end verified.

---

## 2 — Current live state

### Active SW: `hero-academy-v79`

| Feature | Status |
|---|---|
| Daily Mission (Build #1) | Live, persisted, celebration overlay works |
| Manipulatives + skill viz (Build #6 v2) | Live (v3 base-10 blocks still pending) |
| Real-world Quests v1+v2+v3 (Build #7) | Live, **STILL needs Galaxy Tab acceptance pass** |
| Parent Co-pilot dashboard (Build #5) | Live, all 4 directive types end-to-end |
| Hero Journey level + Journey UI (Build #3) | Live, Nigel at Level 4 Champion 7/15 |
| Sat email — Notes from Home + Show & Tell (Build #5 v2 + #7 v3) | Live |
| Sticky visual aid + page-aware QnA + Discovery Dome readout (SW v73) | Live |
| Number Lab problem readout + Cauldron/Diner Humphrey voice (SW v74) | Live |
| **Granular mic permission diagnosis + on-screen help modal (SW v75 + v77)** | **Live, verified Chrome MCP — modal fires correctly, Open mic settings deep link works** |
| **Cross-zone coordination Story Lab v1 (Build #2, SW v76→v79)** | **Live, FULLY VERIFIED end-to-end on the live UI — Haiku tags linked templates with `compliance: ok`, picker prioritizes them at top, Ms. Humphrey speaks the connecting line on tap, ElevenLabs Emory audio confirmed (145KB TTS blob)** |

Nigel's Hero Journey state: `aurora=3, carlo=1, shellback-squad=1, toybox-team=1, webly=1` → 7/15 → Level 4 Champion.

Story template pool state (as of this writing): 35+ unseen templates with 5 carrying linked-struggle metadata, all linked to recent Discovery Dome wrong-answers (spider vibrations, sun's heat travels through space, rice roots breathe underwater).

---

## 3 — MUST BUILD scoreboard (refreshed)

| # | Build | Status | Notes |
|---|---|---|---|
| **1** | Daily structured mission | ✅ **Live** | DB-persisted, celebration overlay works |
| **2** | Cross-zone coordination | ✅ **Live, FULLY VERIFIED** | Shipped tonight after 4 iterations (v76 → v79 + RPC migration). See §1 |
| **3** | Hero levels + Journey Map | ✅ **Live** | Nigel at Level 4 Champion, 7/15. Surprise Squad characters loaded |
| **4** | SRS + Friday cumulative quiz | 🟡 **Built, not verified live** | Engine + tables + `review.html` exist. Three unverified items: (a) does `ha_srs_queue` populate from real 2nd-misses? (b) does Friday quiz fire? (c) is retention number wired into Sat email? |
| **5** | Bianca as co-pilot | ✅ **Live** | Parent dashboard + 4 directive types + Notes-from-Home Sat email block + Show & Tell highlights all shipped |
| **6** | Multi-modal manipulatives | 🟡 **v2 live, v3 pending** | `countOnLine` + `subtractFromTenLine` shipped. **Base-10 blocks for `place_value` + 2-digit ops not yet built** |
| **7** | Physical-world bridge (camera quests) | 🟡 **Live, unverified on device** | All coded. **Galaxy Tab acceptance pass deferred 4× now** |
| **8** | Observability | 🟡 **Partial** | 8.1 healthcheck cron live. 8.2 (cron retries) + 8.3 (client-side error capture) sequenced but not confirmed shipped. Worth a verify pass |

**Score:** 4 of 8 fully done (#1, #2, #3, #5), 3 of 8 substantially built but unverified or v-N-incomplete (#4, #6, #8), 1 of 8 device-dependent (#7).

---

## 4 — Pending verification / acceptance items

### 🔴 Galaxy Tab acceptance pass — DEFERRED 4× NOW (TOP PRIORITY)
This one device session covers acceptance for ALL of: Build #7 v2 camera, SW v73 sticky aid + page-aware QnA + Discovery Dome readout, SW v74 Number Lab readout + Cauldron/Diner Humphrey voice, SW v75/v77 mic modal, AND Build #2 cross-zone Humphrey connecting line. Nothing else should ship until this is done.

**Tablet test script (one sitting, ~6 minutes):**
1. **Mic**: Tap Ms. Humphrey button → should grant cleanly now (you fixed it via chrome://settings tonight). If it ever blocks again in the future, the v77 modal shows the recovery path with Open mic settings button.
2. **Camera quest**: Real-world Quest tile → SHOW AND TELL → "I'm back!" → Allow camera → confirm rear cam → snap → Humphrey reaction
3. **Discovery Dome**: tap a card → confirm fact + question both read aloud
4. **Number Lab**: confirm problem reads aloud on every problem render
5. **Cauldron Café + Diner Lanes**: start level 0 each → confirm Emory voice (not robotic system TTS)
6. **Sticky aid**: ask Humphrey "what is this?" mid-card → image persists past speech, dismisses on tap
7. **Cross-zone Build #2 (NEW)**: Open Story Lab → confirm linked templates appear at top of picker (look for ☀️ Sunbeam, 🕷️ Lexi's Web-Builder, 🕸️ Zylo's Secret Web, ☀️ Skylar's Heat Wave, 🌾 Rice Paddy Adventure) → tap one → confirm Ms. Humphrey says *"I remember something from Discovery Dome — [concept]. This story has that in it…"* in Emory's voice → slot-filling proceeds normally

### 🟡 Saturday June 7 email watch
- Show & Tell block renders with Nigel's real quest data
- Streak badge appears if any quests this week
- Notes from Home consumes any active parent directives
- Empty-data weeks read as "Nigel didn't open the app", not "missed a scheduled session"

### 🟡 Build #4 (SRS) live verification — see §3

### 🟡 Build #8 (observability) status check — confirm 8.2 cron retries + 8.3 client error capture shipped or sequence them

---

## 5 — Live UI verification — what tonight's three catches prove

This is the receipt for why DB/code verification alone is not enough. All three would have shipped as "✅ done" without driving the live UI:

1. **v77 → v78**: After v76 shipped Build #2 v1, the live API response audit showed `compliance: FAILED-haiku-ignored` — 0 of 8 templates had linked metadata, despite the prompt asking for it. DB/schema were correct, code path ran, but Haiku ignored the instruction. Visible only by exercising the generator and reading the audit.

2. **v78 → v79**: After v78 ship, Haiku now WROTE stories around struggle concepts (titles: "The Web-Maker's Gift" 🕷️, "The Sun's Long Journey" ☀️) but STILL didn't tag with metadata. Root cause: OUTPUT FORMAT schema in the prompt still said `"...optional..."` — contradicting the strong instruction. Visible only by reading actual Haiku output vs the audit count.

3. **v79 → RPC migration**: After v79 ship with `compliance: ok` (2 of 8 threaded, fields populated in DB), the live Story Lab picker still showed the original 16 seed templates and buried the new linked ones at position 17+ due to `difficulty ASC` tiebreaker. Visible only by opening Story Lab and counting cards on screen.

**Each catch took 2–5 minutes to fix once seen.** Without the live UI loop they would have lived in production unnoticed until Nigel sat down and never got the moment.

---

## 6 — Key technical learnings (this session)

### Live UI verification catches what code/DB verification cannot
Three production-shipped-but-broken bugs caught in one session. See §5.

### Haiku prompt drift is real and silent
Haiku will gravitate to the strongest/freshest section of a prompt. If section A says "MUST" and section B (further down or last) says "optional", section B wins. Workarounds that worked:
- Move critical instructions LAST in the system prompt (Haiku weights recency)
- Use literal JSON examples in OUTPUT FORMAT, not abstract schemas with "..."
- Remove ALL "optional" wording from required fields
- Show TWO concrete example items (one with feature, one without) so Haiku has a copyable shape
- Surface compliance to the API caller via a `threading_audit` field so drift is observable immediately

### Picker priority is part of the feature, not a UI detail
Cross-zone coordination wasn't done when the DB had linked templates and Haiku tagged them correctly — it was done when Nigel actually SEES them in the picker. The `difficulty ASC` tiebreaker buried them at position 17+. Rule for future similar features: any "smart" or "personalized" item should jump to the front of the queue via an explicit `(feature_flag IS NOT NULL) DESC` clause in the picker RPC, not rely on existing sort order.

### Permissions API on Android Chrome PWA is unreliable
`navigator.permissions.query({name:'microphone'})` returns inconsistent values across Android Chrome versions when the site is running as an installed PWA. Sometimes `'denied'`, sometimes `'unknown'`, sometimes never settles. Don't branch UX exclusively on its result. The right pattern: show BOTH "Chrome may ask — tap Allow" AND "If no question appears, open mic settings" in one modal, plus a deep-link button to `chrome://settings/content/siteDetails?site=<origin>`.

### Android PWA mic permission lives in Chrome site settings, not Android app settings
"Android Settings → Apps → Hero Academy → Permissions" path does NOT expose Microphone for most Android Chrome PWA installs — Chrome holds the permission at the site level. Recovery is always via Chrome browser → site settings → microphone. The v77 modal removed the misleading Android-app-settings path.

### Direct Supabase migrations bypass the SCP loop for SQL-only changes
The picker priority fix was applied directly via Supabase MCP `apply_migration` — no tarball, no SCP, no Vercel deploy, no SW bump. Pattern: if the change is SQL-only, ship it via Supabase MCP and verify on live UI. Code+SQL changes go through the SCP loop together. Saves a deploy round-trip.

### Bundle-deploy commit prefix pattern
One-line combined SCP+SSH command worked smoothly all 5 ships tonight:
```
scp ~/Downloads/<bundle>.tar.gz root@2.24.68.106:/tmp/ && ssh root@2.24.68.106 'cd /tmp/hero-deploy && git fetch origin main -q && git reset --hard origin/main -q && tar xzf /tmp/<bundle>.tar.gz && git add -A && git commit -m "<msg>" && git push'
```

### Chrome MCP top-level `await` doesn't work in `javascript_tool`
Wrap any awaited code in `(async () => { ... })()`. Otherwise: `SyntaxError: await is only valid in async functions`.

### Chrome MCP cache-bust pattern proven
`?bust=vN` (incrementing) on every navigation reliably forces fresh SW activation. After SCP, always use a new bust suffix.

---

## 7 — Open items for next session

### Priority order
1. **Galaxy Tab acceptance pass** for the consolidated tablet checklist in §4 (4× deferred — top priority)
2. **Watch Saturday June 7 email** rollout (Notes from Home + Show & Tell + streaks)
3. **Verify Build #4 (SRS)** end-to-end
4. **Verify Build #8** observability components
5. **MUST BUILD #6 v3** — base-10 blocks for `place_value` + 2-digit ops
6. **Remaining placeholder zones** — Sound Stage, Training Gym, Creation Studio still stubs
7. **Story arc / Surprise Squad character progression** narrative wiring (infrastructure loaded, not wired)
8. **Personalization audit across zones** — Number Lab folds Nigel's profile into word problems; verify Cauldron / Diner / Discovery get same treatment
9. **Ms. Humphrey 6th expression** — idle/smile variant to complete the set

### NEW going forward — verification discipline
Every deploy now ends with live UI verification via Chrome MCP. Required evidence:
- Screenshot showing the user-facing result
- Console / debug log confirming the code path ran
- DB confirmation if the feature persists state
- For Haiku/AI endpoints, a compliance audit field in the API response

"Code shipped" is not "feature shipped." Treat every claim that a feature is done with the same skepticism Josh used tonight when pushing back on Build #2.

---

## 8 — Tool / resource inventory (refreshed)

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

### Build #2 (cross-zone) reference

| | |
|---|---|
| Source RPC | `ha_get_recent_struggles(p_child_id uuid, p_days int default 7)` — returns up to 8 wrong attempts |
| Picker RPC | `ha_get_story_templates(p_child_id, p_n)` — sorts unseen + linked first |
| Story template columns | `linked_struggle_zone text`, `linked_struggle_concept text` (both nullable) |
| Generator endpoint | `POST /api/humphrey/generate-story-templates` body `{child_id, target_count, force}` |
| Audit field | `threading_audit: { struggles_supplied, items_threaded, threaded_titles[], compliance }` in response |
| Compliance values | `"ok"` / `"FAILED-haiku-ignored"` / `"no-struggles-to-thread"` |
| Humphrey intro fn | `maybeSpeakCrossZoneIntro(tpl)` in `js/story-lab.js`, once-per-template-per-day via localStorage key `ha_storylab_xzone_<id>_<date>` |
| Zone-name mapping | `friendlyZoneName(zone_id)` in `js/story-lab.js` |

### Verification-only test commands

```js
// Fire the generator and read threading audit (from page console on live URL)
const r = await fetch('/api/humphrey/generate-story-templates', {
  method:'POST', headers:{'content-type':'application/json'},
  body: JSON.stringify({ child_id:'2e0e51c5-f120-4152-8aa1-041eeecc8165', target_count:8, force:true })
});
await r.json();
```

```sql
-- See which recent templates have linked metadata
SELECT title, linked_struggle_zone, linked_struggle_concept, created_at
FROM ha_story_templates
WHERE child_id = '2e0e51c5-f120-4152-8aa1-041eeecc8165'
  AND linked_struggle_zone IS NOT NULL
ORDER BY created_at DESC LIMIT 10;
```

---

## 9 — Cumulative file diff for SW v75 → v79

### SW v75 — granular mic diagnosis
| File | Change |
|---|---|
| `sw.js` | `v74` → `v75` |
| `js/humphrey-listener.js` | Capture `err.name` + `navigator.permissions.query`, classify to granular code, expose `lastMicFailureReason()` + `queryMicPermissionState()` |
| `js/humphrey-qna.js` | On `no-mic`, show visible help modal with detail-specific copy; original speech still fires as fallback |

### Build #2 v1 (SW v76) — initial ship
| File | Change |
|---|---|
| `sw.js` | `v75` → `v76` |
| `api/humphrey/generate-story-templates.js` | Fetch `ha_get_recent_struggles`, pass to draftBatch, validate + persist link fields |
| `js/story-lab.js` | `mapServerTemplate` preserves link fields; `maybeSpeakCrossZoneIntro` + `friendlyZoneName` added; called from `startTemplate` |
| DB migration | `build_2_cross_zone_struggle_thread_v2`: add columns + recreate picker RPC + create `ha_get_recent_struggles` RPC |

### SW v77 — unified mic modal
| File | Change |
|---|---|
| `sw.js` | `v76` → `v77` |
| `js/humphrey-qna.js` | All permission-failure paths show same unified copy (works for `denied-now`, `denied-permanent`, `security`, `unknown`); new "Open mic settings" button deep-links to `chrome://settings/content/siteDetails?site=<origin>`; dropped Android Settings → Apps path |

### Build #2 v2 (SW v78) — strengthened prompt
| File | Change |
|---|---|
| `sw.js` | `v77` → `v78` |
| `api/humphrey/generate-story-templates.js` | CROSS-ZONE section moved to LAST in system prompt with `★★★ READ THIS CAREFULLY ★★★` prefix; "MUST" wording; full worked example |

### Build #2 v3 (SW v79) — explicit JSON schema + audit
| File | Change |
|---|---|
| `sw.js` | `v78` → `v79` |
| `api/humphrey/generate-story-templates.js` | OUTPUT FORMAT shows TWO literal JSON example items (threaded + unthreaded); all "optional" removed; new explicit RULES block; response now includes `threading_audit { struggles_supplied, items_threaded, threaded_titles, compliance }` |

### Build #2 final — picker prioritization (SQL-only, no code/SW)
| Change |
|---|
| `ha_get_story_templates` ORDER BY adds `(linked_struggle_zone IS NOT NULL) DESC` between `seen_at NULLS FIRST` and `difficulty ASC` so freshly-linked templates surface at top of picker. Applied via Supabase MCP migration `build_2_prioritize_linked_templates_in_picker`. |

---

*End of handoff. Last update: 2026-06-04 ~23:35 ET — Build #2 verified end-to-end on the live UI with screenshot evidence + Humphrey audio chain confirmed.*
