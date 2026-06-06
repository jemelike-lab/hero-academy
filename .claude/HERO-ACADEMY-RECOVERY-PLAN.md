# Hero Academy — Recovery Plan
_Drafted 2026-06-06. Baseline: SW v118 / deploy v119._

This is not a vision doc. It's a list of **specific gaps between what's in the repo and what's wired up**, plus the work to close them — in execution order, with done-criteria for each.

---

## What I verified before writing this

I read the live `.claude/HANDOFF.md` on `main` and probed the actual asset paths via `raw.githubusercontent.com`. The picture is much better than memory suggested, but there are concrete misses.

### Zones — current truth

| Zone | Real status | File size |
|---|---|---|
| Cauldron Café | ✅ Playable, v119 minus bug closed on device | 33 KB |
| Diner Lanes | ✅ Playable | 35 KB |
| Story Lab | ✅ Playable | 4 KB ⚠️ |
| Sound Stage | ✅ 5 rooms incl. Beat Box | 14 KB |
| Creation Studio | ✅ 4 rooms + Humphrey vision | 12 KB hub + 4 activity pages |
| **Word Tower** | 🔲 Skeleton (10 interactive markers, 9 KB) | placeholder |
| **Discovery Dome** | 🔲 Skeleton (13 markers, 7 KB) | placeholder |
| **Training Gym** | ❌ File doesn't exist (HTTP 404 on `/training-gym.html`) | missing entirely |

Story Lab being only 4 KB is suspicious — handoff says "full play" but the file is smaller than the empty placeholders. Worth a code audit before declaring it solid.

### Portraits — actual unused inventory

**Humphrey (`/assets/humphrey/`)** — the swap code in `humphrey.js:setExpression()` IS firing. All 5 expressions load:
- ✅ `humphrey_idle_512.webp` (16 KB) — actively used
- ✅ `humphrey_encouraging_512.webp` (17 KB)
- ✅ `humphrey_concerned_512.webp` (19 KB)
- ✅ `humphrey_surprised_512.webp` (21 KB)
- ✅ `humphrey_cheering_512.webp` (20 KB)
- ❌ `humphrey_smile_512.webp` — never generated (handoff notes this as "6th expression pending")

Humphrey expressions are NOT a gap. The system works.

**Ralphie (`/assets/ralphie/`)** — this is the real gap. 11 portraits sit in repo, only **4 are loaded anywhere in code**:

| Portrait | Used in code? |
|---|---|
| `ralphie_waving.webp` | ✅ index.html |
| `ralphie_thinking.webp` | ✅ |
| `ralphie_magnifying.webp` | ✅ |
| `ralphie_trophy.webp` | ✅ |
| `ralphie_cheering.webp` | ❌ unused |
| `ralphie_surprised.webp` | ❌ unused |
| `ralphie_reading.webp` | ❌ unused |
| `ralphie_sad.webp` | ❌ unused |
| `ralphie_sleeping.webp` | ❌ unused |
| `ralphie_running.webp` | ❌ unused |
| `ralphie_pointing.webp` | ❌ unused |

**7 of 11 Ralphie portraits are dead weight in the bundle** — this is the original "tons of unused images" critique, still standing 12 hours later.

---

## The plan

Six work items, ordered by ratio of (Nigel-visible impact) / (work to ship).

### 1 · Ralphie expression system — port Humphrey's pattern (1 deploy)

Build `js/ralphie.js` mirroring `humphrey.js:setExpression()`:
- Wherever Ralphie appears (index hub, hero-hall trophy room, mission card, surprise squad), wrap the `<img>` in a class-tagged container so `setRalphieExpression(name)` can crossfade-swap the src.
- 7 new behaviors unlocked: he reads while you're in Story Lab, sleeps if no activity 5+ min, runs across the screen on a streak, points to the next zone in the mission, looks sad on a wrong answer streak, cheers when you finish, looks surprised on first visit of the day.

**Done when:** Chrome MCP confirms at least 3 distinct Ralphie portraits load across a single Nigel session, verified via Network panel `?expression=` query param naming.

---

### 2 · Story Lab audit (1 small deploy, possibly zero)

Pull `story-lab.html` (only 4 KB) and verify it actually delivers a reading experience. If it's a routing-only shell that depends on a runtime module I haven't read, document that. If it's a stub miscategorized as "full play" in the handoff, demote it to placeholder and add to the build queue.

**Done when:** I can describe in one paragraph what Nigel actually does on that page, with a screenshot from Chrome MCP showing the rendered state.

---

### 3 · Cauldron Café visual upgrade — fix "flat and dull" (1–2 deploys)

The v118/v119 bug fixes the minus button. They don't fix the original critique. Real upgrades:

