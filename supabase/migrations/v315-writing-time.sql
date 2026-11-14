-- v315 Writing Time: dictation (daily, end of Class Time) + Friday spelling test.
-- Additive only. Both tables are written and read by /api/class-time/writing
-- with the service key; RLS is on with no anon policies, so the public key
-- can't read Nigel's handwriting.

-- What Ms. Humphrey will say for one day (dictation) or one week (spelling).
CREATE TABLE IF NOT EXISTS public.ha_writing_sets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id     uuid NOT NULL,
  set_date     date NOT NULL,              -- dictation: the class day; spelling: that week's Friday
  kind         text NOT NULL CHECK (kind IN ('dictation', 'spelling')),
  week_start   date NOT NULL,              -- Monday of set_date's week
  items        jsonb NOT NULL,             -- dictation: [{index,text}]; spelling: [{index,word,sentence}]
  week_words   jsonb NOT NULL DEFAULT '[]'::jsonb, -- the words found in that week's lessons
  source       text NOT NULL DEFAULT 'haiku',
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (child_id, set_date, kind)
);

-- One row per thing Nigel wrote. Never updated except for the parent's mark/note;
-- a redo adds a new row, so nothing he wrote is lost.
CREATE TABLE IF NOT EXISTS public.ha_writing_attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id      uuid NOT NULL,
  set_id        uuid NOT NULL REFERENCES public.ha_writing_sets(id),
  kind          text NOT NULL CHECK (kind IN ('dictation', 'spelling')),
  set_date      date NOT NULL,
  item_index    integer NOT NULL,
  prompt_text   text NOT NULL,             -- the exact sentence or word she asked for
  spoken_text   text NOT NULL,             -- everything she said for it, word for word
  drawing_png   text NOT NULL,             -- data:image/png;base64,… of his handwriting
  replays       integer NOT NULL DEFAULT 0,
  started_at    timestamptz,
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  parent_mark   text CHECK (parent_mark IN ('right', 'wrong')),
  parent_note   text,
  marked_by     text,
  marked_at     timestamptz
);

CREATE INDEX IF NOT EXISTS ha_writing_attempts_child_date_idx
  ON public.ha_writing_attempts (child_id, set_date DESC, kind, item_index);

ALTER TABLE public.ha_writing_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ha_writing_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ha_writing_sets FROM anon, authenticated;
REVOKE ALL ON TABLE public.ha_writing_attempts FROM anon, authenticated;
