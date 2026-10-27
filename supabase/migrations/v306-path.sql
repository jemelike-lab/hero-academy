-- v306: subject path for the React "My path" view and placement check.
-- Joins every ha_topics row for a subject with the child's mastery stats.
create or replace function public.ha_get_subject_path(p_child_id uuid, p_subject text)
returns jsonb
language sql
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(row_data order by ord, diff, ttl), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'topic_id', t.id,
      'title', coalesce(nullif(t.title, ''), t.id),
      'description', t.description,
      'difficulty', t.difficulty,
      'sequence_order', t.sequence_order,
      'prerequisites', coalesce(to_jsonb(t.prerequisites), '[]'::jsonb),
      'attempted', coalesce(m.sessions_attempted, 0),
      'passed', coalesce(m.sessions_passed, 0),
      'pass_rate', case when coalesce(m.sessions_attempted, 0) > 0
                        then round(m.sessions_passed::numeric / m.sessions_attempted, 2) else null end,
      'mastered', (m.mastered_at is not null),
      'last_session_at', m.last_session_at
    ) as row_data,
    coalesce(t.sequence_order, 9999) as ord,
    coalesce(t.difficulty, 1) as diff,
    coalesce(t.title, t.id) as ttl
    from public.ha_topics t
    left join public.ha_topic_mastery m on m.topic_id = t.id and m.child_id = p_child_id
    where lower(t.subject) = lower(p_subject)
  ) s;
$$;
grant execute on function public.ha_get_subject_path(uuid, text) to anon, authenticated, service_role;
