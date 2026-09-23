-- v210 Digit Tower (Game Day) migration
-- Tables: ha_tower_progress (one row per child per season — carry-over state),
--         ha_floor_runs   (one row per floor played — seed, twist, accuracy, topics)
-- RPCs:   ha_tower_get_state(p_child_id)            → progress + 14-day weak math topics
--         ha_tower_save_progress(p_child_id, p_patch) → merge jsonb patch into progress
--         ha_tower_record_floor(p_child_id, p_run)    → insert a floor run
-- All SECURITY DEFINER; anon may EXECUTE (same pattern as ha_record_event).

CREATE TABLE IF NOT EXISTS public.ha_tower_progress (
  child_id     uuid NOT NULL,
  season       integer NOT NULL DEFAULT 1,
  world_idx    integer NOT NULL DEFAULT 0,     -- 0..11
  floor_idx    integer NOT NULL DEFAULT 1,     -- 1..2 within the world
  game_days    integer NOT NULL DEFAULT 0,     -- Game Days completed this season
  gems         integer NOT NULL DEFAULT 0,
  first_try_total integer NOT NULL DEFAULT 0,  -- cumulative first-try locks (drives rank)
  locks_total  integer NOT NULL DEFAULT 0,
  crown        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- world indexes whose lieutenant is beaten
  gadgets      jsonb NOT NULL DEFAULT '{}'::jsonb,
  floors       jsonb NOT NULL DEFAULT '[]'::jsonb,   -- tower map: [{date, world, floor, stars}]
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (child_id, season)
);
COMMENT ON TABLE public.ha_tower_progress IS 'Digit Tower carry-over state per child per season (Game Day, Tue/Thu).';

CREATE TABLE IF NOT EXISTS public.ha_floor_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id     uuid NOT NULL,
  run_date     date NOT NULL,
  season       integer NOT NULL DEFAULT 1,
  world_idx    integer NOT NULL,
  floor_idx    integer NOT NULL,
  seed         bigint,
  twist        text,
  phase        text,                              -- warmup | floor | bonus | debrief
  locks_total  integer NOT NULL DEFAULT 0,
  first_try    integer NOT NULL DEFAULT 0,
  assisted     integer NOT NULL DEFAULT 0,        -- locks opened after the 3rd miss
  board_opened integer NOT NULL DEFAULT 0,        -- work board opened before first answer
  stars        integer NOT NULL DEFAULT 0,
  duration_s   integer NOT NULL DEFAULT 0,
  topics       jsonb NOT NULL DEFAULT '{}'::jsonb, -- {topic_id: {n, first_try}}
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ha_floor_runs_child_date_idx ON public.ha_floor_runs (child_id, run_date DESC);

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ha_tower_get_state(p_child_id uuid, p_season integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prog jsonb;
  v_weak jsonb;
  v_today jsonb;
BEGIN
  INSERT INTO public.ha_tower_progress (child_id, season)
  VALUES (p_child_id, p_season)
  ON CONFLICT (child_id, season) DO NOTHING;

  SELECT to_jsonb(t) - 'child_id' INTO v_prog
  FROM public.ha_tower_progress t
  WHERE t.child_id = p_child_id AND t.season = p_season;

  -- weakest math topics over the last 14 days (lowest pass ratio, min 2 sessions)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('topic_id', m.topic_id, 'ratio', ROUND(m.sessions_passed::numeric / GREATEST(m.sessions_attempted,1), 2))), '[]'::jsonb)
  INTO v_weak
  FROM (
    SELECT m.topic_id, m.sessions_attempted, m.sessions_passed
    FROM public.ha_topic_mastery m
    JOIN public.ha_topics t ON t.id = m.topic_id
    WHERE m.child_id = p_child_id
      AND t.subject ILIKE '%math%'
      AND m.last_session_at >= now() - interval '14 days'
      AND m.sessions_attempted >= 2
    ORDER BY (m.sessions_passed::numeric / GREATEST(m.sessions_attempted,1)) ASC, m.sessions_attempted DESC
    LIMIT 4
  ) m;

  -- today's runs (for resume + the 75-minute budget)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('phase', r.phase, 'world_idx', r.world_idx, 'floor_idx', r.floor_idx, 'stars', r.stars, 'duration_s', r.duration_s, 'locks_total', r.locks_total, 'first_try', r.first_try) ORDER BY r.created_at), '[]'::jsonb)
  INTO v_today
  FROM public.ha_floor_runs r
  WHERE r.child_id = p_child_id AND r.run_date = (now() AT TIME ZONE 'America/New_York')::date;

  RETURN jsonb_build_object('progress', v_prog, 'weak_topics', v_weak, 'today_runs', v_today);
