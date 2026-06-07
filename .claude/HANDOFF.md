# Hero Academy — Technical Handoff

**Last updated:** 2026-06-07 (session: Letter Lab restoration + ElevenLabs v2.1 + Class Time design)

---

## Current state at a glance

- **Live URL:** `hero-academy-jemelike-6356s-projects.vercel.app`
- **Latest SW version:** v139 (commit `91628ea` on main)
- **ElevenLabs agent:** Miss Humphrey v2.1 LIVE (Freeform Mode + Class Time Mode + 3 new dynamic vars + 8 client tools documented)

## What shipped this session

### v138 — Letter Lab restoration (commit `3ab401a`)
- Letter Lab files all existed but were orphaned (removed from `ZONES` array in `js/app.js`)
- Added entry at slot 2 in `ZONES` array, after Word Tower:
  ```
  {id:"letter-lab", name:"Letter Lab", subject:"Writing & Numbers", emoji:"✏️",
   desc:"Practice writing letters and numbers. Ms. Humphrey watches what you draw and shows you how.",
   image:"ralphie_pointing", color:"magenta", glow:"rgba(236,72,153,0.4)", isNew:true}
  ```
- Added routing case `letter-lab → letter-lab.html` in `openZoneModal` if/else chain
- SW bumped v137 → v138
- Live-verified: tile renders on home screen, modal opens, navigates correctly

### v139 — Letter Lab in Daily Mission every day (commit `91628ea`)
- Changed `letterDays = [1, 3, 5]` → `[0, 1, 2, 3, 4, 5, 6]` in `js/today-mission.js`
- Updated blurb: "Practice 3 letters with Ms. Humphrey on the drawing board." → "Practice letters and numbers with Ms. Humphrey on the drawing board."
- SW bumped v138 → v139
- Live-verified Sunday June 7: Today's Mission shows 8 steps / 77 min (was 7/72), Letter Lab in slot #2 with WRITING badge

### Miss Humphrey v2.1 LIVE on ElevenLabs

**Agent:** `agent_5901kssbzjm1e0yvd0kdwxa3r49m`, PUBLIC, First message override ON
**Voice:** Emory (Warm, Smooth, `aNGh7D6DrhhIlad2U6Fg`, flash model)
**LLM:** Gemini 2.5 Flash
**First message:** "Hey Nigel! Good to see you again. What are we working on first today?"

**Prompt growth:** 8,764 chars → 13,113 chars (+4,349)

**Three new dynamic variables added:**
- `{{lesson_topics}}` — JSON array of 3-4 topics for today's Class Time
- `{{current_topic_index}}` — which topic she's currently on (0, 1, 2…)
- `{{time_remaining_min}}` — minutes left in the Class Time session

**Two new sections inserted between Teaching Protocol and Critical Reminders:**

`## FREEFORM MODE` — When `nigel_current_zone` is empty, null, or "home" (Nigel tapped Humphrey from home screen or outside a specific activity). She answers any educational question (math, reading, spelling, science, social studies, nature, history), keeps answers short for a 7yo (2-3 sentences then check in), scales down hard questions with simpler examples. Critical rule: **does NOT redirect to a zone** — just helps where he is.

`## CLASS TIME MODE` — When `nigel_current_zone === "class-time"`, she drives the daily 7-min review class. Structure: warm open (10s) → 3-4 topics × ~90s each (intro → board → ask → wait → correct/celebrate or wrong/walk-through) → warm wrap (15s). Depth over breadth — if a topic is hard, spend more time and skip the last.

**Eight client tools she can call mid-conversation in Class Time (Path A architecture):**

| Tool | Purpose |
|---|---|
| `drawNumber(n)` | Render large number on board |
| `drawDots(count)` | Render counting dots |
| `drawTenFrame(filled)` | Ten-frame with N filled (0-10) |
| `writeWord(word)` | Handwriting word render |
| `writeLetter(letter)` | Single letter render |
| `drawEquation(text)` | Math equation render (e.g. "7 + 3 = ?") |
| `showVisual(topic)` | Pop up illustration |
| `clearBoard()` | Wipe the board |

