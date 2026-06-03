/**
 * Hero Academy — system heartbeat.
 *
 * Schedule (vercel.json):  0 *\/6 * * *   (every 6 hours, on the hour)
 *
 * Why this exists:
 *   Tonight's Zapier post-mortem showed that the Saturday-email cron had been
 *   401-ing on the production deployment for at least 24h, but nothing surfaced
 *   it: Vercel saw HTTP 200 on the function (it answered the request, just
 *   with an error JSON), Zapier saw HTTP 200 on the hook for manual curls but
 *   never saw the cron at all, and the only "alert" was a Gmail step failing
 *   downstream — visible only by clicking into Zap History.
 *
 *   This heartbeat closes that gap. It exercises each external dependency the
 *   app relies on, writes the result to ha_health_checks, and emails Josh via
 *   the existing Zapier hook on ok ↔ degraded transitions (debounced — no
 *   spam every 6h if something stays broken).
 *
 * Pipeline per run:
 *   1. Verify Bearer ${CRON_SECRET}.
 *   2. Run four checks in parallel (each with its own timeout):
 *        - supabase: GET /rest/v1/ha_children?select=id&limit=1
 *        - anthropic: POST /v1/messages, max_tokens=1
 *        - saturday_email_cron: GET own /api/cron/saturday-email?dry_run=1
 *        - zapier_dns: HEAD on the Zapier webhook host (network reachability)
 *      …plus an instant env-presence check.
 *   3. Compute overall_status = 'ok' if every check ok===true, else 'degraded'.
 *   4. Look up the previous row in ha_health_checks to detect transitions.
 *   5. Write the current row (unless ?dry_run=1).
 *   6. Send an alert email on ok→degraded; send a recovery email on
 *      degraded→ok. Otherwise emit alerted='no_transition'.
 *   7. Return JSON with everything for inspection.
 *
 * Manual testing:
 *   curl -sS -H "Authorization: Bearer $CRON_SECRET" \
 *        'https://hero-academy-jemelike-6356s-projects.vercel.app/api/cron/healthcheck?dry_run=1'
 *
 *   With dry_run=1: nothing is written and no alert is sent. Just gives you
 *   the JSON for inspection. Use this to validate before real runs.
 *
 * Env vars required:
 *   CRON_SECRET                  — Bearer auth (shared with /api/cron/saturday-email).
 *   SUPABASE_URL                 — https://yofqeuguxgujgqnaejmw.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY    — service_role JWT (used to write the heartbeat row).
 *   ANTHROPIC_API_KEY            — used for a 1-token ping to /v1/messages.
 *   ZAPIER_WEBHOOK_URL           — Catch Hook URL (alerts go through this same hook).
 *   ALERT_EMAIL                  — optional override for the recipient. Defaults to jemelike@gmail.com.
 *                                  Alerts deliberately do NOT go to Bianca.
 *   VERCEL_URL                   — populated automatically by Vercel; we use it
 *                                  to reach our own saturday-email endpoint.
 */

const HAIKU_MODEL = 'claude-haiku-4-5';
const FALLBACK_BASE = 'https://hero-academy-jemelike-6356s-projects.vercel.app';
const DEFAULT_ALERT_EMAIL = 'jemelike@gmail.com';

// Per-check timeouts (ms). Each check is wrapped in withTimeout so a hanging
// upstream never burns the whole 10s Vercel function budget.
const TIMEOUTS = {
  supabase: 4000,
  anthropic: 6000,
  saturday_email_cron: 8000,
  zapier_dns: 4000,
};

