# Hero Academy — Handoff

_Last updated: 2026-06-06, end of v127 deploy._

## Live state

- **Prod:** `hero-academy-jemelike-6356s-projects.vercel.app`
- **SW cache:** `hero-academy-v127`
- **Last deploy:** v127 — Explorer's Hall audio-filler hotfix. **Verified live via Chrome MCP; Galaxy Tab device test still pending.**
- **Repo:** `github.com/jemelike-lab/hero-academy`, auto-deploys from `main`
- **VPS:** `root@2.24.68.106` (Hostinger srv1641066), deploy path `/tmp/hero-deploy`
- **Supabase:** project `yofqeuguxgujgqnaejmw`, schema `ha_*` prefix
- **ElevenLabs:** Ms. Humphrey agent `agent_5901kssbzjm1e0yvd0kdwxa3r49m`, Emory voice `aNGh7D6DrhhIlad2U6Fg` flash model
- **Nigel's child_id:** `2e0e51c5-f120-4152-8aa1-041eeecc8165`

---

## Shipped this session (v120 → v127)

### v120 — Content-of-One Deploy 2: math problems in Cauldron + Wonder card on home
- **Cauldron Café:** Today's Special button → overlay with 5 AI-generated word problems from the v119 daily cron content
- **index.html:** cyan "Today's Wonder" card surfaces the daily science wonder with explanation / try-this / ask-grown-up follow-up
- Both surfaces pull from `ha_get_todays_content` RPC built in v119

### v121 — Cauldron Café wholesale visual rebuild
- **Dropped Phaser**, switched to HTML+SVG+CSS for crisper text, smoother animations, no depth-ordering bugs
- Warm wooden kitchen palette (brown shelf, copper cauldron, parchment recipe)
- Illustrated SVG veggies: carrot, tomato, potato
- Patched `/api/humphrey-observe.js` — added `CAULDRON_CAFE_BODY` for kitchen-aware comments
- **Latent bug introduced:** every Humphrey call used wrong `say()` signature (fixed in v123)

### v122 — Cauldron fresh AI recipes per visit + difficulty bump
- **NEW endpoint** `/api/cauldron-recipes.js` — Haiku 4.5, returns 5 fresh recipes per visit
- Difficulty: numbers 5-18 per ingredient (was 2-6), sums 12-30 (was max 12)
- Skill mix: 2 addition + 1 subtraction + 1 missing addend + 1 multi-step
- Personalized to Nigel's profile; localStorage anti-repeat tracking

### v123 — Critical Humphrey audio bug fix + step guidance + text-only vision + additive multi-step
- **Root cause:** `humphrey.say()` signature is `(event: string, context: object)`. v121 passed `{text, expression}` as first arg → stringified to `"[object Object]"` → no CATALOG entry → fell through to `CATALOG._default` (4 generic fillers). Every Humphrey utterance in Cauldron was these on rotation.
- All 9 call sites now use correct `(eventId, {text, expression, priority: 'high'})` with specific event IDs
- Step guidance UI: copper "Next: tap X carrots" chip + amber pulse on focused veggie card
- Vision observer text-only mode for cauldron-cafe activity (1.1s response, more specific)
- Additive-only multi-step prompt for cauldron-recipes endpoint

### v124 — Reject wrong/overage taps + singular forms + preserve recipe name caps
- Singular field per veggie (no more "1 tomatoe")
- Recipe name capitalization preserved ("The Superman's Strength Stew")
- Wrong-veggie or overage tap → red shake + no increment + Humphrey rejection line

### v125 — Cauldron Café Cooking Math loop (the pedagogical rewrite)
**Massive redesign — old loop was 0 cognitive moments per recipe (game did all the counting/adding); new loop is ~11 per recipe.**
- Veggies arrive in **bunches** in a basket on the left, not via tap-to-spawn
- Bunch derivation built around educational strategies:
  - 1-5 → solo bunch (subitization)
  - 6 → [3,3], 8 → [4,4] (doubles)
  - 9 → [5,4] (make-ten setup)
  - 10 → [5,5] (perfect ten)
  - 11-15 → [5,5,N] (teaches 10+N place value for teen numbers)
  - 16-20 → [5,5,5,N] (extra make-ten step)
