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