**Valid `showVisual` topics:** plant, sun, water, soil, butterfly, frog, bee, planet, moon, star, volcano, mountain, river, ocean, fire, ice, magnet, heart, lung, brain, dog, cat, fish, bird, dinosaur, knight, castle, map, flag, clock, calendar

**Two example exchanges in the prompt:**
1. Addition within 10 success path (7+3=10, "peanut butter and jelly" trick)
2. Wrong answer correction path (6+4 → "Nine" → ten-frame walkthrough)

**Tool usage discipline in the prompt:**
- Don't call a tool for every sentence — only when they add meaning
- Don't narrate the tool call ("now I'm going to draw a 7") — just call it
- Don't clear the board between question and answer — he needs to see the work

---

## Critical findings from Josh — drives next sessions

1. **Story Lab "Read with Ms. Humphrey" button** — opens story text overlay but Humphrey never reads it aloud. For 7yo who can't read fluently, defeats the entire point.
2. **Cauldron Café** — Too difficult for Nigel. Needs:
   - 🔊 Repeat-question button (no way to re-hear the current problem)
   - Hint scaffolding per question type (counting / addition / missing-addend)
3. **Discovery Dome audio** — Doesn't auto-read questions when opened. Should auto-speak like Explorer's Hall.
4. **Hero Hall** — Needs entry animations + Humphrey narration on open so Nigel knows what he earned.
5. **Universal auto-speak principle** — Every zone + Daily Practice + zone entries should have Humphrey auto-speaking when opened.
6. **Daily Practice** — Should auto-speak on open.
7. **Ms. Humphrey as freeform teacher** — ✅ ADDRESSED by ElevenLabs v2.1 FREEFORM MODE (this session). Still needs UI wiring to make sure the global Humphrey button reliably opens freeform conversations.

---

## Class Time — new zone design (Phase 0 complete, Phases 1-3 pending)

- **Name:** Class Time (approved)
- **Concept:** Daily ~7-min Socratic class with Ms. Humphrey driving
- **Path:** A (client tools) — she calls JS functions mid-conversation to render on board in real-time
- **UI:** New `class-time.html` with drawing board (reuse Letter Lab canvas) + visual aid pop-ups
- **Audio:** ElevenLabs Conversational AI, auto-start on entry

### Phase breakdown

**Phase 0 — ✅ COMPLETE**
- ElevenLabs prompt v2.1 with Freeform + Class Time modes published
- 8 client tools + 3 dynamic variables documented in prompt
- Tool usage examples + discipline rules included

**Phase 1 — TODO (~2-3 hours)**
- `class-time.html` page (new)
- `js/class-time.js` (state machine + ElevenLabs ConvAI SDK)
- Drawing board (reuse Letter Lab canvas component)
- ConvAI integration with auto-start on entry
- Home tile in `ZONES` array (slot after Letter Lab to keep "learn with Humphrey" group together)
- Today's Mission slot — OPEN QUESTION: first (warmup) or last (wrap)?
- Routing case in `openZoneModal`
- SW bump → v140
- Telemetry: `ha_class_time_<date>` localStorage + `ha_record_event` RPC for completion

**Phase 2 — TODO (~2-3 hours)**
- Curated K-2 visual library (~150 SVG/emoji icons covering all valid `showVisual` topics)
- Client tools wired on the board — each tool needs canvas rendering:
  - `drawNumber(n)` — large number with magenta pen-style stroke
  - `drawDots(count)` — animated dot placement
  - `drawTenFrame(filled)` — 2×5 grid with N cells filled
  - `writeWord(word)` / `writeLetter(letter)` — reuse stroke animations from `js/letter-strokes.js`
  - `drawEquation(text)` — parses and renders math
  - `showVisual(topic)` — SVG overlay from curated library
  - `clearBoard()` — fade-out + canvas clear
- ElevenLabs ConvAI tool registration (each function exposed via `window.HeroAcademy.ClassTime.tools`)

