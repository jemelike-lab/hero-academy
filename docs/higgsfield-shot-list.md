# Higgsfield shot list — character state library (v303)

Purpose: short looping clips that the React app swaps by state. Rendered once,
shipped under `public/assets/clips/`. Nothing is generated at runtime.

## Setup (do once)

- Model: **Seedance 2.0** (`seedance_2_0`), reference-driven, consistent identity.
  23 credits per 5 s / 1:1 / 720p clip (the site's "Unlimited mode" is a separate paid day pass, not part of the plan).
- References: the `@Humphrey` and `@Ralphie` Elements already exist in the workspace (made from
  `humphrey_base_2048.png` and `ralphie_waving.webp`). Insert the element from the Elements panel
  so it is linked, not typed as plain text. The goal is these exact illustrated characters,
  not photoreal people. Add to every prompt: *"same illustrated character as the
  reference, flat warm colours, clean cream background, no text, no extra people."*
- Settings for every clip: 5 s, 720p, aspect 1:1 for portraits, `generate_audio: false`,
  genre `auto`. The cream background is close enough to the app's paper colour that no
  background removal is needed; the clip sits in a rounded frame.
- Delivery: download the MP4, transcode to 480×480 silent H.264 (`ffmpeg -an -vf scale=480:480
  -crf 26 -movflags +faststart`), save under `public/assets/clips/` with the names below.

Status: batch 1 (idle, speaking, delighted) rendered 2026-10-26, all three accepted and wired in.

## Ms. Humphrey (portrait, chest-up, facing camera)

| file | state in app | prompt (after the shared line) |
|---|---|---|
| `humphrey_idle.mp4` | listening, between turns | gentle breathing, soft blink, small warm smile, hands folded, loops seamlessly |
| `humphrey_speaking.mp4` | while TTS plays | explaining calmly, light natural head movement and brow lift, mouth moves softly, no words legible |
| `humphrey_thinking.mp4` | question loading, hint rung 2 | looks slightly up and to the side, finger to chin, thoughtful, then back to camera |
| `humphrey_encouraging.mp4` | after first wrong answer | leans in a little, kind nod, open palm gesture "you’ve got this" |
| `humphrey_delighted.mp4` | correct answer | eyes brighten, big smile, small clap, scarf sways |
| `humphrey_cheering.mp4` | streak of 3+, course finished | both hands up briefly, proud laugh, settles back to smile |
| `humphrey_board.mp4` | teach-through on the board | turns slightly to her left as if pointing at a board beside her, explaining, returns to camera |
| `humphrey_goodbye.mp4` | day complete | warm wave, slow nod, holds smile |

## Ralphie the turtle (full body, 3/4 view; green turtle, blue cape, gold star on his chest)

| file | state in app | prompt |
|---|---|---|
| `ralphie_idle.mp4` | home screen | sways gently on his feet, blinks, tail flick, loops |
| `ralphie_wave.mp4` | greeting | lifts one arm and waves twice, happy |
| `ralphie_cheer.mp4` | correct answer, coins earned | hops once, both arms up, tiny confetti burst from nowhere |
| `ralphie_thinking.mp4` | hint pulled | scratches head with one hand, looks at viewer |
| `ralphie_sleepy.mp4` | break screen | yawns, stretches, settles into a cosy pose |
| `ralphie_trophy.mp4` | Hero Hall, level up | holds up a small gold star, beams |

## Set dressing (stills, any image model, 16:9, 1536 wide)

- 12 Digit Tower world skins, one per floor theme (names in `js/digit-tower.js` WORLD_SKINS):
  flat illustrated backdrop, no characters, calm palette matching the cream/teal/gold tokens.
- 4 subject headers for the trail: tiny icon scenes for Math, Reading, Spelling, Science.
- Break scene: a sunny window with a plant and a glass of water, nothing to read.

## Review checklist before accepting a clip

- Face and outfit match the reference (navy cardigan, magenta/purple/teal scarf for Humphrey).
- No text, no extra characters, no hands with wrong finger counts in a hold frame.
- First and last frames close enough to loop without a visible jump (idle/speaking only).
- Nothing in the clip a 7-year-old would find startling.

## Batches (keep each under the 500-credit approval line)

1. Humphrey idle + speaking + delighted (the three the app uses most). Wire these first.
2. Remaining Humphrey states.
3. Ralphie set.
4. Set dressing stills.
