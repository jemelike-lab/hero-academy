# Higgsfield shot list — character state library (v303)

Purpose: short looping clips that the React app swaps by state. Rendered once,
shipped under `public/assets/clips/`. Nothing is generated at runtime.

## Setup (do once)

- Model: **Seedance 2.0** (`seedance_2_0`), reference-driven, consistent identity.
  Flagged `unlim` on the Ultra plan, so batches stay under the 500-credit approval line.
- References: upload `public/assets/humphrey/humphrey_base_2048.png` and the sharpest
  Ralphie PNG as `image_references`. The goal is these exact illustrated characters,
  not photoreal people. Add to every prompt: *"same illustrated character as the
  reference, flat warm colours, clean cream background, no text, no extra people."*
- Settings for every clip: 5 s, 720p, aspect 1:1 for portraits, `generate_audio: false`,
  genre `auto`. Then run **Video Background Remover** on each keeper so the clip sits on
  the cream card.
- Deliver as WebM (VP9, alpha) and a 3-frame poster PNG. Name files exactly as below.

## Ms. Humphrey (portrait, chest-up, facing camera)

| file | state in app | prompt (after the shared line) |
|---|---|---|
| `humphrey_idle.webm` | listening, between turns | gentle breathing, soft blink, small warm smile, hands folded, loops seamlessly |
| `humphrey_speaking.webm` | while TTS plays | explaining calmly, light natural head movement and brow lift, mouth moves softly, no words legible |
| `humphrey_thinking.webm` | question loading, hint rung 2 | looks slightly up and to the side, finger to chin, thoughtful, then back to camera |
| `humphrey_encouraging.webm` | after first wrong answer | leans in a little, kind nod, open palm gesture "you’ve got this" |
| `humphrey_delighted.webm` | correct answer | eyes brighten, big smile, small clap, scarf sways |
| `humphrey_cheering.webm` | streak of 3+, course finished | both hands up briefly, proud laugh, settles back to smile |
| `humphrey_board.webm` | teach-through on the board | turns slightly to her left as if pointing at a board beside her, explaining, returns to camera |
| `humphrey_goodbye.webm` | day complete | warm wave, slow nod, holds smile |

## Ralphie the turtle (full body, 3/4 view)

| file | state in app | prompt |
|---|---|---|
| `ralphie_idle.webm` | home screen | sways gently on his feet, blinks, tail flick, loops |
| `ralphie_wave.webm` | greeting | lifts one arm and waves twice, happy |
| `ralphie_cheer.webm` | correct answer, coins earned | hops once, both arms up, tiny confetti burst from nowhere |
| `ralphie_thinking.webm` | hint pulled | scratches head with one hand, looks at viewer |
| `ralphie_sleepy.webm` | break screen | yawns, stretches, settles into a cosy pose |
| `ralphie_trophy.webm` | Hero Hall, level up | holds up a small gold star, beams |

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
