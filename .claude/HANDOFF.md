# Hero Academy — Session Handoff
**As of**: May 30 2026 · `main` @ `157dd4d`

## Where we are

- Live: https://hero-academy-jemelike-6356s-projects.vercel.app — all deploys Ready · Production
- SW cache: `hero-academy-v9`
- All three major phases shipped today and verified live

## Today's commits (all verified Ready · Production on Vercel)

| Commit | Phase | What |
|---|---|---|
| `0d730b3` | 2 v0.2 | `Humphrey.say()` wired into Number Lab, Cauldron Cafe, Diner Lanes |
| `64fb596` | 2.5 | Twice-weekly homework (Tue/Thu, 10 problems, localStorage, Humphrey voice assign + done) |
| `2c70c74` | docs | `CLAUDE.md` + `.claude/WORKFLOW.md` (mandatory deploy-verify rule) |
| `613b517` | docs | `.claude/HANDOFF.md` |
| `fc28216` | 3 | 5 expression portrait WebPs uploaded |
| `157dd4d` | 3 | Rename fixes + `setExpression` .webp probe + SW v9 |

## What shipped — feature summary

### Phase 2 v0.2 — Humphrey voice in all 3 games
- `Humphrey.say()` fires on: zone-enter, correct-answer, wrong-answer, streak-3/5/10, mastery-achieved, character-unlocked in Number Lab, Cauldron Cafe, Diner Lanes
- Rate-limited wrong-pin feedback in Diner Lanes (once per order)
- Streak silencing on winLevel when wrong pin was hit

### Phase 2.5 — Twice-weekly homework
- Tue/Thu auto-creates 10-problem homework for current math skill
- Gold card on homepage with progress bar, flips to emerald on completion
- Ms. Humphrey announces assignment (2.8s delay) and celebrates completion
- Increment hook in `number-lab.js handleCorrect` after streak block
- All state in `localStorage['ha_homework_<YYYY-MM-DD>']` (local date, not UTC)

### Phase 3 — Ms. Humphrey 6 expressions
- 5 new WebP portraits (idle/encouraging/concerned/surprised/cheering) at 512x512
- Base portrait (Variant 1) serves as `smile` via fallback (no separate file needed)
- `setExpression()` probes `/assets/humphrey/humphrey_<expr>_512.webp`
- Chain confirmed: `say()` -> `setExpression(catalog.expression)` -> img swap -> voice plays -> `setExpression('idle')` auto-restore
- All 5 expressions tested live: each loads correctly and `imgLoaded: true`

## Verified vs unverified

### Verified
- All 5 expression WebPs load via `setExpression()` (tested in browser console)
- Homework card renders in partial (4/10) and done (10/10) states
- `node -c` passes on all JS files
- All deploys Ready on Vercel
- SW cache v9 reachable

### Not yet verified — needs real gameplay
- Live audio playthrough of voice events during actual game session
- Tue/Thu homework auto-activation (today is Saturday)
- Expression transitions during real `say()` calls (tested setExpression directly but not the full say->expression->idle chain with audio)
- Streak-vs-mastery timing overlap check
- Portrait crossfade transition (currently instant swap — 200ms crossfade is a future polish item)

---

## Backlog — next phase candidates

### S — single-session wins
- **200ms crossfade** between expressions (CSS transition on portrait img opacity)
- **`?simulate=tue&progress=N`** query param for off-day homework preview
- **Phase 2.6**: incomplete-homework rollover into next homework day

### M — one to two sessions
- **Word Tower MVP** — first reading-zone game (phonics or sight-word for 2nd grader)
- **Supabase telemetry verification** — confirm `ha_record_attempt` RPC fires per attempt; parent dashboard groundwork
- **Hero Hall trophy room** — review what's there, polish/expand

### L — multi-session arc
- **Phase 5: Saturday email briefing** — Supabase cron + sendgrid/AgentMail + Humphrey-voiced weekly report to bianca.parker92@gmail.com + jemelike@gmail.com
- **Discovery Dome / Sound Stage / Training Gym / Creation Studio / Story Lab** — new zone games

## Key technical references

### Humphrey API (`window.HeroAcademy.Humphrey`)
- `init({ position, audioEnabled, debug })`
- `say(event, { kidName, topic, streak, ... })` — picks random line from catalog, fires expression + voice
- `setExpression(expr)` — probes `/assets/humphrey/humphrey_<expr>_512.webp`, swaps on success
- `_catalog` — 16 events including homework-assigned/homework-done
- `_state` — current expression, refs, config

### Asset paths
- Expressions: `/assets/humphrey/humphrey_{idle,encouraging,concerned,surprised,cheering}_512.webp`
- Base portrait: `/assets/humphrey/humphrey_base_{128,256,512,1024,2048}.{png,webp}`
- Audio: `/assets/humphrey/audio/<event>-<NN>.mp3`

### Expression mapping (from CATALOG entries)
| Expression | Events |
|---|---|
| smile | welcome, zone-enter |
| encouraging | correct-answer, streak-3/5/10, homework-assigned |
| concerned | wrong-answer, try-again |
| surprised | level-start, character-unlocked |
| cheering | mastery-achieved, homework-done, goodbye |
| idle | default / auto-restore after say() finishes |

## Standing rules (from CLAUDE.md)

After `git push origin main`:
1. Open https://vercel.com/jemelike-6356s-projects/hero-academy/deployments
2. Wait for new commit to show Ready · Production
3. Hard-reload live URL with `?bust=vN`
4. If SW caches involved, clear caches + unregister SW
5. Only then call it shipped
