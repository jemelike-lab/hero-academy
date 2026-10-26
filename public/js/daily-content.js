/*
 * js/daily-content.js
 *
 * Client adapter for the Content-of-One engine.
 * Reads tomorrow's AI-generated content from ha_daily_content via the
 * ha_get_todays_content RPC. SessionStorage-cached so each zone load is one
 * RPC max per type.
 *
 * Public API:
 *   await HeroAcademy.DailyContent.get('story')        // → {payload, content_date, is_today} | null
 *   await HeroAcademy.DailyContent.get('math_problems')
 *   await HeroAcademy.DailyContent.get('science_wonder')
 *   await HeroAcademy.DailyContent.get('word_list')
 *   HeroAcademy.DailyContent.markUsed(type)            // fire-and-forget analytics ping
 */
(function () {
  'use strict';

  const NIGEL_CHILD_ID = '2e0e51c5-f120-4152-8aa1-041eeecc8165';
  const SUPABASE_URL = 'https://yofqeuguxgujgqnaejmw.supabase.co';
  // Publishable anon key (same as telemetry.js — safe in client, RPC-gated).
  const SUPABASE_ANON_KEY = 'sb_publishable_Cigt6z_S1YTSvChOi5E7tA_t1H_nNRI';

  const TTL_MS = 1000 * 60 * 30; // 30 min in-session cache

  function cacheKey(type) {
    return `ha_daily_content:${type}`;
  }

  function readCache(type) {
    try {
      const raw = sessionStorage.getItem(cacheKey(type));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (Date.now() - obj.t > TTL_MS) return null;
      return obj.v;
    } catch (_) {
      return null;
    }
  }

  function writeCache(type, value) {
    try {
      sessionStorage.setItem(
        cacheKey(type),
        JSON.stringify({ t: Date.now(), v: value })
      );
    } catch (_) {
      /* quota — silently ignore */
    }
  }

  async function fetchToday(type) {
    const cached = readCache(type);
    if (cached !== null) return cached;

    const url = `${SUPABASE_URL}/rest/v1/rpc/ha_get_todays_content`;
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          p_child_id: NIGEL_CHILD_ID,
          p_content_type: type,
        }),
      });
      if (!r.ok) {
        console.warn('[daily-content] fetch', type, 'HTTP', r.status);
        return null;
      }
      const body = await r.json();
      // RPC returns the jsonb object directly (or null)
      writeCache(type, body);
      return body;
    } catch (err) {
      console.warn('[daily-content] fetch error', type, err);
      return null;
    }
  }

  function markUsed(type) {
    fetchToday(type).then((data) => {
      if (!data || !data.content_date) return;
      const url = `${SUPABASE_URL}/rest/v1/rpc/ha_record_content_use`;
      fetch(url, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          p_child_id: NIGEL_CHILD_ID,
          p_content_date: data.content_date,
          p_content_type: type,
        }),
        keepalive: true,
      }).catch(() => {});
    });
  }

  window.HeroAcademy = window.HeroAcademy || {};
  window.HeroAcademy.DailyContent = {
    get: fetchToday,
    markUsed,
  };
})();
