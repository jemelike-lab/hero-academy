# Hero Academy — Session Handoff
**As of**: May 30 2026 · `main` @ `2c70c74`

## Where we are

- Live: https://hero-academy-jemelike-6356s-projects.vercel.app — all current deploys Ready · Production
- SW cache: `hero-academy-v8`
- Phase 2 v0.2 (Humphrey voice in games) and Phase 2.5 (twice-weekly homework) both shipped today
- Branch `main` is clean; HEAD matches `origin/main`

## Today's commits

| Commit | Phase | What |
|---|---|---|
| `0d730b3` | 2 v0.2 | `Humphrey.say()` wired into Number Lab, Cauldron Café, Diner Lanes |
| `64fb596` | 2.5 | Twice-weekly homework feature (Tue/Thu, 10 problems, localStorage progress, Humphrey voice on assign + done) |
| `2c70c74` | docs | `CLAUDE.md` + `.claude/WORKFLOW.md` (mandatory deploy-verify rule) |

## Verified vs unverified

### Verified
- Homework card renders correctly in partial (4/10) and done (10/10) states (mock-state injection in DevTools)
- `node -c` passes on `js/humphrey.js`, `js/app.js`, `js/number-lab.js`
- All deploys Ready · Production on Vercel
- Service worker cache `hero-academy-v8` reachable; old caches deleted cleanly

### Not yet verified — needs real gameplay or next Tue/Thu
- Live audio of new voice events (zone-enter, streak-3/5/10, wrong-answer, mastery-achieved, homework-assigned, homework-done)
- Tue/Thu homework auto-activation in production
- Increment hook firing on correct answers during a real Number Lab session
- Mastery + streak flow on Cauldron Café and Diner Lanes (needs full playthrough)
- Streak-vs-mastery timing — kid hits mastery, should hear ONLY the mastery line (no streak-10 + mastery overlap). Watch when Nigel plays.

---

## Next phase: Ms. Humphrey expressions

### Goal
Six portrait variants so Ms. Humphrey's face matches her voice across every event.

### The six expressions

| Expression | When it fires (per CATALOG entries already in `js/humphrey.js`) |
|---|---|
| `idle` | Default, between events |
| `smile` | `welcome`, `zone-enter` |
| `encouraging` | `correct-answer`, `streak-3/5/10`, `homework-assigned` |
| `concerned` | `wrong-answer`, `try-again` |
| `surprised` | `level-start`, `character-unlocked` |
| `cheering` | `mastery-achieved`, `homework-done`, `goodbye` |

### Base portrait reference
Variant 1 (leftmost) from the MJ generation on May 30 2026. Front-facing, gentle smile, light beige bg. Indian woman late 40s, navy cardigan + magenta/purple/teal silk scarf + small gold earrings + dark hair in low bun. Pixar 3D style matching Ralphie. Use this as `--cref` for all 5 new variants — keep face identity consistent, change ONLY expression and slight head tilt.

### What's likely already wired (verify in 5 min)
- Each CATALOG entry already declares an `expression` field
- `js/humphrey.js` exports `setExpression`
- `state.refs.portrait` and `state.currentExpression` both exist
- `DEFAULTS.assetBase = '/assets/humphrey/'` confirmed in code

Unknown until verified: whether `say(event)` already auto-calls `setExpression(catalog[event].expression)`, and whether `setExpression()` swaps the `<img>` src. Probably yes — confirm at session start.

### First commands to run next session

    cd /tmp/hero-deploy
    git pull --rebase origin main
    
    # Confirm the say -> setExpression chain
    grep -n 'function setExpression\|setExpression =\|setExpression(' js/humphrey.js
    grep -nA 10 'function say\|say:\|^  say =' js/humphrey.js | head -50
    
    # Confirm asset path convention
    grep -n 'assetBase\|portrait\|\.png\|\.webp' js/humphrey.js | head -20
    ls -la assets/humphrey/ 2>&1 || echo 'assets/humphrey/ missing — needs to be created'
    
    # Verify the chain in live browser console (any tab on the app)
    # window.HeroAcademy.Humphrey._catalog['welcome'].expression  // should return 'smile'
    # window.HeroAcademy.Humphrey.setExpression('cheering')        // should swap portrait

### Implementation steps

1. **Verify chain** — run the greps above; confirm `say()` → `setExpression(catalog.expression)` → img swap
2. **Confirm filename pattern** — likely `/assets/humphrey/<expression>.png` or `.webp`
3. **Generate the 5 new variants in MJ** with `--cref` to Variant 1's URL (jemelike does this manually — drops PNGs in a folder I can pull or scp)
4. **Drop PNGs into `assets/humphrey/`** at the expected paths
5. **Bump `CACHE_VERSION` v8 → v9** in `sw.js`; add new asset paths to the CORE precache list if listed there
6. **Commit, push, verify Vercel Ready** per CLAUDE.md rule
7. **Live test** in DevTools console:

       const H = window.HeroAcademy.Humphrey;
       H.setExpression('cheering');
       H.setExpression('concerned');
       H.say('mastery-achieved', { kidName: 'Nigel', topic: 'Add Within 10' });

### Open questions for jemelike

1. **MJ generation timing** — are you generating the 6 variants this week? Or do you want me to ship placeholder tiles (solid color labeled with the expression name) first so the wiring is in place and we just swap files when the art lands?
2. **Transition** — instant swap, or short crossfade (~200ms) between expressions?
3. **Idle auto-restore** — after a `say()` finishes, auto-return to `idle` after a beat (e.g. 2s), or stay on the last expression until the next `say()`?
4. **File format** — PNG with transparent bg, or solid bg matching the corner widget? Existing Ralphie assets are `.webp` — match that?

### Files this phase will touch

- `js/humphrey.js` — verify (likely no code change) the setExpression-on-say chain. If chain isn't auto-wired, add it inside `say()`.
- `assets/humphrey/idle.{png,webp}` and 5 siblings — new files
- `sw.js` — bump cache to v9, add new asset paths to CORE precache list

### Estimated effort
- If chain already auto-wires expression: **~30 min** once art lands
- If not: **~60 min** (wire it, then ship)

---

## Backlog (tracked, not next)

- **Phase 2.6**: incomplete-homework rollover into next homework day
- **`?simulate=tue&progress=N`**: query-param-based homework preview (saves devtools surgery)
- **Phase 5**: Saturday email cron → bianca.parker92@gmail.com + jemelike@gmail.com, Humphrey-voiced weekly briefing on Nigel's progress, failures, areas to improve
- **Word Tower MVP**: first reading-zone game (phonics or sight-word focus)
- **Discovery Dome / Sound Stage / Training Gym / Creation Studio / Story Lab**: all currently placeholders
- **Supabase telemetry verification**: confirm `ha_record_attempt` RPC fires per attempt; build parent dashboard groundwork

## Standing rules (from CLAUDE.md)

After `git push origin main`:
1. Open https://vercel.com/jemelike-6356s-projects/hero-academy/deployments
2. Wait for new commit to show Ready · Production
3. Hard-reload live URL with `?bust=vN`
4. If SW caches involved, clear caches + unregister SW
5. Only then call it shipped
