# Hero Academy — Honest Audit & Back-to-Drawing-Board Handoff
**Date**: May 31 2026, evening · `main` @ `83a1f83`
**Author**: Claude (the assistant)
**Status**: Functional gap acknowledged. Pausing feature work. This doc is the new source of truth.

---

## 0. Read this first

Earlier session notes claim a lot of features "work" because automated browser instrumentation confirmed `play()` was called or events fired. That instrumentation cannot tell whether:
- Audio actually reaches a speaker
- The voice sounds the way Nigel needs it to
- A 7-year-old understands what's happening on screen
- The experience feels like a teacher is present

The user (Nigel's dad) tested on a real Mac and reported a meaningfully broken experience. I did a fresh live audit of the homepage and Number Lab. **This doc supersedes the prior `.claude/HANDOFF.md`. Treat earlier "verified" claims as suspect until re-tested.**

The goal of the next phase is not "more features" — it's **make the existing experience feel like an actual tutor sitting with Nigel.** Less code shipped, more verification, more design.

---

## 1. What actually works (re-verified May 31 evening)

These are confirmed working from live browser audit:

- **Word Tower zone routing** — homepage card → modal → ENTER ZONE → `word-tower.html` loads
- **Number Lab zone routing** — same flow, loads correctly
- **Hero Hall zone routing** — same flow, loads correctly
- **Word Tower mastery loop** — CVC Words can be completed end-to-end, mastery celebration fires
- **Number Lab worked example** — shows correctly, GOT IT button reveals the problem
- **Service Worker version bumping** — when user clears SW, new code loads correctly (verified v19)
- **TTS endpoint** — `POST /api/humphrey/tts` returns 200 with audio/mpeg blob
- **Humphrey portrait** — loads `humphrey_idle_512.webp` correctly on all pages
- **Text bubble system** — Ms. Humphrey's speech bubble shows correctly with custom text
- **Audio unlock flow on subsequent gestures** — after a few clicks, audio plays on real events

## 2. What is BROKEN (audit findings, May 31)

### CRITICAL — Pretends to be a game when it isn't (user's primary complaint)

**Bug A.1: Placeholder zones are indistinguishable from real games**
- Discovery Dome, Sound Stage, Training Gym, Creation Studio, Story Lab all show:
  - Same modal styling as Number Lab and Word Tower
  - Fake percent progress (Discovery showed 30%, Creation 30%, Story Lab 15%)
  - Same `ENTER ZONE` button styling
  - Same "Today: 15 min" stat
- A 7-year-old cannot tell these from real zones until AFTER they tap ENTER ZONE.

**Bug A.2: Clicking ENTER ZONE on a placeholder grants fake rewards**
- Each click runs `completeSession(zone)` in `app.js` `openZoneModal()` (the `else` branch)
- This increments `state.zonesCompletedToday` (currently observed: 9)
- Adds fake progress to `state.zoneProgress[zone.id]` (Discovery went 30% → 45% in one click)
- Shows a "coming soon!" speech bubble that flashes briefly and disappears
- No clear signal that nothing happened. To Nigel, clicking around looks productive.

**Bug A.3: Today's Challenge counter never caps**
- "Complete 3 training zones to unlock a reward!" — bar shows **8/3** then **9/3** as I clicked
- `state.zonesCompletedToday` increments freely past 3, gradient bar stays half-filled
- No "reward unlocked" state. The challenge is meaningless.

**Bug A.4: `state.zoneProgress` has phantom entries with no game backing**
- Live state had `creation: 30, discovery: 30, writing: 15` even before audit
- These zones have no actual gameplay — the progress comes from clicking the placeholder ENTER ZONE
- Numbers shown to Nigel are LIES — they don't represent real skill mastery

### HIGH — Ms. Humphrey isn't actually responsive

**Bug B.1: Call button audio race condition**
- Tapping the "Ms. Humphrey" call button on a fresh page load:
  - ✅ Triggers `say('intro', {text})` — verified in instrumentation
  - ✅ Shows the text bubble correctly
  - ❌ **Does NOT play audio** — only the silent unlock WAV plays, the TTS blob never fires
- Root cause: my `audioUnlocked` gate (`if (!state.audioUnlocked) return;`) blocks the audio because `audioUnlocked` is set async (after the silent play() promise resolves), but `say('intro')` fires synchronously inside the same click handler. At gate-check time, the flag is still `false`.
- Subsequent clicks work (flag is true by then) but the FIRST attempt is silent.
- This is why the user reports "she doesn't answer when you call" — they tapped the call button on fresh load, heard nothing, gave up.

**Bug B.2: Ms. Humphrey is reactive, not proactive**
- She only speaks on these events: zone-enter, correct-answer, wrong-answer, streak-3/5, mastery, homework-assigned, homework-done, character-unlocked
- She is silent during the actual work — Nigel staring at a problem, reading a sentence, thinking
- There is no "I notice you're stuck" prompt
- There is no idle prompt after 15-30 seconds without input
- She has an `idle-too-long` catalog event but the idle watcher is not wired up in any game page
- Result: Ms. Humphrey feels like a chime, not a teacher

**Bug B.3: Scaffold + call button not wired in Cauldron Café and Diner Lanes**
- Number Lab was fixed today to call `Humphrey.say('try-again', {text: walkthrough})` on second-strike scaffold
- Cauldron Café and Diner Lanes have the same broken pattern as Number Lab had this morning:
  - Scaffold shows local text card with no audio
  - Call button (`humphreyBtn`) only adds a `speaking` CSS class, never calls `Humphrey.say()`
- These were never patched.

### MEDIUM — State and UX

**Bug C.1: Number Lab shows "Ralphie's Cauldron Café" promo banner at top**
- The orange/pink banner appears above the worked example
- Unclear purpose — it's not a step, it's not a result, it's a sidebar promo for another game
- Distracts from the lesson; competes with the actual problem for attention

**Bug C.2: "TODAY: 15 min" is hardcoded everywhere**
- Every zone modal says "Today: 15 min" with no actual time tracking
- It's a lie cosmetically (no timer is running)
- Nigel may think the game knows when he's been playing — it doesn't

**Bug C.3: `state.arenaUnlocked` is set to true but no Arena exists**
- localStorage shows `arenaUnlocked: true`
- No UI references this — probably an old feature flag from removed code
- Suggests state schema drift

**Bug C.4: Number Lab next-skill auto-advance is brittle**
- After mastering `add_within_10`, the next skill is `subtract_within_10`
- Subtraction worked example loaded correctly, but the user has to mentally context-switch each time
- No "Great work, here's what's next" bridge — just a NEXT button

### LOW — Cosmetic and polish

- Welcome bubble "Welcome back!" from Ralphie fires before the user interacts (only the audio is gated now, the bubble still flashes)
- Today's Challenge bar gradient looks half-full even when 9/3 (broken visual feedback)
- Hero Hall has a NEW badge but 0/5 characters unlocked — `NEW` doesn't reflect reality
- Some zone card images have low contrast against the dark background

## 3. Design gaps — not bugs, choices that hurt the experience

These aren't "fix this line of code" — they're "we need to think about what the experience should be."

### D.1: Ms. Humphrey has no continuous presence
She speaks then goes silent. A 7-year-old needs:
- A voice asking "What are you thinking?" when they pause
- An offer of help ("Want a hint?") rather than waiting for failure
- Acknowledgment of effort, not just correctness ("You're really trying!")
- Closing remarks at the end of a session ("Great work today, Nigel!")

### D.2: The lesson loop has no narrative arc
Current flow: problem → answer → mastery → next problem. There's no story, no character growth, no progression Nigel can feel beyond a percentage bar.

Compare to Khan Kids / Lingokids / similar: they wrap math problems in a story ("Help the dragon count its gold coins!"). Hero Academy has Ralphie but he doesn't narrate the lessons.

### D.3: Reward shape is wrong
Currently coins + a "skills mastered" list. For a 7-year-old:
- Coins should buy something visible — accessories for Ralphie, room decorations, mini-pet
- Mastery should unlock concrete things — character cards in Hero Hall, new zones, harder skills
- Currently coins go up but Nigel can't spend them on anything

### D.4: Five of nine zones are aspirational
Discovery Dome, Sound Stage, Training Gym, Creation Studio, Story Lab — these show but have no game. Better to hide them entirely OR mark them clearly as "coming soon" with a different visual treatment (greyed out, lock icon, no progress bar, no ENTER ZONE button — instead "Notify me!").

### D.5: Homework system is technically working but emotionally invisible
Tue/Thu auto-creates 10-problem homework. Rollover carries forward. But:
- No "Mom can see this" framing — bianca.parker92@gmail.com is the audience, Nigel never knows
- No visual representation of "this is for your teacher/mom"
- The homework card shows on the homepage but feels like just another zone

## 4. The vision (what it SHOULD feel like)

A 7-year-old opens Hero Academy on his iPad. Ms. Humphrey smiles, says **"Hi Nigel — I missed you! Ready to try some math today?"** in her actual warm voice. He taps yes. She walks him through a problem, asking what he sees, offering hints if he's stuck for more than 10 seconds, celebrating when he gets it. She remembers what he's worked on. She notices when he's tired and suggests a break. Each session ends with her saying **"Nice work today, Nigel. Your mom is going to be proud."**

That's the bar. We are not there.

## 5. Inventory of code & assets (current state)

### Pages (all live on Vercel)
| Page | Status | Notes |
|---|---|---|
| `index.html` | Live | Homepage with 9 zone cards, 5 are placeholders |
| `number-lab.html` | Live, has real game | Math problems, scaffolding, mastery flow |
| `word-tower.html` | Live, has real game | Reading: CVC → CVCe → Sight Words |
| `cauldron-cafe.html` | Live, has Phaser game | Cooking-themed math (alternate UI) |
| `diner-lanes.html` | Live, has Phaser game | Word problems / logic |
| `hero-hall.html` | Live, no game | Trophy room — characters unlock from gameplay |
| `discovery-dome` | **No page** | Click placeholder grants fake progress |
| `sound-stage` | **No page** | " |
| `training-gym` | **No page** | " |
| `creation-studio` | **No page** | " |
| `story-lab` | **No page** | " |

### Key JS files
| File | Purpose | Known issues |
|---|---|---|
| `js/app.js` | Homepage logic, zone modal, homework | Phantom zoneProgress, no completion cap |
| `js/number-lab.js` | Math game logic | Promo banner; setupHumphrey race |
| `js/humphrey.js` | Ms. Humphrey widget + audio chain | Audio unlock race (call button first click) |
| `js/humphrey-integration.js` | OLD ConvAI — removed from page includes but file still in repo | Should be deleted |
| `js/characters.js` | Surprise Squad data for Hero Hall | OK |
| `js/math-skills.js` | Math curriculum data | OK |
| `sw.js` | Service Worker (cache v19) | OK |
| `api/humphrey/tts.js` | Vercel TTS proxy | Voice tuned: stability 0.50, style 0.45, speed 0.85 |

### Infrastructure
- **GitHub**: `jemelike-lab/hero-academy` on `main`
- **Vercel**: auto-deploys on push, ~5-8s build
- **VPS for SCP staging**: `2.24.68.106` (Hostinger srv1641066), path `/tmp/hero-deploy/`
- **Supabase**: project `yofqeuguxgujgqnaejmw` (us-east-1), `ha_*` schema, SECURITY DEFINER RPCs — wired but telemetry not verified
- **ElevenLabs**: voice Emory `aNGh7D6DrhhIlad2U6Fg` (flash model)
- **Email recipients** for future Phase 5: `bianca.parker92@gmail.com` (Nigel's mom), `jemelike@gmail.com`

### Today's commits (May 31 — included for traceability, not a "what works" list)
| Commit | What was claimed | Re-audit status |
|---|---|---|
| `dfd4502` | `?simulate=tue&progress=N` | Works ✅ |
| `67d996e` | SW v11 | n/a |
| `e42f04a` | Word Tower MVP | Works ✅ |
| `ed315a2` | Phase 2.6 rollover + tower direction | Works ✅ |
| `93db8f7` | Hero Hall polish | Works ✅ |
| `b33b9da` | Audio chain fix (TTS blob plays directly) | Works for non-first-gesture |
| `2dd21f6` | Strip HTML in scaffold | Works ✅ |
| `81aec8b` | Audio unlock on first gesture | **Race condition unresolved** (call button) |
| `3782d0a` | Voice retune + audioUnlocked gate | Voice change confirmed; gate created Bug B.1 |
| `0412033` | Voice tuning v1 (mellow) | Superseded |
| `83a1f83` | `pump()` after `mount()` to drain stale welcome | Works ✅ |

---

## 6. Proposed back-to-drawing-board plan

A phased approach. Each phase ends with a real test on Nigel's actual device, with the user, before moving on.

### Phase A — Stop the bleeding (highest priority)

Estimated: 1 short session.

1. **Hide or mark placeholder zones** — pick one approach:
   - A) Remove them from the zone grid entirely until they have a game
   - B) Render them with a "Coming soon!" badge, no progress bar, no ENTER ZONE button, just a "Notify me!" link