export default async function handler(req, res) {
  // ---------- 1. Auth ----------
  const auth = req.headers.authorization || '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }
  if (auth !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const dryRun = String(req.query.dry_run || '') === '1';
  const startMs = Date.now();

  // ---------- 2. Env ----------
  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const ZAP_URL = process.env.ZAPIER_WEBHOOK_URL;
  const ALERT_EMAIL = (process.env.ALERT_EMAIL || DEFAULT_ALERT_EMAIL).trim();
  const SELF_BASE = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : FALLBACK_BASE;

  const envCheck = {
    ok: Boolean(SB_URL && SB_KEY && ANTHROPIC_KEY && ZAP_URL && cronSecret),
    missing: [
      !SB_URL && 'SUPABASE_URL',
      !SB_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
      !ANTHROPIC_KEY && 'ANTHROPIC_API_KEY',
      !ZAP_URL && 'ZAPIER_WEBHOOK_URL',
    ].filter(Boolean),
  };

  // ---------- 3. Dependency checks (parallel) ----------
  const [supabaseR, anthropicR, satEmailR, zapDnsR] = await Promise.all([
    checkSupabase({ SB_URL, SB_KEY }),
    checkAnthropic({ ANTHROPIC_KEY }),
    checkSaturdayEmail({ SELF_BASE, cronSecret }),
    checkZapierDns({ ZAP_URL }),
  ]);

  const checks = {
    env: envCheck,
    supabase: supabaseR,
    anthropic: anthropicR,
    saturday_email_cron: satEmailR,
    zapier_dns: zapDnsR,
  };

  const allOk = Object.values(checks).every((c) => c && c.ok === true);
  const overall_status = allOk ? 'ok' : 'degraded';
  const duration_ms = Date.now() - startMs;

  // ---------- 4. Transition detection ----------
  let prev_status = null;
  if (SB_URL && SB_KEY) {
    try {
      const prev = await sb({
        SB_URL,
        SB_KEY,
        path: 'ha_health_checks?select=overall_status&order=checked_at.desc&limit=1',
      });
      if (Array.isArray(prev) && prev.length > 0) {
        prev_status = prev[0].overall_status;
      }
    } catch (e) {
      // Non-fatal: if we can't read prev state, we just won't dedupe alerts.
      console.error('[healthcheck] prev lookup failed:', e?.message || e);
    }
  }

  // ---------- 5. Log row (skipped on dry_run) ----------
  let logged = 'skipped';
  let alerted = 'skipped';

  if (!dryRun && SB_URL && SB_KEY) {
    // Decide alert FIRST so we can store the alerted value alongside the row.
    if (ZAP_URL) {
      const becameDegraded = overall_status === 'degraded' && (prev_status === 'ok' || prev_status === null);
      const recovered = overall_status === 'ok' && prev_status === 'degraded';
      if (becameDegraded) {
        alerted = await sendAlert({ ZAP_URL, ALERT_EMAIL, type: 'down', checks, duration_ms });
      } else if (recovered) {
        alerted = await sendAlert({ ZAP_URL, ALERT_EMAIL, type: 'up', checks, duration_ms });
      } else {
        alerted = 'no_transition';
      }
    } else {
      alerted = 'no_zapier_url';
    }

    try {
      await sb({
        SB_URL,
        SB_KEY,
        path: 'ha_health_checks',
        method: 'POST',
        body: JSON.stringify({ overall_status, checks, duration_ms, alerted }),
      });
      logged = 'ok';
    } catch (e) {
      logged = `failed: ${String(e?.message || e).slice(0, 200)}`;
      console.error('[healthcheck] log row failed:', e?.message || e);
    }
  }

  return res.status(200).json({
    ok: allOk,
    overall_status,
    duration_ms,
    dry_run: dryRun,
    prev_status,
    logged,
    alerted,
    checks,
  });
}

// ---------------------------------------------------------------------------
// Check helpers
// ---------------------------------------------------------------------------

async function checkSupabase({ SB_URL, SB_KEY }) {
  if (!SB_URL || !SB_KEY) return { ok: false, error: 'SUPABASE_URL/SERVICE_ROLE_KEY not set' };
  const t0 = Date.now();
  try {
    const r = await withTimeout(
      fetch(`${SB_URL}/rest/v1/ha_children?select=id&limit=1`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Accept: 'application/json' },
      }),
      TIMEOUTS.supabase,
    );
    const latency_ms = Date.now() - t0;
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return { ok: false, status: r.status, latency_ms, body: body.slice(0, 200) };
    }
    const data = await r.json().catch(() => null);
    return { ok: Array.isArray(data), status: r.status, latency_ms, rows: Array.isArray(data) ? data.length : null };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 200), latency_ms: Date.now() - t0 };
  }
}

async function checkAnthropic({ ANTHROPIC_KEY }) {
  if (!ANTHROPIC_KEY) return { ok: false, error: 'ANTHROPIC_API_KEY not set' };
  const t0 = Date.now();
  try {
    const r = await withTimeout(
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: HAIKU_MODEL,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      }),
      TIMEOUTS.anthropic,
    );
    const latency_ms = Date.now() - t0;
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return { ok: false, status: r.status, latency_ms, body: body.slice(0, 200) };
    }
    return { ok: true, status: r.status, latency_ms };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 200), latency_ms: Date.now() - t0 };
  }
}

async function checkSaturdayEmail({ SELF_BASE, cronSecret }) {
  const t0 = Date.now();
  try {
    const r = await withTimeout(
      fetch(`${SELF_BASE}/api/cron/saturday-email?dry_run=1`, {
        headers: { Authorization: `Bearer ${cronSecret}` },
      }),
      TIMEOUTS.saturday_email_cron,
    );
    const latency_ms = Date.now() - t0;
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return { ok: false, status: r.status, latency_ms, body: body.slice(0, 200) };
    }
    const data = await r.json().catch(() => null);
    const subject_present = Boolean(data && typeof data.subject === 'string' && data.subject.length > 0);
    const html_present = Boolean(data && typeof data.html_preview === 'string' && data.html_preview.length > 100);
    return {
      ok: subject_present && html_present,
      status: r.status,
      latency_ms,
      subject_present,
      html_present,
      counts: data && data.counts ? data.counts : null,
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 200), latency_ms: Date.now() - t0 };
  }
}