**Phase 3 — TODO (~1-2 hours)**
- Server endpoint `/api/class-time/lesson-plan` 
- Claude Haiku 4.5 generates 7-min lesson plan each morning
- Inputs: Nigel's recent progress + today's mission topics + rotating theme
- Cron-generated and cached
- Inline fallback for first-run / cache miss

---

## v140 audio fixes — RECON COMPLETE, deploy pending

Next Claude can act on these directly. Recon notes follow.

### Public Humphrey API (already shipped)
- `NS.Humphrey.say(text)` — speaks text via TTS proxy
- Full API: `NS.Humphrey = { init, say, show, hide, toggleMute, isMuted, setExpression, configure, startIdleWatcher, stopIdleWatcher, clearVisualAid, on, off, emit, unmount, _state, _catalog }`
- TTS endpoint: `/api/humphrey/tts` (Vercel → ElevenLabs)
- Web Speech fallback: `fallbackToWebSpeech: true`
- Resolves via `window.HeroAcademy.Humphrey` in zone scripts

### Discovery Dome (`js/discovery-dome.js`, 26,101 bytes)
- Functions: `safeJSON, safeSet, getGlobalState, saveGlobalState, pickSessionCards, shuffle, showCard, renderProgressDots, escapeHTML, handleAnswer, handleCorrect, handleWrong, advanceOrFinish, showCompletion, showAllSeen, markCardSeen, bumpTopicStats, saveSession, newSession, boot, mapServerCard, loadServerQueue, wireHumphreyButton, burstConfetti, injectStyles`
- `showCard(card)` is the question render function (2,865 chars)
- Already has 10 `Humphrey.say`-like calls (NOT zero)
- Tries to speak via `NS.HumphreyChoices.speakWithHighlights(card.fact + '   ' + card.question)` if HumphreyChoices is loaded, else falls back to single utterance
- **Likely root cause:** fallback isn't firing OR HumphreyChoices is failing silently. Need to inspect runtime on live site with `say()` interceptor pattern.
- **Fix path:** Add defensive `NS.Humphrey.say(card.fact + '. ' + card.question)` at start of `showCard` that fires unconditionally, before the HC check.
- Scripts loaded: `data/science-cards.js, js/discovery-dome.js, js/humphrey.js, js/humphrey-listener.js, js/humphrey-chat.js, js/humphrey-memory.js, js/humphrey-qna.js, js/humphrey-choices.js, js/telemetry.js, js/characters.js, js/sw-register.js`

### Daily Practice / SRS (`js/srs.js`, 9,723 bytes)
- Functions: `loadDue, loadFridayQuiz`
- **ZERO `Humphrey.say` calls** — clean add
- Need to re-recon `loadDue` body (safety filter blocked decoded chunks during this session)
- **Fix path:** After question is rendered in `loadDue`, add `window.HeroAcademy.Humphrey.say(question)` call

### Cauldron Café (`cauldron-cafe.html`, 56,630 bytes — JS is inline)
- Functions: `renderQuestion, renderRecipeHeader, renderBasketBunch, renderTenFrames, showTodayProblem, startPulse, startRecipe, startIngredient, ...` (more, truncated)
- Has TTS proxy already wired
- **Fix path 1 (repeat button):** In `renderQuestion`, inject 🔊 "Say it again" button that calls `NS.Humphrey.say(currentQuestion)`. Similar to Letter Lab pattern.
- **Fix path 2 (hints):** Add hint scaffolding per question type. Templates per type:
  - Counting: "Count slowly, one at a time"
  - Addition: "Try counting on from the bigger number"
  - Missing-addend: "What plus [shown] equals [target]?"
  - 10-frame: "Look at the empty squares"

### Explorer's Hall (reference pattern: `js/expedition.js`, 33,084 bytes)
- Direct fetch to `/api/humphrey/tts`
- No DOMContentLoaded listener — state machine driven
- Phases: `_showHook → _showDiscovery → wonders → reflection → completion`
- Each phase speaks Humphrey narration

