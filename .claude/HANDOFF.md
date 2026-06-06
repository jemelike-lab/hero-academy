# Hero Academy — Handoff

_Last updated: 2026-06-06, end of v119 deploy._

## Live state

- **Prod:** `hero-academy-jemelike-6356s-projects.vercel.app`
- **SW cache:** `hero-academy-v118`
- **Last deploy:** v119 — Cauldron Café minus button tap target enlarged. **Verified working on Galaxy Tab.**
- **Repo:** `github.com/jemelike-lab/hero-academy`, auto-deploys from `main`
- **VPS:** `root@2.24.68.106` (Hostinger srv1641066), deploy path `/tmp/hero-deploy`
- **Supabase:** project `yofqeuguxgujgqnaejmw`, schema `ha_*` prefix
- **ElevenLabs:** Ms. Humphrey agent `agent_5901kssbzjm1e0yvd0kdwxa3r49m`, Emory voice `aNGh7D6DrhhIlad2U6Fg` flash model

---

## Shipped this session

### v116 batch 1 — Animation Studio race fix
- BACK/SAVE buttons labeled
- Frame storage refactored from data URLs to `HTMLCanvasElement[]` so frame switching is synchronous — fixes the disappearing-content race where the new frame drew over the previous one before its decode finished
- SW cache v113 → v114

### v116 batch 2 — Creation Studio 4-zone expansion
- **New:** `photo-booth.html` (25,981 bytes) — rear camera capture + 30 emoji stickers + brushes
- **New:** `stamp-studio.html` (22,268 bytes) — 5 themed backgrounds + 6 sticker categories with 100+ emojis
- Hub redesigned as 2×2 grid (Sketch / Animation / Photo Booth / Stamp Studio); standalone Gallery card dropped, Gallery now accessible from each activity
- 2 new Humphrey welcome events
- SW cache v114 → v115

### v117 — Humphrey actually observes
**The big shift — Humphrey can SEE what's on screen now, not just speak canned lines.**
- **New:** `/api/humphrey-observe.js` — Vercel serverless endpoint. Sends 384px JPEG of the current canvas to Claude Haiku 4.5 vision (`claude-haiku-4-5-20251001`). System prompt bans generic praise ("great job", "awesome", "amazing") and demands specific naming of visible colors/shapes/characters. Returns `{text, expression}` where expression ∈ {idle, encouraging, surprised, cheering}.
- **New:** `js/humphrey-observer.js` — client orchestrator. 25s default cooldown + 4s force gap + 14s autopilot interval. Won't speak over an already-speaking Humphrey.
- All 4 Creation Studio activities hooked:
  - **Sketch Lab:** marks strokes, observes on save
  - **Animation Studio:** marks frames, observes on save + GIF export
  - **Photo Booth:** observes immediately after capture — comments on the actual photo
  - **Stamp Studio:** marks stickers + background changes
- Static "Wonderful, Nigel!" save lines replaced with AI-generated specific feedback
- SW cache v115 → v116
- Verified: `POST /api/humphrey-observe` returns 200 from Stamp Studio + Photo Booth save flows; direct endpoint test returned "Oh, look at that unicorn with the bright purple mane standing right on the sandy beach—the sun is shining so nicely above!" in 1.65s on a synthetic beach scene

### v118 — Cauldron Café minus button (root cause)
- **Root cause:** the 160×110 `hit` zone for each veggie tile was added to the Phaser scene AFTER the `minusBg` circle, so it drew on top and intercepted every `pointerdown` — taps on minus ran `addVeggie` and the count went UP when Nigel tried to subtract
- **Fix:** `minusBg.setDepth(10)` + `minusText.setDepth(10)` puts minus above the zone in input priority; `minusBg.input.enabled = (count > 0)` toggled in `refreshVeggieBadges` so the zone reclaims the area when minus is invisible
- SW cache v116 → v117

### v119 — Cauldron Café minus tap target (real-world fix)
- **Symptom on device:** v118 was logically correct but the 32px visible minus circle was below Apple's 44px touch target minimum, so a 7-year-old finger overlap still spilled into the surrounding add-zone
- **Fix:** invisible 56px-diameter `minusHit` circle at depth 11 layered above the visible minus (depth 10) and add-zone (depth 0). `minusHit.input.enabled` gated on count > 0.
- Visual unchanged — Nigel still sees a small grey minus button, but the tappable area is now nearly double
- SW cache v117 → v118
- **Confirmed working on Galaxy Tab by Josh**

---

## Zone state

| Zone | Activity | Standards | Status |
|---|---|---|---|
| Cauldron Café | Number Lab (counting + addition through cooking) | Math 2.OA.B.2 | ✅ Full play, v119 minus confirmed |
| Diner Lanes | Explorer's Hall (Social Studies) | various | ✅ Full play |
| Story Lab | Reading | various | ✅ Full play |
| Sound Stage | 5 rooms incl. Beat Box recording | Music | ✅ Full play |
| Creation Studio | 4 rooms + Gallery, AI Humphrey across all | Art | ✅ Full play |
| Word Tower | Reading | TBD | 🔲 Placeholder |
| Discovery Dome | Science | TBD | 🔲 Placeholder |
| Training Gym | PE | TBD | 🔲 Placeholder |

