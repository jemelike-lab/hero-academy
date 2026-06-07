# v140 — ElevenLabs Agent Setup

Two things to do in the ElevenLabs dashboard before Class Time will fully work:

1. **Register the 8 client tools** (Path A architecture from handoff). The prompt already documents them — but the agent can't call them until they exist as registered tools.
2. **Add the new "Canvas Vision" section to the prompt** — tells Humphrey she'll receive contextual updates about what's on Nigel's canvas in real time.

---

## Part 1 — Register the 8 client tools

Agent → Tools → Add tool → Client tool (one per tool below).

### Tool 1 — `drawNumber`
- **Name:** `drawNumber`
- **Description:** `Renders a large number (0-100) on the teaching board. Use when announcing a number, showing an answer, or doing place value.`
- **Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "n": { "type": "integer", "description": "The number to display, 0 to 100" }
    },
    "required": ["n"]
  }
  ```

### Tool 2 — `drawDots`
- **Name:** `drawDots`
- **Description:** `Renders a row/grid of counting dots on the teaching board. Use for counting, addition visualization, or grouping.`
- **Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "count": { "type": "integer", "description": "Number of dots, 1 to 15" }
    },
    "required": ["count"]
  }
  ```

### Tool 3 — `drawTenFrame`
- **Name:** `drawTenFrame`
- **Description:** `Renders a ten-frame (2x5 grid) with N cells filled. Use for additions within 10, subtraction, and making/breaking 10.`
- **Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "filled": { "type": "integer", "description": "How many cells to fill, 0 to 10" }
    },
    "required": ["filled"]
  }
  ```

### Tool 4 — `writeWord`
- **Name:** `writeWord`
- **Description:** `Writes a word on the teaching board in handwriting style. Use for sight words, spelling, and vocabulary.`
- **Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "word": { "type": "string", "description": "The word to write" }
    },
    "required": ["word"]
  }
  ```

### Tool 5 — `writeLetter`
- **Name:** `writeLetter`
- **Description:** `Writes a single letter in big handwriting style. Use for letter sounds, letter formation, and phonics.`
- **Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "letter": { "type": "string", "description": "A single letter, e.g. A or b" }
    },
    "required": ["letter"]
  }
  ```

### Tool 6 — `drawEquation`
- **Name:** `drawEquation`
- **Description:** `Renders a math equation as text on the teaching board, e.g. '7 + 3 = ?' or '10 - 4 = 6'.`
- **Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "text": { "type": "string", "description": "The equation string" }
    },
    "required": ["text"]
  }
  ```

### Tool 7 — `showVisual`
- **Name:** `showVisual`
- **Description:** `Pops up a kid-friendly illustration of a topic. Use sparingly — once per topic at most.`
- **Parameters:**
  ```json
  {
    "type": "object",
    "properties": {
      "topic": {
        "type": "string",
        "description": "Valid topics: plant, sun, water, soil, butterfly, frog, bee, planet, moon, star, volcano, mountain, river, ocean, fire, ice, magnet, heart, lung, brain, dog, cat, fish, bird, dinosaur, knight, castle, map, flag, clock, calendar"
      }
    },
    "required": ["topic"]
  }
  ```

### Tool 8 — `clearBoard`
- **Name:** `clearBoard`
- **Description:** `Wipes the teaching board. Use between topics, NOT between question and answer (Nigel needs to see his work).`
- **Parameters:**
  ```json
  {
    "type": "object",
    "properties": {}
  }
  ```

### Optional Tool 9 — `nextTopic`
- **Name:** `nextTopic`
- **Description:** `Advances the topic indicator pip in the header. Call when you finish a topic and move to the next.`
- **Parameters:** `{ "type": "object", "properties": {} }`

### Optional Tool 10 — `endClass`
- **Name:** `endClass`
- **Description:** `Ends Class Time early when all topics are covered. Otherwise the 7-min timer handles it.`
- **Parameters:** `{ "type": "object", "properties": {} }`

---

## Part 2 — Add prompt section: Canvas Vision

Open the agent prompt (the 13,113-char v2.1 prompt). Find the `## CLASS TIME MODE` section. Add the following new section **right after** it (before `## Critical Reminders`):

```
## CANVAS VISION (Class Time only)

In Class Time you have a magic ability: every few seconds while Nigel is drawing or writing, you receive a contextual update that describes what's currently on his canvas. These look like:

  "What's on Nigel's canvas right now: Nigel wrote the number 7 in big shaky letters"
  "What's on Nigel's canvas right now: Nigel drew 5 circles in a row, plus 2 more circles below"
  "What's on Nigel's canvas right now: The canvas just has scribbles and squiggly lines, no clear answer yet"
  "Nigel cleared his canvas. It's blank now."

USE these updates to react naturally and warmly, like a real teacher who can see his work.

Examples of good reactions:
- (After update says "Nigel wrote the number 8") → "Oh, I see an 8! Beautiful. Is that your answer?"
- (After update says "scribbles") → "Take your time, sweetie. No rush."
- (After update says "Nigel wrote '7+3=10'") → "Yes! Ten! You wrote the whole equation. That's exactly right."
- (After cleared) → "Fresh canvas. What do you want to try?"

Rules:
- Wait 1-2 seconds after asking a question before reacting to canvas updates. Give him room to draw.
- If the update says "blank" or "no clear answer yet", don't pressure him. Either wait or rephrase the question more simply.
- Don't read the update aloud verbatim. React naturally in your own words.
- If updates conflict (e.g. you saw a 7, then an 8), trust the most recent one — he changed his mind.
- These updates do NOT replace him talking. Listen for his voice answers too.
```

---

## Part 3 — Update existing prompt sections (small tweaks)

### a) Add `lesson_theme` and `lesson_source` to dynamic variables list
The prompt currently lists 3 new dynamic variables. Add these 2 more:
- `{{lesson_theme}}` — short phrase describing today's theme (e.g. "Number sense + sight words")
- `{{lesson_source}}` — "haiku-4.5" or "fallback" (lets you mention it's a fresh class if needed)

### b) Class Time intro line (optional polish)
Where the Class Time mode says "Structure: warm open (10s) → 3-4 topics × ~90s each..." you can add at the end:

> Today's theme is {{lesson_theme}}. The 4 topics are pre-planned in `{{lesson_topics}}` — start with topic 1 and move sequentially.

---

## Part 4 — Verification checklist

After publishing the agent:

1. Go to `https://hero-academy-jemelike-6356s-projects.vercel.app/class-time.html` on a tablet (landscape).
2. Allow mic.
3. Wait for Humphrey's greeting.
4. Ask her to "show me what 7 plus 3 looks like."
5. **Expected:** she calls `drawTenFrame` and/or `drawDots` on the LEFT board.
6. Pick up the stylus and draw a 7 on the RIGHT canvas.
7. Wait ~3 seconds.
8. **Expected:** she reacts to your 7 ("Oh, I see a 7 — is that your answer?") within 8-10 seconds.

If steps 5 or 8 don't happen, check the browser console for:
- Tool call rejections (= dashboard tool registration is off)
- `/api/class-time/see-canvas` failures (= vision endpoint issue)
- ConvAI connection errors (= agent_id mismatch or mic permission)
