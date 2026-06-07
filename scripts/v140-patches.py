#!/usr/bin/env python3
"""
v140 patcher — applies the surgical edits to existing files for Class Time integration.

Targets (relative to repo root):
  - js/app.js              add Class Time to ZONES + openZoneModal routing
  - js/today-mission.js    add Class Time as FIRST slot in daily mission
  - sw.js                  bump cache name v139 → v140 + precache new files

Idempotent: re-runs safely. Exits non-zero on missing files or unmatched anchors.
"""
import os
import re
import sys
import shutil
from pathlib import Path
from datetime import datetime

REPO = Path(os.environ.get("REPO_DIR", "/tmp/hero-deploy")).resolve()

# ---------- helpers ----------
def read(p):
    return Path(p).read_text(encoding="utf-8")

def write(p, s):
    Path(p).write_text(s, encoding="utf-8")

def backup(p):
    src = Path(p)
    if not src.exists(): return
    bak = src.with_suffix(src.suffix + ".v139.bak")
    if not bak.exists():
        shutil.copy2(src, bak)
        print(f"  backed up → {bak.name}")

def log(s): print(f"[v140-patch] {s}")
def fail(s):
    print(f"[v140-patch] FAIL: {s}", file=sys.stderr)
    sys.exit(2)

# ---------- 1. js/app.js — ZONES array entry + routing case ----------
def patch_app_js():
    p = REPO / "js" / "app.js"
    if not p.exists(): fail(f"{p} not found")
    src = read(p)
    orig = src

    # ZONE entry to insert. We use a unique marker comment so we can detect a re-run.
    zone_entry = (
        '{id:"class-time", name:"Class Time", subject:"Daily Lesson", emoji:"🎓",\n'
        '   desc:"7-minute class with Ms. Humphrey. She teaches today\'s lesson on a shared board.",\n'
        '   image:"ralphie_pointing", color:"amber", glow:"rgba(251,191,36,0.4)", isNew:true, '
        'badge:"CLASS", priority:"first"}'
    )

    if 'id:"class-time"' in src:
        log("app.js: class-time already in ZONES (skip)")
    else:
        # Strategy 1: insert at start of the ZONES array. Look for `const ZONES` or `var ZONES` declaration.
        m = re.search(r'((?:const|let|var)\s+ZONES\s*=\s*\[)', src)
        if not m:
            fail("could not find ZONES array declaration in app.js")
        idx = m.end()
        # Skip any whitespace then optional opening item
        # Find the next non-whitespace char
        j = idx
        while j < len(src) and src[j] in ' \t\r\n':
            j += 1
        # Insert at start of the array
        new_entry = "\n  " + zone_entry + ",\n  "
        src = src[:idx] + new_entry + src[idx:]
        log("app.js: inserted class-time as first ZONES entry")

    # Routing case in openZoneModal
    if 'class-time' in src and ('class-time.html' in src):
        log("app.js: class-time routing already wired (skip)")
    else:
        # Find an existing routing line we can pattern-match on, e.g. letter-lab.
        # The handoff says routing is an if/else chain. Two patterns we'll try:
        # 1) if (zone === "letter-lab") ... openInIframe("letter-lab.html")
        # 2) case "letter-lab": ... letter-lab.html
        anchor = None
        m1 = re.search(r"(zone(?:\.id)?\s*===?\s*['\"]letter-lab['\"][^\n]*\n)", src)
        if m1:
            insertion = (
                "    if (zone === 'class-time' || (zone && zone.id === 'class-time')) { "
                "location.href = 'class-time.html'; return; }\n"
            )
            src = src[:m1.start()] + insertion + src[m1.start():]
            log("app.js: added class-time routing above letter-lab (if/else chain)")
        else:
            m2 = re.search(r"(case\s+['\"]letter-lab['\"]\s*:)", src)
            if m2:
                insertion = "case 'class-time': location.href = 'class-time.html'; return;\n      "
                src = src[:m2.start()] + insertion + src[m2.start():]
                log("app.js: added class-time case above letter-lab (switch)")
            else:
                # Last resort: warn but don't fail — Josh can add manually
                log("WARN: could not auto-add class-time routing case (no letter-lab anchor). Add manually.")

    if src != orig:
        backup(p)
        write(p, src)
    else:
        log("app.js: no changes")

