-- v316: Letter Lab practice records.
-- js/letter-lab.js (v174) has always called ha_record_letter_practice after
-- each self-assessment, but the function was never created, so nothing was
-- saved. This adds it with the exact argument list the page sends.
-- One row per tap on "Looks great!" (p_correct = true) or "Try one more time"
-- (false). p_score is always null since v174 (no AI judging).

create table if not exists public.ha_letter_practice (
  id            bigint generated always as identity primary key,
  child_id      uuid        not null,
  practice_date date        not null,
  letter        text        not null check (char_length(letter) between 1 and 3),
  kind          text        not null check (kind in ('upper', 'lower', 'digit', 'multi-digit')),
  attempt       smallint    not null check (attempt between 1 and 5),
  score         numeric     null,
  correct       boolean     not null,
  created_at    timestamptz not null default now()
);

create index if not exists ha_letter_practice_child_date on public.ha_letter_practice (child_id, practice_date desc);

-- Readable and writable only through the function below or the service key.
alter table public.ha_letter_practice enable row level security;

create or replace function public.ha_record_letter_practice(
  p_child_id uuid, p_practice_date date, p_letter text, p_kind text,
  p_attempt integer, p_score numeric default null, p_correct boolean default false
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_child_id is null or p_practice_date is null or p_letter is null or p_kind is null or p_attempt is null then
    raise exception 'missing argument';
  end if;
  -- Keep junk out: the date must be near today, and a session is at most a handful of rows per target.
  if p_practice_date < current_date - 2 or p_practice_date > current_date + 2 then
    raise exception 'practice date out of range';
  end if;
  insert into ha_letter_practice (child_id, practice_date, letter, kind, attempt, score, correct)
  values (p_child_id, p_practice_date, p_letter, p_kind, p_attempt, p_score, coalesce(p_correct, false));
end;
$$;

revoke all on function public.ha_record_letter_practice(uuid, date, text, text, integer, numeric, boolean) from public;
grant execute on function public.ha_record_letter_practice(uuid, date, text, text, integer, numeric, boolean) to anon, authenticated;
