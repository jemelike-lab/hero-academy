// Direct Supabase RPCs (publishable key, same as legacy js/telemetry.js).
import { CHILD_ID } from './child';

const SUPABASE_URL = 'https://yofqeuguxgujgqnaejmw.supabase.co';
const SB_KEY = 'sb_publishable_Cigt6z_S1YTSvChOi5E7tA_t1H_nNRI';

export function rpc(fn: string, body: Record<string, unknown> = {}, opts: { keepalive?: boolean } = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    keepalive: !!opts.keepalive,
  });
}

export function recordTopicAttempt(topicId: string, passedFirstTry: boolean, subject: string, zoneId = 'class-time') {
  if (!topicId) return;
  rpc('ha_record_topic_attempt', {
    p_child_id: CHILD_ID, p_topic_id: topicId, p_passed: !!passedFirstTry, p_subject: subject || 'unknown', p_zone_id: zoneId,
  }).catch(() => { /* best-effort */ });
}

// Zone session, as legacy js/telemetry.js autoStart did for each page:
// ha_start_session on open, ha_end_session(completed=false) when the page is
// hidden, closed, or left. Like legacy, a session is not reopened after it ends.
export function startZoneSession(zoneId: string, gameId: string) {
  let sessionId: string | null = null; let ended = false;
  rpc('ha_start_session', { p_child_id: CHILD_ID, p_zone_id: zoneId, p_game_id: gameId, p_topic_id: null })
    .then((r) => (r.ok ? r.json() : null))
    .then((u) => { sessionId = typeof u === 'string' ? u : (Array.isArray(u) && u[0]) || null; if (ended && sessionId) end(); })
    .catch(() => { /* best-effort */ });
  const end = () => {
    ended = true;
    if (!sessionId) return;
    const id = sessionId; sessionId = null;
    rpc('ha_end_session', { p_session_id: id, p_completed: false }, { keepalive: true }).catch(() => { /* best-effort */ });
  };
  const onVis = () => { if (document.visibilityState === 'hidden') end(); };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', end);
  return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', end); end(); };
}