2. **Fix `state.zonesCompletedToday` to cap at challenge target** and not increment from placeholder clicks
3. **Remove phantom `zoneProgress` entries** (creation, discovery, writing) and add a state migration to clean up existing localStorage
4. **Fix call button race condition** — set `state.audioUnlocked = true` synchronously inside the unlock listener, not in the `.then()` callback. The user gesture itself is the unlock; the WAV is just to "warm up" the audio element. This will let the first call button tap actually trigger her voice.
5. **Remove Number Lab Cauldron Café promo banner** (or move it off the lesson page)
6. **Delete the unused `js/humphrey-integration.js`** file from the repo entirely

Done = Nigel can tap any zone without being lied to about progress, and the call button works on first tap.

### Phase B — Make Ms. Humphrey feel present

Estimated: 2-3 sessions.

1. **Wire idle watcher in all games** — after 20s without input, she asks "How's it going, Nigel? Want a hint?"
2. **Wire scaffold + call button audio in Cauldron Café and Diner Lanes** (same pattern as Number Lab today)
3. **Add session-end goodbye** — when Nigel returns to the homepage or closes the tab, she says "Nice work today, Nigel."
4. **Add per-skill intros** — when a new skill starts, she briefly says what they're going to learn ("Today we're going to count backwards — it's like adding, but the other way!")
5. **Expand catalog with more line variants** — currently 1-3 per event; aim for 5-8 so she doesn't repeat herself
6. **Pre-render the 20 most common lines** as static MP3s to skip the TTS round-trip for instant playback