async function checkZapierDns({ ZAP_URL }) {
  if (!ZAP_URL) return { ok: false, error: 'ZAPIER_WEBHOOK_URL not set' };
  const t0 = Date.now();
  let host;
  try {
    host = new URL(ZAP_URL).host;
  } catch {
    return { ok: false, error: 'ZAPIER_WEBHOOK_URL is not a valid URL', latency_ms: Date.now() - t0 };
  }
  try {
    // Any HTTP response from the host means DNS + TCP + TLS + HTTP are alive.
    // Zapier's docs say HEAD returns 405 — we treat anything non-network as ok.
    const r = await withTimeout(fetch(`https://${host}/`, { method: 'HEAD' }), TIMEOUTS.zapier_dns);
    return { ok: true, host, status: r.status, latency_ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, host, error: String(e?.message || e).slice(0, 200), latency_ms: Date.now() - t0 };
  }
}

// ---------------------------------------------------------------------------
// Alert dispatch
// ---------------------------------------------------------------------------

async function sendAlert({ ZAP_URL, ALERT_EMAIL, type, checks, duration_ms }) {
  const isDown = type === 'down';
  const failed = Object.entries(checks).filter(([, v]) => v && v.ok === false);
  const failedCount = failed.length;
  const totalCount = Object.keys(checks).length;

  const subject = isDown
    ? `🚨 Hero Academy heartbeat failed (${failedCount}/${totalCount} checks down)`
    : `✅ Hero Academy heartbeat recovered`;

  const ts = new Date().toISOString();

  const detailRows = Object.entries(checks)
    .map(([k, v]) => {
      const statusBadge = v && v.ok
        ? '<span style="color:#22c55e;font-weight:600;">OK</span>'
        : '<span style="color:#ef4444;font-weight:600;">FAIL</span>';
      const detail = v && v.ok
        ? `latency ${v.latency_ms != null ? v.latency_ms + 'ms' : '—'}`
        : (v && v.error) || `status ${v && v.status}` || 'unknown';
      return `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;font-family:Menlo,monospace;font-size:13px;">${escapeHtml(k)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;">${statusBadge}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#475569;">${escapeHtml(detail)}</td>
      </tr>`;
    })
    .join('\n');

  const lead = isDown
    ? `Hero Academy's heartbeat just failed. ${failedCount} of ${totalCount} dependency checks went red.`
    : `Hero Academy's heartbeat is green again. All dependency checks are back to OK.`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0b2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2937;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:${isDown ? 'linear-gradient(135deg,#ef4444 0%,#f59e0b 100%)' : 'linear-gradient(135deg,#22c55e 0%,#14b8d4 100%)'};padding:24px;border-radius:16px 16px 0 0;text-align:center;color:#fff;">
      <h1 style="margin:0;font-size:22px;">${isDown ? '🚨 Heartbeat failed' : '✅ Heartbeat recovered'}</h1>
      <p style="margin:8px 0 0 0;font-size:14px;opacity:0.9;">Hero Academy system health</p>
    </div>
    <div style="background:#ffffff;padding:24px;border-radius:0 0 16px 16px;">
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">${escapeHtml(lead)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px;">
        <thead>
          <tr style="text-align:left;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">
            <th style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Check</th>
            <th style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Status</th>
            <th style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Detail</th>
          </tr>
        </thead>
        <tbody>${detailRows}</tbody>
      </table>
      <p style="margin:24px 0 0 0;font-size:12px;color:#94a3b8;text-align:center;">
        Heartbeat ran in ${duration_ms}ms at ${escapeHtml(ts)}.<br>
        ${isDown ? 'Reply to this email when resolved so the next heartbeat closes the loop.' : 'Posted because the previous heartbeat was degraded.'}
      </p>
    </div>
  </div>
</body></html>`;

  const text = [
    isDown ? '🚨 Hero Academy heartbeat FAILED' : '✅ Hero Academy heartbeat RECOVERED',
    '',
    lead,
    '',
    'Check details:',
    ...Object.entries(checks).map(([k, v]) => {
      if (v && v.ok) return `  ${k}: OK (${v.latency_ms != null ? v.latency_ms + 'ms' : '—'})`;
      return `  ${k}: FAIL — ${(v && v.error) || `status ${v && v.status}` || 'unknown'}`;
    }),
    '',
    `Run time: ${duration_ms}ms`,
    `Timestamp: ${ts}`,
  ].join('\n');

  try {
    const r = await fetch(ZAP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Same field shape the Gmail step in the Zap expects.
        to: ALERT_EMAIL,
        subject,
        html,
        text,
        reply_to: ALERT_EMAIL,
        kid_name: 'Nigel',
        week_ending: new Date().toISOString().slice(0, 10),
      }),
    });
    return r.ok ? `ok (${r.status})` : `failed (${r.status})`;
  } catch (e) {
    return `failed (${String(e?.message || e).slice(0, 100)})`;
  }
}

// ---------------------------------------------------------------------------
// Tiny utilities
// ---------------------------------------------------------------------------

async function sb({ SB_URL, SB_KEY, path, method, body, headers }) {
  const m = method || 'GET';
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: m,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json', Prefer: 'return=minimal' } : {}),
      ...(headers || {}),
    },
    body,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`supabase ${m} ${path} -> ${r.status} ${t.slice(0, 200)}`);
  }
  if (r.status === 204) return null;
  return r.json();
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
