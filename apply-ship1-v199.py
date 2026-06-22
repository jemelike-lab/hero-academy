#!/usr/bin/env python3
"""
Ship 1 (v199): Fix Today's Mission checkmarks for Word Tower, Story Time,
Hero Hall.

Run from /tmp/hero-deploy after git pull. Idempotent-ish: each edit asserts
the old block exists exactly once before replacing, so re-running on an
already-patched tree will fail loudly rather than corrupt state.

Usage on VPS:
  cd /tmp/hero-deploy
  git fetch origin main -q && git reset --hard origin/main -q
  python3 apply-ship1-v199.py
  git add -A
  git commit -m "Fix Today's Mission checkmarks (v199)"
  git push
"""

import io
import os
import sys


def patch_file(path, old, new):
    with io.open(path, "r", encoding="utf-8") as f:
        s = f.read()
    count = s.count(old)
    assert count == 1, f"{path}: expected exactly 1 match, got {count}"
    s2 = s.replace(old, new, 1)
    with io.open(path, "w", encoding="utf-8") as f:
        f.write(s2)
    print(f"  patched: {path}")


# 1. js/word-tower-reading.js  —  finishSession()
WT_OLD = """  function finishSession() {
    hide($('wt-stage'));
    var endCard = $('wt-end-card');
    if (!endCard) {
      endCard = document.createElement('section');
      endCard.id = 'wt-end-card';
      endCard.className = 'wt-end-card';
      document.body.appendChild(endCard);
    }
    endCard.hidden = false;"""

WT_NEW = """  function finishSession() {
    // v199: cap-proof completion flag for Today's Mission checkmark.
    try {
      var dk = 'ha_zone_done_' + new Date().toISOString().slice(0, 10);
      var df = JSON.parse(localStorage.getItem(dk) || '{}');
      df['word-tower'] = true;
      localStorage.setItem(dk, JSON.stringify(df));
    } catch (_) {}
    try {
      if (NS.TodayMission && typeof NS.TodayMission.markVisited === 'function') {
        NS.TodayMission.markVisited('word-tower');
      }
    } catch (_) {}

    hide($('wt-stage'));
    var endCard = $('wt-end-card');
    if (!endCard) {
      endCard = document.createElement('section');
      endCard.id = 'wt-end-card';
      endCard.className = 'wt-end-card';
      document.body.appendChild(endCard);
    }
    endCard.hidden = false;"""

# 2. js/story-time.js  —  finishPassage()
ST_OLD = """  function finishPassage() {
    state.passagesRead += 1;
    hide($('st-stage'));"""

ST_NEW = """  function finishPassage() {
    state.passagesRead += 1;

    // v199: cap-proof completion flag for Today's Mission checkmark.
    try {
      var dk = 'ha_zone_done_' + new Date().toISOString().slice(0, 10);
      var df = JSON.parse(localStorage.getItem(dk) || '{}');
      df['story-time'] = true;
      localStorage.setItem(dk, JSON.stringify(df));
    } catch (_) {}
    try {
      if (NS.TodayMission && typeof NS.TodayMission.markVisited === 'function') {
        NS.TodayMission.markVisited('story-time');
      }
    } catch (_) {}

    hide($('st-stage'));"""

# 3. hero-hall.html  —  on-entry mark (passive trophy room)
HH_OLD = """<script>
  // telemetry.js + humphrey.js loaded earlier so the async grid render
  // can reach them. This block just kicks off Humphrey's welcome.
  if (window.HeroAcademy && window.HeroAcademy.Humphrey) {
    window.HeroAcademy.Humphrey.init({
      position: 'bottom-left',
      audioEnabled: true,
      debug: false,
      welcomeEvent: 'welcome-hero-hall',
      kidName: 'Nigel',
    });
  }
</script>
</html>"""

HH_NEW = """<script>
  // telemetry.js + humphrey.js loaded earlier so the async grid render
  // can reach them. This block just kicks off Humphrey's welcome.
  if (window.HeroAcademy && window.HeroAcademy.Humphrey) {
    window.HeroAcademy.Humphrey.init({
      position: 'bottom-left',
      audioEnabled: true,
      debug: false,
      welcomeEvent: 'welcome-hero-hall',
      kidName: 'Nigel',
    });
  }

  // v199: Hero Hall is a trophy room — visiting it IS the activity.
  // Mark the daily mission step complete on entry so the bullseye \u2192 \u2713.
  try {
    var dk = 'ha_zone_done_' + new Date().toISOString().slice(0, 10);
    var df = JSON.parse(localStorage.getItem(dk) || '{}');
    df['hero-hall'] = true;
    localStorage.setItem(dk, JSON.stringify(df));
  } catch (_) {}
  try {
    if (window.HeroAcademy && window.HeroAcademy.TodayMission &&
        typeof window.HeroAcademy.TodayMission.markVisited === 'function') {
      window.HeroAcademy.TodayMission.markVisited('hero-hall');
    }
  } catch (_) {}
</script>
</html>"""

# 4. sw.js  —  cache version bump
SW_OLD = "const CACHE_VERSION = 'hero-academy-v198';"
SW_NEW = "const CACHE_VERSION = 'hero-academy-v199';"


print("Applying Ship 1 (v199) — mission checkmark fix")
patch_file("js/word-tower-reading.js", WT_OLD, WT_NEW)
patch_file("js/story-time.js",         ST_OLD, ST_NEW)
patch_file("hero-hall.html",           HH_OLD, HH_NEW)
patch_file("sw.js",                    SW_OLD, SW_NEW)
print("All four files patched. Next: node --check on the two JS files,")
print("then git add -A && git commit && git push.")