### Live systems
Hero Hall trophy room · Surprise Squad characters · Daily Mission card · Manipulatives (ten-frame, count-on, subtract-from-ten) · Quests (10 seed) · Adaptive difficulty · Saturday cron email (Haiku-generated) · Monthly auto-curation cron · IndexedDB ArtGallery · **`/api/humphrey-observe` vision endpoint**

---

## What's left

### Top priority — Galaxy Tab device acceptance test
v119 just cleared. Remaining items still needing on-device confirmation (deferred 9× before, now thinning):

- v110/v112 audio playback path
- v113 Sound Stage activities
- v114 Beat Box recording
- v115 Sketch Lab + Animation Studio + Gallery touch
- v116b1 BACK / SAVE / frame race fix
- v116b2 camera permission flow + Stamp Studio touch drag
- v117 **Humphrey rhythm tuning** — if she's too talky or too quiet, dials are `DEFAULT_COOLDOWN_MS=25000` and `intervalMs=14000` in `js/humphrey-observer.js`
- GIF export on mobile Chrome

### Polish (small)
- **Tap-Humphrey-portrait → force-observe** UX so Nigel can ask "what do you think?" on demand. Wait until v117 rhythm is validated first.
- **Saturday email v2** — tighten the Haiku system prompt so empty-data weeks read as "didn't open the app" rather than "missed our scheduled session"
- **Ms. Humphrey 6th expression** — Midjourney "smile" variant (5 of 6 live, base = Variant 1 from May 30 2026 generation)

### Next features in priority order
1. **Build #4 — SRS + weekly cumulative quiz**
   - Table: `ha_srs_queue (child_id, source_table, source_item_id, leitner_box, last_reviewed_at, due_at, ease)`
   - Leitner intervals 1d / 3d / 7d / 14d / 30d
   - Surface as a Daily Practice tile on `index.html`
2. **Word Tower** — Reading placeholder → playable zone
3. **Discovery Dome** — Science placeholder → playable zone
4. **Training Gym** — PE placeholder → playable zone
5. **Phase 2 auto-curation** — `ha_video_library` Supabase table + parent-dashboard one-click approval workflow
6. **`ha_record_practice` RPC** — Piano Lab + Video Theater currently 404 silently when logging practice

---

## Key files

```
/tmp/hero-deploy/                      # VPS git working tree
  api/humphrey-observe.js              # v117, 4272 bytes
  js/humphrey-observer.js              # v117, 3910 bytes
  js/humphrey.js                       # welcome events for all activities
  js/characters.js                     # session signals, character unlocks
  js/manipulatives.js                  # ten-frame, count-on, subtract-from-ten
  js/quests.js                         # 10 seed quests
  js/today-mission.js                  # daily structured mission
  data/nigel-profile.json              # family + interests (~30% sentence personalization)
  cauldron-cafe.html                   # v119, hash 03ed6d5
  creation-studio.html                 # 4-card 2x2 hub
  sketch-lab.html
  animation-studio.html
  photo-booth.html                     # v116b2
  stamp-studio.html                    # v116b2
  sw.js                                # CACHE_VERSION = hero-academy-v118
  .claude/HANDOFF.md                   # this doc
```

---

## Patterns + learnings (carry forward)

- **Phaser display order = input priority.** Later-added interactive objects override earlier ones at the same depth. Explicit `setDepth()` is mandatory when nesting interactive children inside larger hit zones.
- **Touch targets need real-world tolerance.** 32px is below the 44px Apple minimum; for 7-year-olds go to 56px+ via invisible hit overlays. Visual + hit-area can be independent.
- **Synthetic events ≠ real touch.** Phaser's InputManager filters untrusted `dispatchEvent` calls in the Chrome MCP sandbox — real verification requires the device. Code-reading + Vercel etag confirmation is the strongest non-device check.
- **Anchor-count assertions in Python patchers catch drift first try.** `assert n == 1, label` saves cascading silent breakages — proven by the v117 `an-boot` failure which would have been a silent half-deploy without it.
- **Comments inside anchors matter.** v117 `an-boot` failed once because the anchor omitted `// Default onion toggle visible`. Always check raw file content via `python3 -c` before writing patchers for files with embedded comments.
- **Web terminal paste tolerance ~35KB**, much higher than the earlier 5KB estimate.
- **GitHub raw URLs + Vercel fetch are the fastest way to verify deploys.** No need to drive the browser when just confirming a patch landed in production.
- **Verify before claiming done.** Every build requires live UI verification after completion. Non-negotiable gate.

