/* ═══════════════════════════════════════════════════════════════
   MISS HUMPHREY — ElevenLabs Voice Integration for Hero Academy
   v2.0 · Production build · iPad-optimized
   ═══════════════════════════════════════════════════════════════
   
   INSTALL:
   1. Drop this file into  hero-academy/js/
   2. Add to BOTH index.html AND number-lab.html
      (just before the closing </body> tag):
      
      <script src="js/humphrey-integration.js" defer></script>

   3. Update sw.js — add to CORE cache array:
      "./js/humphrey-integration.js",
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  // ── Config ──────────────────────────────────────────────────
  var AGENT_ID = "agent_5901kssbzjm1e0yvd0kdwxa3r49m";
  // Pin to latest stable — 0.12.8 includes iOS Safari WebSocket fix
  var SDK_URL  = "https://unpkg.com/@elevenlabs/convai-widget-embed@0.12.8";
  var WIDGET_ID = "msHumphreyWidget";

  // ── State ───────────────────────────────────────────────────
  var isCallActive = false;
  var audioUnlocked = false;

  // ── 1. iOS Safari Audio Unlock ──────────────────────────────
  // iPad Safari blocks AudioContext until a user gesture.
  // We unlock it on the very first tap anywhere, so ElevenLabs
  // doesn't drop the first agent message.
  function unlockAudio() {
    if (audioUnlocked) return;
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var buf = ctx.createBuffer(1, 1, 22050);
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      audioUnlocked = true;
      document.removeEventListener("touchstart", unlockAudio, true);
      document.removeEventListener("click", unlockAudio, true);
      console.log("[Humphrey] Audio context unlocked for iOS");
    } catch (e) { /* silent — non-critical */ }
  }
  document.addEventListener("touchstart", unlockAudio, true);
  document.addEventListener("click", unlockAudio, true);

  // ── 2. Inject ElevenLabs Widget ─────────────────────────────
  var widget = document.createElement("elevenlabs-convai");
  widget.id = WIDGET_ID;
  widget.setAttribute("agent-id", AGENT_ID);
  document.body.appendChild(widget);

  var script = document.createElement("script");
  script.src = SDK_URL;
  script.async = true;
  script.onerror = function () {
    console.warn("[Humphrey] Failed to load ElevenLabs SDK — voice unavailable");
  };
  document.body.appendChild(script);

  // ── 3. Widget CSS ───────────────────────────────────────────
  // Hidden by default. Shown via .el-active class.
  // Positioned to avoid overlapping the Ms. Humphrey FAB button.
  var style = document.createElement("style");
  style.textContent = [
    "elevenlabs-convai {",
    "  position: fixed !important;",
    "  bottom: 90px !important;",       /* sits above the FAB */
    "  right: 12px !important;",
    "  z-index: 9999 !important;",
    "  transition: opacity .25s ease;",
    "}",
    "elevenlabs-convai:not(.el-active) {",
    "  visibility: hidden !important;",
    "  pointer-events: none !important;",
    "  width: 0 !important;",
    "  height: 0 !important;",
    "  overflow: hidden !important;",
    "  opacity: 0 !important;",
    "}",
    "elevenlabs-convai.el-active {",
    "  visibility: visible !important;",
    "  pointer-events: auto !important;",
    "  width: auto !important;",
    "  height: auto !important;",
    "  opacity: 1 !important;",
    "}",
    /* Pulse glow on the FAB when call is live */
    ".humphrey-btn.on-call .humphrey-pulse {",
    "  animation: humphrey-live-pulse 1.2s ease-in-out infinite !important;",
    "  background: rgba(46, 204, 113, 0.35) !important;",
    "}",
    "@keyframes humphrey-live-pulse {",
    "  0%, 100% { transform: scale(1); opacity: .6; }",
    "  50%      { transform: scale(1.35); opacity: 0; }",
    "}",
  ].join("\n");
  document.head.appendChild(style);

  // ── 4. Helpers ──────────────────────────────────────────────
  function timeOfDay() {
    var h = new Date().getHours();
    return h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";
  }

  /** Gather live portal state for Miss Humphrey's dynamic variables */
  function getDynamicVars() {
    var v = {
      nigel_current_zone: "Home Map",
      nigel_current_skill: "browsing",
      nigel_current_problem: "none",
      nigel_streak_in_skill: "0",
      nigel_strikes_on_problem: "0",
      nigel_coins_today: "0",
      nigel_total_coins: "0",
      nigel_mastered_skills: "0",
      time_of_day: timeOfDay()
    };

    // ── Number Lab context ──
    if (window.location.pathname.indexOf("number-lab") !== -1
        && typeof session !== "undefined"
        && typeof MATH_SKILLS !== "undefined") {
      var sk = MATH_SKILLS[session.currentSkillId];
      v.nigel_current_zone        = "Number Lab";
      v.nigel_current_skill       = sk ? sk.name : "Math";
      v.nigel_current_problem     = session.currentProblem ? session.currentProblem.question : "none";
      v.nigel_streak_in_skill     = String(session.streakInSkill || 0);
      v.nigel_strikes_on_problem  = String(session.strikesOnProblem || 0);
      v.nigel_coins_today         = String(session.sessionCoins || 0);

      // Scaffold context — tells Miss Humphrey how to help
      if (sk && session.strikesOnProblem >= 2 && session.currentProblem) {
        v.nigel_needs_scaffold      = "true";
        v.nigel_scaffold_hint       = sk.workedExample
          ? sk.workedExample.explanation
          : "Walk Nigel through this step by step.";
      }
    }

    // ── Home screen context ──
    else if (typeof state !== "undefined") {
      v.nigel_coins_today  = String(state.coins || 0);
      v.nigel_total_coins  = String(state.totalCoins || state.coins || 0);
    }

    // Pull mastered skill count from localStorage
    try {
      var saved = JSON.parse(localStorage.getItem("heroAcademy") || "{}");
      if (saved.masteredSkills) {
        v.nigel_mastered_skills = String(
          Array.isArray(saved.masteredSkills) ? saved.masteredSkills.length : 0
        );
      }
    } catch (e) { /* safe to ignore */ }

    return v;
  }

  // ── 5. Start / Stop Call ────────────────────────────────────
  function startCall() {
    var el = document.getElementById(WIDGET_ID);
    if (!el) return;

    // Refresh dynamic vars right before the call
    el.setAttribute("dynamic-variables", JSON.stringify(getDynamicVars()));
    el.classList.add("el-active");

    // Try the SDK's startCall method first
    try {
      if (typeof el.startCall === "function") {
        el.startCall();
        isCallActive = true;
        updateButtonState(true);
        return;
      }
    } catch (e) { /* fall through to shadow DOM click */ }

    // Fallback: click the internal start button inside shadow DOM
    setTimeout(function () {
      try {
        var sr = el.shadowRoot;
        if (sr) {
          var btn = sr.querySelector("button");
          if (btn) btn.click();
          isCallActive = true;
          updateButtonState(true);
        }
      } catch (e) {
        console.warn("[Humphrey] Could not auto-start call:", e);
      }
    }, 800);
  }

  function endCall() {
    var el = document.getElementById(WIDGET_ID);
    if (!el) return;
    try {
      if (typeof el.endCall === "function") el.endCall();
    } catch (e) { /* silent */ }
    el.classList.remove("el-active");
    isCallActive = false;
    updateButtonState(false);
  }

  function updateButtonState(active) {
    var btn = document.getElementById("humphreyBtn");
    if (!btn) return;
    if (active) {
      btn.classList.add("on-call");
      var label = btn.querySelector(".humphrey-label");
      if (label) label.textContent = "End Call";
    } else {
      btn.classList.remove("on-call");
      var label2 = btn.querySelector(".humphrey-label");
      if (label2) label2.textContent = "Ms. Humphrey";
    }
  }

  // ── 6. Wire the Ms. Humphrey FAB Button ─────────────────────
  function wireButton() {
    var btn = document.getElementById("humphreyBtn");
    if (!btn) return;

    // Replace with a fresh clone to nuke any prior listeners
    var fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);

    fresh.addEventListener("click", function () {
      if (isCallActive) {
        // Toggle off — end the call
        endCall();
        if (typeof showRalphieSpeech === "function") {
          showRalphieSpeech("See you next time!");
        } else if (typeof showLabSpeech === "function") {
          showLabSpeech("See you next time!");
        }
        return;
      }

      // Start call
      fresh.classList.add("speaking");
      startCall();

      if (typeof showRalphieSpeech === "function") {
        showRalphieSpeech("Miss Humphrey is here!");
      } else if (typeof showLabSpeech === "function") {
        showLabSpeech("Miss Humphrey is here!");
      }

      setTimeout(function () {
        fresh.classList.remove("speaking");
      }, 2500);
    });
  }

  // ── 7. Auto-trigger on Strike 2 ────────────────────────────
  // The portal calls this globally when Nigel hits 2 strikes.
  // Miss Humphrey appears automatically to scaffold him.
  window.triggerHumphrey = function (context) {
    if (isCallActive) return; // already talking

    // Merge any extra context the caller provides
    if (context) {
      var el = document.getElementById(WIDGET_ID);
      if (el) {
        var vars = getDynamicVars();
        for (var k in context) {
          if (context.hasOwnProperty(k)) vars[k] = String(context[k]);
        }
        el.setAttribute("dynamic-variables", JSON.stringify(vars));
      }
    }

    startCall();

    if (typeof showRalphieSpeech === "function") {
      showRalphieSpeech("Let's work on this together!");
    } else if (typeof showLabSpeech === "function") {
      showLabSpeech("Let's work on this together!");
    }
  };

  // ── 8. Listen for widget close events ───────────────────────
  // ElevenLabs widget emits events when the call ends.
  // Clean up our UI state when that happens.
  function listenForCallEnd() {
    var el = document.getElementById(WIDGET_ID);
    if (!el) return;

    // The widget dispatches 'elevenlabs-convai:call-ended'
    el.addEventListener("elevenlabs-convai:call-ended", function () {
      isCallActive = false;
      el.classList.remove("el-active");
      updateButtonState(false);
      console.log("[Humphrey] Call ended");
    });

    // Also observe for the widget collapsing itself
    var observer = new MutationObserver(function () {
      if (isCallActive) {
        try {
          var sr = el.shadowRoot;
          if (sr) {
            // If the internal call UI is gone, treat as ended
            var callUI = sr.querySelector("[data-state='connected']");
            if (!callUI && isCallActive) {
              setTimeout(function () {
                // Double-check after a beat
                var stillConnected = sr.querySelector("[data-state='connected']");
                if (!stillConnected) {
                  isCallActive = false;
                  el.classList.remove("el-active");
                  updateButtonState(false);
                }
              }, 1500);
            }
          }
        } catch (e) { /* silent */ }
      }
    });

    // Observe shadow DOM changes
    setTimeout(function () {
      try {
        if (el.shadowRoot) {
          observer.observe(el.shadowRoot, { childList: true, subtree: true });
        }
      } catch (e) { /* shadow DOM may not be ready yet */ }
    }, 3000);
  }

  // ── 9. Boot ─────────────────────────────────────────────────
  function init() {
    setTimeout(function () {
      wireButton();
      listenForCallEnd();
      console.log("[Hero Academy] Miss Humphrey v2.0 loaded. Agent:", AGENT_ID);
    }, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