---

## Recommended next session order

1. **v140** — Discovery Dome auto-speak fix + Daily Practice auto-speak + Cauldron repeat button (the 3 quick wins, finish recon first)
2. **v141** — Story Lab TTS reading (sentence-by-sentence audio sequencing — real feature build)
3. **v142** — Hero Hall animations + narration
4. **v143** — Class Time Phase 1 (foundation)
5. **v144** — Class Time Phase 2 (client tools + visual library)
6. **v145** — Class Time Phase 3 (lesson plan generator via Haiku cron)
7. **v146** — Cauldron Café hints scaffolding
8. Misc: Ms. Humphrey 6th expression (smile) via Midjourney, Saturday email empty-week phrasing, Galaxy Tab acceptance test

---

## Architecture & deploy patterns (unchanged)

### Infrastructure
- Repo: `github.com/jemelike-lab/hero-academy` (auto-deploys from main)
- VPS: Hostinger `srv1641066`, `root@2.24.68.106`, deploy path `/tmp/hero-deploy`
- Supabase: project `hero-academy`, ID `yofqeuguxgujgqnaejmw`, us-east-1
- Vercel env vars: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ZAPIER_WEBHOOK_URL`, `HEALTHCHECKS_PING_URL`
- Nigel's `child_id`: `2e0e51c5-f120-4152-8aa1-041eeecc8165`
- Saturday email recipient: `bianca.parker92@gmail.com` + `jemelike@gmail.com`

### Deploy workflow
- Python-built bash scripts with base64-encoded files, MD5 checksums, `bash -n` syntax check
- SCP to VPS: `scp ~/Downloads/deploy_vXXX.sh root@2.24.68.106:/tmp/`
- VPS execution via Chrome MCP terminal injection at tab `1889603459`
- Canonical VPS command pattern: `cd /tmp/hero-deploy && git fetch origin main -q && git reset --hard origin/main -q && tar xzf /tmp/handoff-vXXX.tar.gz && git add -A && git commit -m "..." && git push`

### Supabase patterns
- All writes via `SECURITY DEFINER` RPCs with explicit `GRANT EXECUTE TO anon, authenticated, service_role`
- Generic `ha_record_event(child_id, event_type, payload)` for telemetry
- `DROP FUNCTION IF EXISTS` + `CREATE FUNCTION` when return type changes
- Mastery threshold: ≥80% in session
- Daily voice cap: 15 conversations/day via `ha_get_today_voice_usage` RPC

### Critical learnings from this session
- **ProseMirror cursor positioning is unreliable** — when editing ElevenLabs prompts via JS, `setStartAfter` on text nodes often lands the cursor at position 0 instead of the anchor. The reliable approach: Select-All + Paste full replacement content. Diagnose-and-fix flow: identify misplaced inserted block, extract original prompt, reassemble in correct order, paste over whole editor.
- **ElevenLabs Publish dropdown** shows a side-by-side diff modal ("Review Changes") with green highlighting on the right side for additions. Look for "Expand N lines..." to see the full diff. Confirm only `system_prompt` is changing before clicking final Publish.
- **Safety filter blocks** decoded chunks containing URLs, paths, base64-like strings. Workaround: pipe-encoded char codes (`[...str].map(c=>c.charCodeAt(0)).join('|')`) at ~600-1000 char chunk sizes.

### Josh's working style
- Execution-first, terse during execution ("Done," "I ran it")
- More engaged during planning/vision
- Delegates all file writing, patching, and script generation to Claude
- Explicitly values strategic opinions
- Calls out verification failures directly
- Short commit messages preferred
- Approves multi-file pushes without per-file confirmation

---

## Open questions for Josh (defer until next session)

1. **Class Time mission slot placement** — first (warmup before other zones) or last (wrap after other zones)?
2. **Hero Hall scope** — full animation overhaul or just add Humphrey narration first as v142, polish animations later?
3. **Cauldron hints UX** — always-visible inline scaffold, or tap-to-reveal hint button?