Done = Ms. Humphrey speaks naturally throughout a session, not just at key moments.

### Phase C — Make rewards real

Estimated: 2-3 sessions.

1. **Coin shop** — Nigel can spend coins on Ralphie accessories or room decorations
2. **Hero Hall unlocks tied to real milestones** — first Word Tower mastery unlocks a character, first multiplication problem unlocks another, etc.
3. **Daily streak visualization** — a calendar or chain showing consecutive days played
4. **Weekly progress for mom** — start of Phase 5 (Saturday email briefing)

Done = Coins, characters, and mastery have visible consequences Nigel can feel.

### Phase D — Curriculum expansion (only after A/B/C feel right)

1. New zone games (pick ONE at a time, ship complete before starting next)
2. Multiplication / division in Number Lab
3. Reading comprehension in Word Tower
4. Discovery Dome science quizzes

---

## 7. Working agreements going forward

To avoid the gap between "I shipped it" and "it actually works for Nigel":

1. **Before claiming anything works, the user tests on the actual device.** No more "verified" based only on Claude in Chrome instrumentation.
2. **Cap session scope to one thing.** Today shipped 11 commits across 4 features; that's how things slipped.
3. **Audit after each phase, not just at the end.** Re-test the 5 things that should still work, not just the new thing.
4. **Don't add new zones until existing ones are right.** Quality > quantity.
5. **The HANDOFF doc gets updated honestly** — what works, what doesn't, what's untested. No marketing language.
6. **Service Worker is a frequent source of stale state.** Every session should start with "unregister SW + clear caches" on Nigel's device before testing.