# ---------- 2. js/today-mission.js — Class Time as FIRST slot ----------
def patch_today_mission():
    p = REPO / "js" / "today-mission.js"
    if not p.exists(): fail(f"{p} not found")
    src = read(p)
    orig = src

    if "'class-time'" in src or '"class-time"' in src:
        log("today-mission.js: class-time already present (skip)")
        return

    # Strategy: find the mission slot array (usually `const MISSION` or similar with day mappings)
    # We'll insert class-time as the first entry. Common pattern: each slot is an object with
    # { zone, label, minutes, badge } or similar.
    # We look for a sentinel — letterDays line — to anchor.
    if 'letterDays' in src:
        # Try to find the slots/order array. Multiple possible patterns:
        # Pattern: an array literal containing zone ids as strings
        # We'll use a less-clever approach: find the first array of zones referenced.

        # Look for an array of zone objects that includes 'letter-lab' or 'cauldron-cafe' or 'explorer'.
        # Simplest: just add a new slot object at the top of the export/return.

        # We add by replacing letterDays line area with class-time slot inserted first.
        # Try to find the function `function buildMissionForDay` or `function todayMission`.
        m = re.search(r'(function\s+(?:build\w*|today\w*|getTodays?\w*Mission)\s*\([^)]*\)\s*\{)', src)
        if not m:
            log("WARN: couldn't find mission build function. Adding inline marker — Josh must manually slot class-time as first.")
            return

        # Just before the return statement of that function, push class-time to the front.
        # We inject a unique helper near the top of the function.
        insert_after = m.end()
        helper = (
            "\n  // v140: Class Time is the warmup, always slot 1\n"
            "  const __classTimeSlot = { id:'class-time', zone:'class-time', label:'Class Time', "
            "minutes:7, badge:'CLASS', emoji:'🎓', "
            "blurb:'7-minute class with Ms. Humphrey. She teaches today\\'s lesson on a shared board.' };\n"
        )
        src = src[:insert_after] + helper + src[insert_after:]

        # Now find the array that gets returned and prepend __classTimeSlot.
        # Try `return [` or `const slots = [`
        m2 = re.search(r'(return\s*\[)', src[insert_after:])
        if m2:
            ridx = insert_after + m2.end()
            src = src[:ridx] + " __classTimeSlot," + src[ridx:]
            log("today-mission.js: added class-time as first slot (return array)")
        else:
            log("WARN: couldn't locate mission return array. Helper variable injected — apply manually.")
    else:
        log("WARN: no letterDays sentinel in today-mission.js. Manual integration needed.")

    if src != orig:
        backup(p)
        write(p, src)

# ---------- 3. sw.js — bump cache version + precache new files ----------
def patch_sw():
    p = REPO / "sw.js"
    if not p.exists(): fail(f"{p} not found")
    src = read(p)
    orig = src

    # Bump cache version — common patterns:
    # const CACHE = 'hero-academy-v139';
    # const CACHE_NAME = 'hero-academy-v139';
    src2 = re.sub(r"(['\"])hero-academy-v\d+\1", "'hero-academy-v140'", src)
    if src2 != src:
        log("sw.js: bumped cache name to v140")
        src = src2
    elif "'hero-academy-v140'" in src or '"hero-academy-v140"' in src:
        log("sw.js: cache already at v140")
    else:
        # Try a generic version bump
        src2 = re.sub(r"(const\s+CACHE(?:_NAME)?\s*=\s*['\"])([^'\"]+?)v(\d+)(['\"])",
                      lambda m: m.group(1) + m.group(2) + "v140" + m.group(4), src)
        if src2 != src:
            log("sw.js: bumped generic cache version to v140")
            src = src2
        else:
            log("WARN: couldn't auto-bump SW cache version. Update CACHE name to v140 manually.")

    # Add new files to precache list, if a precache array exists.
    new_files = [
        '/class-time.html',
        '/js/class-time.js',
        '/js/class-time-board.js',
        '/js/class-time-visuals.js'
    ]
    if any(f in src for f in new_files):
        log("sw.js: new files already in precache (skip)")
    else:
        # Look for a PRECACHE / urlsToCache / ASSETS array.
        m = re.search(r"((?:const|let|var)\s+(?:PRECACHE|urlsToCache|ASSETS|FILES_TO_CACHE)\s*=\s*\[)", src)
        if m:
            idx = m.end()
            additions = "\n  " + ",\n  ".join(f"'{f}'" for f in new_files) + ","
            src = src[:idx] + additions + src[idx:]
            log("sw.js: added class-time files to precache")
        else:
            log("WARN: no precache array found in sw.js. New files will be fetched lazily — fine for Vercel.")

    if src != orig:
        backup(p)
        write(p, src)

# ---------- 4. vercel.json — register daily class-time-lessons cron ----------
def patch_vercel_json():
    import json
    p = REPO / "vercel.json"
    if not p.exists():
        log("vercel.json: not found — skipping (Josh will create or add cron manually)")
        return
    raw = read(p)
    try:
        cfg = json.loads(raw)
    except Exception as e:
        log(f"WARN: vercel.json invalid JSON: {e}. Skipping cron registration.")
        return

    crons = cfg.get("crons", [])
    if any(c.get("path") == "/api/cron/class-time-lessons" for c in crons):
        log("vercel.json: class-time-lessons cron already registered (skip)")
        return

    crons.append({"path": "/api/cron/class-time-lessons", "schedule": "0 10 * * *"})
    cfg["crons"] = crons
    backup(p)
    write(p, json.dumps(cfg, indent=2) + "\n")
    log("vercel.json: registered class-time-lessons cron at 10:00 UTC daily")

# ---------- Run ----------
def main():
    if not REPO.exists():
        fail(f"REPO_DIR not found: {REPO}")
    log(f"Repo: {REPO}")
    log(f"Started: {datetime.now().isoformat()}")
    patch_app_js()
    patch_today_mission()
    patch_sw()
    patch_vercel_json()
    log("Done.")

if __name__ == "__main__":
    main()
