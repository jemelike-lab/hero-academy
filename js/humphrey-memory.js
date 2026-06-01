/**
 * Hero Academy — Ms. Humphrey memory module.
 *
 * Two layers of memory:
 *
 *   Layer 1: Profile (data/nigel-profile.json)
 *     Static-ish facts about the kid. Fetched once on page load, cached.
 *     Edit the JSON file to update — no code change needed.
 *
 *   Layer 2: Conversation summaries (localStorage)
 *     Every time a conversation ends with at least 2 turns, the transcript is
 *     POSTed to /api/humphrey/summarize which returns a 2-3 sentence summary.
 *     We store the timestamped summary in localStorage and feed the last 7
 *     days' worth into the chat system prompt on every turn.
 *
 *   Combined: getContext() returns { profile, recentSummaries } which is
 *   attached to each chat request as additional fields.
 *
 * Public API on window.HeroAcademy.Memory:
 *   ready()                             -> Promise<void> resolves once profile fetched
 *   getProfile()                        -> profile object (or null)
 *   getRecentSummaries(days?)           -> [{date, summary}]
 *   getContext()                        -> Promise<{profile, recentSummaries}>
 *   recordConversationEnd(history)      -> fire-and-forget; summarizes + stores
 *   clearSummaries()                    -> wipes all stored summaries
 *
 * localStorage schema:
 *   ha_humphrey_summaries = JSON [{ at: ISO, summary: string }, ...] (capped 50)
 */
(function () {
  'use strict';
  var NS = window.HeroAcademy = window.HeroAcademy || {};

  var STORAGE_KEY = 'ha_humphrey_summaries';
  var MAX_STORED  = 50;
  var DEFAULT_WINDOW_DAYS = 7;
  var MIN_TURNS_TO_SUMMARIZE = 2;  // user + assistant minimum
  var PROFILE_URL = 'data/nigel-profile.json';

  var cachedProfile = null;
  var profileError = null;
  var profilePromise = null;

  function debugOn() {
    try { return localStorage.getItem('ha_humphrey_debug') === '1'; }
    catch (_) { return false; }
  }
  function debug() {
    if (!debugOn()) return;
    var args = ['[Humphrey Memory]'].concat([].slice.call(arguments));
    try { console.log.apply(console, args); } catch (_) {}
  }

  function fetchProfile() {
    if (profilePromise) return profilePromise;
    profilePromise = fetch(PROFILE_URL, { cache: 'no-store' })
      .then(function (resp) {
        if (!resp.ok) throw new Error('profile HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (json) {
        cachedProfile = json;
        debug('profile loaded:', json && json.name, 'age', json && json.age);
        return json;
      })
      .catch(function (err) {
        profileError = err;
        debug('profile load failed:', err && err.message);
        // Don't reject — return a minimal fallback so chat still works
        cachedProfile = null;
        return null;
      });
    return profilePromise;
  }

  function ready() { return fetchProfile().then(function () { /* void */ }); }
  function getProfile() { return cachedProfile; }

  function getStoredSummaries() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function setStoredSummaries(arr) {
    try {
      // Keep newest MAX_STORED only
      var trimmed = arr.slice(-MAX_STORED);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {
      debug('storage write failed:', e && e.message);
    }
  }

  /**
   * Return summaries within the last N days, oldest first.
   * Each entry: { at: ISO timestamp, summary: string }
   */
  function getRecentSummaries(days) {
    if (typeof days !== 'number') days = DEFAULT_WINDOW_DAYS;
    var cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    return getStoredSummaries().filter(function (entry) {
      try {
        var t = new Date(entry.at).getTime();
        return isFinite(t) && t >= cutoff;
      } catch (_) { return false; }
    });
  }

  /**
   * The thing the chat endpoint actually consumes.
   * Wait for profile (one-time fetch); then attach summaries (sync read).
   */
  function getContext() {
    return fetchProfile().then(function () {
      return {
        profile: cachedProfile,
        recentSummaries: getRecentSummaries(DEFAULT_WINDOW_DAYS)
      };
    });
  }

  /**
   * At convo end, ask the server to summarize. Fire-and-forget.
   * history shape: [{role:'user'|'assistant', content:string}, ...]
   */
  function recordConversationEnd(history) {
    if (!Array.isArray(history) || history.length < MIN_TURNS_TO_SUMMARIZE) {
      debug('too short to summarize, skipping');
      return Promise.resolve(null);
    }
    debug('summarizing', history.length, 'turns');
    return fetch('/api/humphrey/summarize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ history: history })
    })
    .then(function (resp) {
      if (!resp.ok) return resp.text().then(function (t) {
        throw new Error('summarize HTTP ' + resp.status + ' ' + t.slice(0, 200));
      });
      return resp.json();
    })
    .then(function (json) {
      var summary = (json && json.summary && String(json.summary).trim()) || '';
      if (!summary) { debug('empty summary, skipping'); return null; }
      var entry = { at: new Date().toISOString(), summary: summary };
      var all = getStoredSummaries();
      all.push(entry);
      setStoredSummaries(all);
      debug('stored summary:', summary.slice(0, 80));
      return entry;
    })
    .catch(function (err) {
      debug('summarize failed:', err && err.message);
      return null;
    });
  }

  function clearSummaries() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }

  // Kick off profile fetch immediately so it's ready before the first tap
  fetchProfile();

  NS.Memory = {
    ready: ready,
    getProfile: getProfile,
    getRecentSummaries: getRecentSummaries,
    getContext: getContext,
    recordConversationEnd: recordConversationEnd,
    clearSummaries: clearSummaries
  };
})();