- **Per-ingredient loop:** bunch arrives → "How many in this bunch?" 3-button quick-tap (correct + ±1 distractors) → carrots fly into cauldron → ten-frame fills slot-by-slot → **missing-addend bridge** ("We have 5, recipe needs 9, how many more?") → next bunch arrives → repeat
- **Ten-frame inside cauldron** — one per ingredient, multi-row for teens to visualize place value
- **Cross-ingredient bridges** between veggies ("9 carrots are in. Recipe needs 8 tomatoes. After we add them, how many total?")
- **Strategy reveal + final submit** with equation panel at end
- **Wrong-answer pedagogy:** visual count-along on basket (each veggie lights up sequentially 1, 2, 3…) + correct answer highlighted in brass for retry
- **NEW: Embedded pulsating Humphrey tab** — 64px portrait fixed top-right of scene, pulses with amber halo when she has new utterance, tap to replay TTS. Global Humphrey floater hidden on this page.
- All TTS routed through direct `/api/humphrey/tts` POST (custom `tts()` wrapper), not through global `Humphrey.say()` — avoids the `_default` filler trap from v123

### v126 — Explorer's Hall (replaces Diner Lanes for Social Studies)
**Old Diner Lanes was a Phaser bowling game with 8 hardcoded customers ordering state-stereotyped food. Replaced with a daily expedition format.**
- **NEW file** `explorers-hall.html` — museum aesthetic (deep teal + cream + brass)
- Header shows "Today's expedition" + place name + topbar passport stamp count
- Discovery card with SVG illustration (State House silhouette for Annapolis) + 2-3 sentence intro that Humphrey reads
- 3 wonder tiles (purple/emerald/amber) — tap to reveal fact + question + 3-button answer
- Wrong-answer path: red shake + Humphrey hint TTS + brass highlight on correct + retry
- Animated **passport stamp pop** on completion of all 3 wonders
- localStorage passport persistence — schema `{stamps: [{id, place, date}], lastSeen: 'YYYY-MM-DD'}`, same-day duplicate defense
- **Embedded pulsating Humphrey tab** — same pattern as v125 Cauldron
- v126 ships **one hardcoded Annapolis expedition** (Phases 1-3 + 6: departure, discovery, wonders, passport). Phases 4-5 (choice scenario, connection) deferred to v129. Haiku-generated daily content deferred to v128.
- **Router patched** in `js/app.js`: `explorer` zone → `explorers-hall.html` (was `diner-lanes.html`)
- **SW CORE updated** — `explorers-hall.html` added; `diner-lanes.html` kept in CORE for rollback safety, file remains in repo but is unreachable from UI

### v127 — Explorer's Hall audio filler hotfix
- **Root cause:** same anti-pattern as v123. Init code passed `welcomeEvent: 'welcome-explorers'` to global Humphrey, which doesn't exist in CATALOG (only Cauldron, Sketch, etc.), so fell through to `_default` → played stray `"Got it, Nigel."` filler at boot, overlapping the custom intro from the embedded tab.
- **Fix:** `audioEnabled: false` on the global Humphrey init in `explorers-hall.html`, dropped the unregistered `welcomeEvent`. Our embedded tab routes TTS directly through `/api/humphrey/tts`, so the global doesn't need audio enabled.
- Verified clean: boot fires exactly 1 TTS call (the custom intro), zero `_default` filler leakage.

---

## Zone state