---

## 8. Quick-reference technical context (for next session)

### Audio chain (verified flow)
1. User taps anywhere → `setupAudioUnlock` listener fires → silent WAV plays (in v19, `state.audioUnlocked` is set in `.then()` — **needs to be set synchronously**)
2. `Humphrey.say(event, ctx)` → queued
3. Queue worker: `pump()` → `speak(utterance)` → text bubble shown
4. Gate check: `state.cfg.audioEnabled && !isMuted() && state.audioUnlocked` → proceed to audio
5. `playAudio()` → `tryPrerendered()` (404s) → `tryTTS()` (fetch blob, `new Audio(blobUrl)`, `play()`) → `tryWebSpeech()` fallback

### Service Worker pattern
- `sw.js` declares `CACHE_VERSION` constant
- On change to any cached file (HTML/JS/CSS), bump version
- On install, precaches CORE files; on activate, deletes all other caches
- Cache-first strategy — old SW serves stale until tab closes
- **Always bump SW version when changing client files** or returning users get stale code

### Deploy workflow (current)
1. Edit files locally (Claude in `/home/claude/wire`)
2. Validate with `node -c <file.js>`
3. `present_files` for download
4. User downloads, SCPs to VPS (`scp file root@2.24.68.106:/tmp/hero-deploy/path/`)
5. Claude commits + pushes from VPS terminal
6. Vercel auto-deploys
7. Verify via clear-SW + reload

### State key
- `localStorage['hero_academy_state_v1']` — main game state
- `localStorage['ha_humphrey']` — Humphrey mute persisted state
- `localStorage['ha_homework_<YYYY-MM-DD>']` — daily homework
- `sessionStorage['ha_simulate']` — homework simulation flag

---

## 9. Open questions for the user

- **Placeholder zones**: hide them or mark them clearly? (Phase A.1)
- **Coin shop**: do we want a shop in v1, or save it for v2? (Phase C.1)
- **Visual design for "coming soon" treatment** — do you want me to mock something up or do you want to design it?
- **Curriculum priority**: which is more important next — more math (multiplication?), more reading (comprehension?), or filling out the 5 empty zones?
- **iPad testing**: are we testing on a specific iPad model? iOS Safari has stricter autoplay than Mac Safari — we may need to re-verify audio there separately

---

End of doc. Treat the above as the working truth. Earlier optimistic claims in chat or in prior HANDOFF.md should be considered superseded.
