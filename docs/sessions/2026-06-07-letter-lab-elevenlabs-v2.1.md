# Session: 2026-06-07 — Letter Lab restoration + ElevenLabs v2.1 + Class Time design

## What we did

**Restored Letter Lab.** Found the files were complete but the zone had been removed from the home screen and daily mission. Two deploys: v138 added the tile and routing back, v139 made Letter Lab appear in the Daily Mission every day (was previously Mon/Wed/Fri only). Total: 8 mission steps now / 77 min.

**Published Ms. Humphrey v2.1.** Big expansion of her ElevenLabs system prompt. Two new operating modes:
- **Freeform Mode** — When Nigel taps her from the home screen with no specific zone, she answers any educational question, doesn't redirect him to a zone. She's now equipped to actually teach freeform — math, reading, science, anything a 2nd grader might ask.
- **Class Time Mode** — Her new dedicated daily 7-min review class. She drives. 3-4 topics × ~90s each with the drawing board. Eight client tools she can call mid-conversation to render on the board (drawNumber, drawDots, drawTenFrame, writeWord, writeLetter, drawEquation, showVisual, clearBoard).

**Designed the Class Time zone.** New tab Josh wants built. Daily Socratic class with Humphrey as the teacher, drawing board where she writes, visual aid pop-ups, conversation flow with questions and corrections. Approved name "Class Time," Path A (client tools). Three-phase build: Phase 0 (prompt) ✅ done this session, Phase 1 (foundation), Phase 2 (visuals/tools), Phase 3 (lesson plan generator).

## What Josh flagged as critical (informs the next 3-4 sessions)

1. Story Lab "Read with Ms. Humphrey" button opens story but Humphrey never reads it aloud
2. Cauldron Café too hard — needs repeat-question button + hints scaffolding
3. Discovery Dome doesn't auto-read questions when opened (should auto-speak like Explorer's Hall)
4. Hero Hall needs entry animations + Humphrey narration so Nigel knows what he earned
5. Universal auto-speak principle — every zone should have Humphrey auto-speaking on open
6. Daily Practice should auto-speak on open
7. Ms. Humphrey freeform teaching — ✅ addressed this session via v2.1 prompt

## What's deferred to next session

v140 audio fixes (Discovery Dome auto-speak, Daily Practice auto-speak, Cauldron repeat button) were recon'd but not shipped — each zone has a different gap pattern and needs careful per-file patches. Recon notes preserved in `.claude/HANDOFF.md`.

## Working notes

- Editing ElevenLabs prompts via Chrome MCP / ProseMirror: cursor positioning via Selection API is unreliable. When insertions landed at position 0 instead of the anchors, the fix was to extract the misplaced block, rebuild the prompt in correct order, then Select-All + Paste to replace whole editor content. Confirmed all sections preserved via diff view.
- ElevenLabs Publish dropdown has a "Review Changes" diff modal — side-by-side with green highlighting on the right side for additions. Confirmed only `system_prompt` was changing before publishing.