END;
$$;
GRANT EXECUTE ON FUNCTION public.ha_tower_get_state(uuid, integer) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Patch keys accepted: world_idx, floor_idx, game_days, gems, first_try_total,
-- locks_total (absolute values), crown_add (int), floors_add (jsonb object),
-- gadgets (jsonb, merged).
CREATE OR REPLACE FUNCTION public.ha_tower_save_progress(p_child_id uuid, p_patch jsonb, p_season integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.ha_tower_progress;
BEGIN
  INSERT INTO public.ha_tower_progress (child_id, season)
  VALUES (p_child_id, p_season)
  ON CONFLICT (child_id, season) DO NOTHING;

  UPDATE public.ha_tower_progress t SET
    world_idx       = COALESCE((p_patch->>'world_idx')::int, t.world_idx),
    floor_idx       = COALESCE((p_patch->>'floor_idx')::int, t.floor_idx),
    game_days       = COALESCE((p_patch->>'game_days')::int, t.game_days),
    gems            = COALESCE((p_patch->>'gems')::int, t.gems),
    first_try_total = COALESCE((p_patch->>'first_try_total')::int, t.first_try_total),
    locks_total     = COALESCE((p_patch->>'locks_total')::int, t.locks_total),
    crown           = CASE WHEN p_patch ? 'crown_add' AND NOT (t.crown @> to_jsonb(ARRAY[(p_patch->>'crown_add')::int]))
                           THEN t.crown || to_jsonb(ARRAY[(p_patch->>'crown_add')::int]) ELSE t.crown END,
    floors          = CASE WHEN p_patch ? 'floors_add' THEN t.floors || jsonb_build_array(p_patch->'floors_add') ELSE t.floors END,
    gadgets         = CASE WHEN p_patch ? 'gadgets' THEN t.gadgets || (p_patch->'gadgets') ELSE t.gadgets END,
    updated_at      = now()
  WHERE t.child_id = p_child_id AND t.season = p_season
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row) - 'child_id';
END;
$$;
GRANT EXECUTE ON FUNCTION public.ha_tower_save_progress(uuid, jsonb, integer) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ha_tower_record_floor(p_child_id uuid, p_run jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.ha_floor_runs
    (child_id, run_date, season, world_idx, floor_idx, seed, twist, phase, locks_total, first_try, assisted, board_opened, stars, duration_s, topics)
  VALUES (
    p_child_id,
    COALESCE((p_run->>'run_date')::date, (now() AT TIME ZONE 'America/New_York')::date),
    COALESCE((p_run->>'season')::int, 1),
    COALESCE((p_run->>'world_idx')::int, 0),
    COALESCE((p_run->>'floor_idx')::int, 1),
    (p_run->>'seed')::bigint,
    p_run->>'twist',
    COALESCE(p_run->>'phase', 'floor'),
    COALESCE((p_run->>'locks_total')::int, 0),
    COALESCE((p_run->>'first_try')::int, 0),
    COALESCE((p_run->>'assisted')::int, 0),
    COALESCE((p_run->>'board_opened')::int, 0),
    COALESCE((p_run->>'stars')::int, 0),
    COALESCE((p_run->>'duration_s')::int, 0),
    COALESCE(p_run->'topics', '{}'::jsonb)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ha_tower_record_floor(uuid, jsonb) TO anon, authenticated, service_role;