- **Steam from the cauldron** — Phaser particle emitter, low frequency, gives the scene life
- **Vegetable reactions** — when you add a carrot, it should *bounce* in (tween scale 0 → 1.2 → 1.0, 250ms), not just appear. Same for minus removal (shrink + fade).
- **Ralphie on-stage** — currently he's not in the Cauldron scene. Add a sprite of `ralphie_thinking.webp` peeking from the side, switching to `ralphie_cheering.webp` when a correct count is submitted.
- **Sound** — cauldron bubble loop (low volume), splash on add, pop on remove. Files don't exist yet; either generate via ElevenLabs Sound Effects API or ship CC0 from Freesound.
- **Recipe variety** — current recipes are vegetable-only. Add fruit recipes, soup recipes, dessert recipes (= more vegetable sprite variety needed, but math is the same).

**Done when:** Side-by-side video of v119 vs new version, Josh agrees it's no longer "flat and dull."

---

### 4 · Build the missing placeholder zones (3 deploys, one per zone)

Per HANDOFF.md, priority order:

**4a · Word Tower (Reading)** — Phaser game where tapped letters stack into towers. Word lists from Nigel's reading-level grade band. Wire to `ha_word_tower_attempts` for adaptive difficulty. Use Ralphie `reading.webp` as cheerleader.

**4b · Discovery Dome (Science)** — One activity to start: a "Wonder of the Day" surface. Haiku-generated fact + visual aid + 2-question check. Standards: MD MCCRS NGSS K-2. Discovery Dome currently speaks one canned fact per handoff — replace with the Wonder loop.

**4c · Training Gym (PE)** — file doesn't even exist. Build it from scratch as a movement-break zone: short timer (1–3 min), animated exercise demo (jumping jacks, wall pushups, stretches), Humphrey calls cadence. Counts toward daily mission stretch zone. **Note for Josh:** this one is best paired with the Galaxy Tab device pass since it depends on full-screen layout on the actual tablet.

**Done when:** each zone has its own `?bust=vN` Chrome MCP verification trace showing a complete session end-to-end.

---

### 5 · Galaxy Tab acceptance pass — burn down the deferred list (1 device session, not a deploy)

This has been deferred 9× per handoff. The list of unverified items keeps growing. Items still owed on-device confirmation:
- v110/v112 audio playback path
- v113 Sound Stage activities
- v114 Beat Box recording  
- v115 Sketch Lab + Animation Studio + Gallery touch
- v116b1 BACK/SAVE/frame race fix
- v116b2 camera permission flow + Stamp Studio touch drag
- v117 Humphrey vision rhythm (`DEFAULT_COOLDOWN_MS=25000`, `intervalMs=14000` are the dials)
- GIF export on mobile Chrome

This is your job, not mine — I can't drive the tablet. But I can give you a checklist file and timestamps to run through with Nigel in 20 minutes. Generate that ask when you're ready.

**Done when:** each item has a ✅ or ❌ next to it in the handoff.

---

### 6 · Build #4 SRS + weekly cumulative quiz (1 deploy)

Per HANDOFF.md, still queued. Spec is already written:
- Table `ha_srs_queue (child_id, source_table, source_item_id, leitner_box, last_reviewed_at, due_at, ease)`
- Leitner intervals 1d / 3d / 7d / 14d / 30d
- Surface as a "Daily Practice" tile on `index.html`

Wait until Word Tower / Discovery Dome are live — SRS feeds on items from those zones too, so building it first means a half-empty queue.

---

## What I'm NOT proposing

To be explicit about the rejected paths:

- **No framework migration.** Vanilla JS + Phaser is working. Don't introduce React/Vue mid-build.
- **No third-party integrations** beyond what's already there (Anthropic, ElevenLabs, Supabase, Vercel). The "integrate outside applications" line from your earlier message — I'm reading that as Humphrey-observe-style smart features, which we already shipped in v117. If you meant something specific like Khan Academy Kids or Epic Books, name it and I'll spec it separately.
- **No Humphrey 6th expression generation.** Marked open in handoff but low-leverage given 5 already work.

---

## Recommended execution order

```
Day 1:  [1] Ralphie expressions  →  [2] Story Lab audit
Day 2:  [3] Cauldron visual upgrade (deploy 1 of 2)
Day 3:  [3] Cauldron visual upgrade (deploy 2 of 2)  →  [4a] Word Tower
Day 4:  [4b] Discovery Dome  →  [4c] Training Gym shell
Day 5:  [5] Galaxy Tab acceptance pass — you + Nigel
Day 6:  [6] Build #4 SRS
```

Six work days. Roughly 8–10 deploys. Cumulative SW bump: v118 → v126ish.

---

## Open questions for Josh before kickoff

1. **Sound for the Cauldron upgrade** — generate via ElevenLabs SFX (~$ per generation) or ship from Freesound (CC0, free, slower curation)?
2. **Training Gym layout** — full screen Phaser scene like the others, or video-first with Humphrey overlay (more like Sound Stage's Beat Box room)?
3. **Story Lab** — if my audit finds it's actually a stub, do you want it rebuilt before Word Tower, or kept where it is and prioritized later?

Answer those three and I'll start on Item 1 immediately.
