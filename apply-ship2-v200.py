#!/usr/bin/env python3
"""
Ship 2 (v200): Hero Hall — fix invisible modal text + lock UX.

Run AFTER v199 has been applied (or on a tree where v199 changes are present).

Usage on VPS:
  cd /tmp/hero-deploy
  git fetch origin main -q && git reset --hard origin/main -q
  # apply v199 first if not yet deployed:
  #   python3 apply-ship1-v199.py && git add -A && git commit -m "..." && git push
  # then v200:
  python3 apply-ship2-v200.py
  git add -A
  git commit -m "Hero Hall — fix invisible modal text + lock UX (v200)"
  git push
"""

import io


def patch_file(path, old, new):
    with io.open(path, "r", encoding="utf-8") as f:
        s = f.read()
    count = s.count(old)
    assert count == 1, f"{path}: expected exactly 1 match, got {count}"
    s2 = s.replace(old, new, 1)
    with io.open(path, "w", encoding="utf-8") as f:
        f.write(s2)
    print(f"  patched: {path}")


# 1. hero-hall.html  —  define --gold-text (was undefined, 6 referenced rules
#    fell through to unset)
HH_VAR_OLD = """  :root {
    --bg-space:#fff7ed; --bg-deep:#fed7aa; --bg-purple:#c7d2fe;
    --gold:#ffd147; --gold-bright:#ffe580;
    --orange:#ff8b3d;"""

HH_VAR_NEW = """  :root {
    --bg-space:#fff7ed; --bg-deep:#fed7aa; --bg-purple:#c7d2fe;
    --gold:#ffd147; --gold-bright:#ffe580;
    --gold-text:#7c2d12;
    --orange:#ff8b3d;"""

# 2. hero-hall.html  —  .modal .ep-text: pale cream was invisible on light
#    modal bg, swap to dark slate
HH_EPTEXT_OLD = """  .modal .ep-text { flex:1; font-size:0.95rem; line-height:1.5;
                    color:rgba(245,232,200,0.92); text-align:left; }"""

HH_EPTEXT_NEW = """  .modal .ep-text { flex:1; font-size:0.95rem; line-height:1.5;
                    color:rgba(30,41,59,0.92); text-align:left; }"""

# 3. hero-hall.html  —  locked card UX: kill pointer cursor, add lock/earned
#    badges so the discovered/undiscovered state is unambiguous
HH_LOCK_OLD = """  .card.unlocked::before { opacity: .25; }
  .card.unlocked:active { transform: scale(.97); }
  .card.locked { opacity: .58; filter: grayscale(.7); }"""

HH_LOCK_NEW = """  .card.unlocked::before { opacity: .25; }
  .card.unlocked:active { transform: scale(.97); }
  .card.locked { opacity: .58; filter: grayscale(.7);
                 cursor: default; pointer-events: none; }
  .card.locked::after {
    content: '\U0001f512 LOCKED';
    position: absolute; top: 10px; right: 10px;
    background: rgba(30,41,59,.78); color: #fff;
    font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
    padding: 4px 9px; border-radius: 8px; z-index: 2;
  }
  .card.unlocked::after {
    content: '\u2713 EARNED';
    position: absolute; top: 10px; right: 10px;
    background: var(--char-color, var(--gold)); color: #1e293b;
    font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
    padding: 4px 9px; border-radius: 8px; z-index: 2;
    box-shadow: 0 2px 8px rgba(0,0,0,.18);
  }
  /* Squad-ready overrides earned badge with its own star variant */
  .card.squad-ready.unlocked::after { content: '\u2605 SQUAD READY'; }"""

# 4. sw.js  —  cache version bump
SW_OLD = "const CACHE_VERSION = 'hero-academy-v199';"
SW_NEW = "const CACHE_VERSION = 'hero-academy-v200';"


print("Applying Ship 2 (v200) — Hero Hall fixes")
patch_file("hero-hall.html", HH_VAR_OLD,    HH_VAR_NEW)
patch_file("hero-hall.html", HH_EPTEXT_OLD, HH_EPTEXT_NEW)
patch_file("hero-hall.html", HH_LOCK_OLD,   HH_LOCK_NEW)
patch_file("sw.js",          SW_OLD,        SW_NEW)
print("All four edits applied. Next: git add -A && git commit && git push.")