| Zone | Activity | Standards | Status |
|---|---|---|---|
| Hero Hall (home) | Trophy room + Today's Wonder card | — | ✅ Live (Wonder card v120) |
| Story Lab | Reading + Today's Adventure card | CCSS 2.RL, 2.RI | ✅ Live (today card v119) |
| Cauldron Café | Math (Cooking Math loop) | CCSS 2.OA, 2.NBT | ✅ Live, full pedagogy v125 |
| Explorer's Hall | Social Studies (daily expedition) | MD MCCRS SS grade 2 | ✅ Live v126 — hardcoded Annapolis; v128 for fresh daily content |
| Sound Stage | Piano Lab, Video Theater, Beat Box, Name That Instrument, Sing It Back | MD MCCRS Music grade 2 | ✅ Live (v113-v114) |
| Creation Studio | Sketch Lab, Animation, Photo Booth, Stamp Studio | MD MCCRS Visual Arts grade 2 | ✅ Live (v115-v116) |
| Letter Lab | Handwriting practice | CCSS 2.L.1.a | ✅ Live (v107-v108) |
| Diner Lanes | (deprecated — replaced by Explorer's Hall) | — | 💤 File kept for rollback |
| Word Tower | Vocabulary | CCSS 2.L.4 | 🔲 Placeholder |
| Discovery Dome | Science | NGSS 2 | 🔲 Placeholder |
| Training Gym | Physical/health | MD MCCRS PE | 🔲 Placeholder |

---

## Open items (priority order)

1. **Galaxy Tab device acceptance test** — deferred 12+ sessions. Specifically needed:
   - v125 Cooking Math loop on touch: bunch tap-answers, ten-frame visibility, fly-in animation, step transitions
   - v127 Explorer's Hall: embedded Humphrey tab pulse + tap-to-replay, wonder tile taps, passport stamp animation rewarding feel
   - **Audio verification:** ElevenLabs TTS playback through tablet speakers — both Cauldron and Explorer's Hall route through direct `/api/humphrey/tts`; sandbox can confirm calls fire but not actual audio output
2. **v128 — Haiku-generated daily expedition** for Explorer's Hall. New endpoint `/api/expedition.js` rotating through topic buckets: Maryland history (30%), US history (25%), geography (15%), civics (15%), cultures (15%). Replaces hardcoded Annapolis. Same anti-repeat localStorage pattern as cauldron-recipes.
3. **v129 — Supabase passport persistence + home-screen passport tile**. Migration `ha_expedition_stamps` table. Visual passport book on Hero Hall home showing collected stamps.
4. **Cauldron Phase 4-5 additions** — choice scenario + cross-ingredient reasoning enhancements from the original v125 design proposal (currently only Phases 1-3 + final submit are shipped)
5. **Word Tower zone build** — needed before `word_list` payload from daily cron can surface anywhere
6. **Build #4 — SRS** — `ha_srs_queue` Leitner intervals
7. **Discovery Dome + Training Gym** — still placeholder zones
8. **Bianca preview / parent veto loop** — Content-of-One Deploy 4
9. **Ms. Humphrey 6th expression "smile"** — 5 of 6 live
10. **Saturday email v2 polish** — tighten empty-data-week tone
11. **Swing 1 (Hero Journey)** — Professor Forgetful villain, ranks, weekly boss battles
12. **Swing 2 (Humphrey Always-On)** — conversational voice mode + camera Show & Tell + read-aloud listener

---

## File map (current as of v127)

```
hero-academy/
├── index.html                          # Hero Hall hub + Today's Wonder card (v120)
├── story-lab.html                      # Reading + Today's Adventure card (v119)
├── cauldron-cafe.html                  # ~43KB, Cooking Math loop with bunches + ten-frames + embedded Humphrey tab (v125, v124 audit fixes carried forward)
├── explorers-hall.html                 # ~25KB, museum expeditions with embedded Humphrey tab (v127)
├── diner-lanes.html                    # DEPRECATED — unreachable from UI, kept for rollback safety
├── sound-stage.html, piano-lab.html, video-theater.html  # v113
├── beat-box.html, name-that-instrument.html, sing-it-back.html  # v114
├── creation-studio.html                # 4-card 2x2 hub (v115-v116)
├── sketch-lab.html, animation-studio.html, photo-booth.html, stamp-studio.html
├── letter-lab.html                     # 47 chars + digits (v107-v108)
├── hero-hall.html
├── sw.js                               # CACHE_VERSION = "hero-academy-v127"
│
├── api/
│   ├── cauldron-recipes.js             # v122 — fresh AI recipes per visit, additive-only multi-step constraint (v123)
│   ├── humphrey-observe.js             # v123 — branched by activity, text-only mode for cauldron
│   ├── humphrey/tts.js                 # ElevenLabs proxy
│   ├── humphrey/image-search.js        # Wikipedia thumbnails
│   ├── chat.js                         # page-aware Q&A
│   └── cron/
│       ├── generate-daily-content.js   # v119 — nightly Haiku
│       ├── send-saturday-digest.js
│       └── monthly-video-curation.js
│
├── js/
│   ├── app.js                          # zone router (v126: explorer → explorers-hall.html)
│   ├── humphrey.js                     # say(event, context) — CRITICAL: see Patterns
│   ├── humphrey-observer.js            # v117 — vision + dynamic comments
│   ├── daily-content.js                # v119 — client adapter
│   └── (others unchanged)
│
├── data/
│   └── nigel-profile.json              # family, friends, interests, faith
│
├── docs/sessions/
│   ├── 2026-06-06.md                   # v116-v119 (prior session AM)
│   └── 2026-06-06-part2.md             # v120-v127 (THIS session)
└── .claude/HANDOFF.md                  # this doc — truth source
```

---

## Patterns + learnings (carry forward — additions through v127)

- **`humphrey.say(event, context)` — event MUST be a string.** Passing an object stringifies to `"[object Object]"`, no CATALOG entry, falls to `_default` → 4 generic fillers ("Got it, Nigel" / "Mm-hmm" / "Sure thing" / "Okay, Nigel"). When user reports "she keeps saying the same thing" → check call signatures first. Correct: `H.say('event-id', { text: 'custom', expression: 'encouraging', priority: 'high' })`.
- **`welcomeEvent` in global Humphrey init has the same trap.** If the event isn't registered in CATALOG (e.g. `welcome-explorers` doesn't exist), init still tries to fire it and plays a `_default` filler. **Rule for new zones using the embedded tab pattern: ALWAYS pass `audioEnabled: false` on the global Humphrey init** so it can't auto-play a stray welcome that overlaps your custom intro.
- **Embedded pulsating Humphrey tab pattern (introduced v125, refined v127):** when building a new zone with active prompts/questions, embed a 64px round Humphrey portrait fixed top-right with amber pulse halo on new utterance + tap-to-replay TTS. Hide the global floater (`Humphrey.hide()`). Route all TTS through a direct `fetch('/api/humphrey/tts', ...)` wrapper, not through `Humphrey.say()`. This pattern is documented in v125 Cauldron and v127 Explorer's Hall — lift verbatim for new zones.
- **Audio chain still:** prerendered MP3 → `/api/humphrey/tts` (ElevenLabs blob) → Web Speech API → silent. When using the embedded tab pattern, we skip the prerendered MP3 step entirely and go direct to TTS.
- **Cauldron UI is add-only.** Any multi-step problem with mid-equation subtraction strands Nigel. Enforce additive-only framing in any Cauldron prompt.
- **Vision observer doesn't need an image when the activity has rich textual state.** Text-only mode is 1.1s vs 4+s and produces MORE specific responses.
- **Bunch derivation for math pedagogy:** when designing a manipulative-style math zone, splitting totals into bunches of ≤5 enables subitization, doubles, and make-ten teaching. The v125 cauldron-cafe.html `deriveBunches()` function is a reusable template.
- **Live UI testing catches what endpoint testing misses.** v123 had "1 tomatoe" cosmetic + wrong-veggie acceptance trap; v126 had the welcome-event filler. Both invisible to endpoint+HTML-marker testing. Tap-and-snapshot UI walkthrough is mandatory before declaring a deploy verified.
- **Raw GitHub CDN is often stale after a push.** Use `Vercel:list_deployments` to verify a deploy is READY by commit SHA, not raw URL content checks.
- **Vercel SSO blocks sandbox curl but `fetch()` from authenticated browser tab works.** Use Chrome MCP `javascript_exec` with `fetch()` from inside the app origin for live endpoint testing.
- **Chrome MCP `navigate` invalidates following `javascript_exec` in same batch.** Split navigation and post-load tests into separate calls with `await new Promise(r => setTimeout(r, N))` for boot.
- **AI content endpoints need pool-buffer thresholds + anti-repeat.** localStorage tracking of last 12 titles sent in payload prevents Haiku re-rolling the same names within a week. Pattern proven in cauldron-recipes; replicate for v128 expedition.
- **Verify before claiming done — UI walkthrough is the gate.** Reaffirmed every session — endpoint testing and HTML markers don't catch everything. Tap, observe, snapshot, then ship.
- **Old zone files stay in repo when deprecating.** Don't delete `diner-lanes.html` even though router skips it; SW CORE still references it for rollback path. Same will apply to any future zone replacement.
