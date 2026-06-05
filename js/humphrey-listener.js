/**
 * Hero Academy — Ms. Humphrey listener module.
 *
 * Captures audio from the mic via MediaRecorder, posts to /api/humphrey/listen
 * (ElevenLabs Scribe STT), returns a transcript.
 *
 * Public API on window.HeroAcademy.Listener:
 *   ensureMicPermission()                 -> Promise<bool>
 *   hasMicPermission()                    -> bool
 *   listen({ maxMs, onStart, onStop })    -> Promise<{transcript, error?, empty?, detail?}>
 *   intentOf(transcript)                  -> 'yes' | 'no' | 'unclear'
 *
 * To enable verbose console logging:  localStorage.ha_humphrey_debug = '1'
 */
(function () {
  'use strict';
  var NS = window.HeroAcademy = window.HeroAcademy || {};

  var stream = null;
  var recorder = null;
  var recording = false;

  function debug() {
    try {
      if (window.localStorage && localStorage.getItem('ha_humphrey_debug') === '1') {
        var args = ['[Humphrey Listener]'].concat([].slice.call(arguments));
        console.log.apply(console, args);
      }
    } catch (_) {}
  }

  function hasMicPermission() { return !!stream; }

  // Last failure reason from ensureMicPermission(), surfaced through listen().
  // One of: '', 'unsupported', 'denied-permanent', 'denied-now',
  // 'no-device', 'busy', 'security', 'aborted', 'unknown'.
  var lastMicFailure = '';
  function lastMicFailureReason() { return lastMicFailure; }

  // Peek the Permissions API (Chrome/Android supports it). Resolves to
  // 'granted' | 'denied' | 'prompt' | 'unknown'. Never rejects.
  function queryMicPermissionState() {
    if (!navigator.permissions || !navigator.permissions.query) {
      return Promise.resolve('unknown');
    }
    return navigator.permissions.query({ name: 'microphone' })
      .then(function (status) { return status && status.state ? status.state : 'unknown'; })
      .catch(function () { return 'unknown'; });
  }

  // Map a DOMException name from getUserMedia to one of our error codes.
  // We then combine it with the Permissions API state to tell apart
  // "denied right now in the prompt" from "denied permanently in settings".
  function classifyMicError(errName, permState) {
    if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || errName === 'SecurityError') {
      if (permState === 'denied') return 'denied-permanent';
      return 'denied-now';
    }
    if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') return 'no-device';
    if (errName === 'NotReadableError' || errName === 'TrackStartError') return 'busy';
    if (errName === 'AbortError') return 'aborted';
    if (errName === 'OverconstrainedError') return 'no-device';
    return 'unknown';
  }

  function ensureMicPermission() {
    if (stream) { lastMicFailure = ''; return Promise.resolve(true); }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      lastMicFailure = 'unsupported';
      debug('getUserMedia not supported');
      return Promise.resolve(false);
    }
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      stream = s;
      lastMicFailure = '';
      debug('mic granted');
      return true;
    }).catch(function (err) {
      var name = (err && err.name) || 'unknown';
      stream = null;
      // Race a quick Permissions API peek to distinguish denied-now vs
      // denied-permanent. Always resolves; never blocks longer than ~50ms.
      return queryMicPermissionState().then(function (state) {
        lastMicFailure = classifyMicError(name, state);
        debug('mic denied:', name, '/ permState=', state, '/ code=', lastMicFailure);
        return false;
      });
    });
  }

  function pickMimeType() {
    var candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/mp4',
      'audio/ogg;codecs=opus'
    ];
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    for (var i = 0; i < candidates.length; i++) {
      if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
    }
    return '';
  }

  function listen(opts) {
    opts = opts || {};
    var maxMs = opts.maxMs || 3500;
    var onStart = opts.onStart;
    var onStop  = opts.onStop;

    if (recording) {
      debug('already recording, refusing');
      return Promise.resolve({ transcript: '', error: 'already-recording' });
    }

    return ensureMicPermission().then(function (ok) {
      if (!ok) return { transcript: '', error: 'no-mic', detail: lastMicFailure || 'unknown' };

      var mimeType = pickMimeType();
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType: mimeType })
                            : new MediaRecorder(stream);
      } catch (e) {
        debug('MediaRecorder ctor failed:', e);
        return { transcript: '', error: 'no-recorder' };
      }

      var chunks = [];
      recorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      return new Promise(function (resolve) {
        recorder.onstop = function () {
          recording = false;
          // 1.5 — signal stop so the listening pulse on the portrait clears.
          try {
            if (NS.Humphrey && typeof NS.Humphrey.emit === 'function') {
              NS.Humphrey.emit('stopped-listening');
            }
          } catch (_) {}
          if (typeof onStop === 'function') { try { onStop(); } catch (_) {} }

          var blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
          debug('recording stopped, blob bytes:', blob.size);
          if (blob.size < 800) {
            resolve({ transcript: '', empty: true });
            return;
          }

          var fd = new FormData();
          fd.append('audio', blob, 'utterance.webm');

          fetch('/api/humphrey/listen', { method: 'POST', body: fd }).then(function (resp) {
            if (!resp.ok) {
              return resp.text().then(function (text) {
                debug('STT non-ok:', resp.status, text.slice(0, 200));
                resolve({
                  transcript: '',
                  error: 'STT-' + resp.status,
                  detail: text.slice(0, 200)
                });
              });
            }
            return resp.json().then(function (json) {
              var t = ((json.transcript || '') + '').toLowerCase().trim();
              debug('transcript:', JSON.stringify(t));
              resolve({ transcript: t });
            });
          }).catch(function (err) {
            debug('fetch err:', err);
            resolve({ transcript: '', error: 'fetch-failed', detail: String(err && err.message) });
          });
        };

        try {
          recorder.start();
          recording = true;
          // 1.5 — signal the listening state to Humphrey so the corner
          // portrait can pulse while the mic is hot. Try/catch is defensive:
          // Humphrey.emit may not exist on older bundles in cache.
          try {
            if (NS.Humphrey && typeof NS.Humphrey.emit === 'function') {
              NS.Humphrey.emit('started-listening');
            }
          } catch (_) {}
          if (typeof onStart === 'function') { try { onStart(); } catch (_) {} }
          debug('recording started, maxMs=' + maxMs);
        } catch (e) {
          recording = false;
          resolve({ transcript: '', error: 'start-failed', detail: String(e && e.message) });
          return;
        }

        // ---- VAD: silence-based auto-stop ---------------------------------
        // Adds Web Audio analyser. After a minimum recording window, if RMS
        // stays below threshold for N consecutive ms, stop the recorder.
        // This means kids can read at their own pace; Ms. Humphrey only
        // "decides he's done" after sustained silence, not on a hard timeout.
        // The maxMs ceiling still applies as a safety backup.
        var vad = opts.vad || {};
        var vadEnabled    = vad.enabled !== false; // default ON
        var vadMinMs      = vad.minRecordMs || 2500;  // floor before silence-stop applies
        var vadSilenceMs  = vad.silenceEndMs || 1500; // silence duration that triggers stop
        var vadThreshold  = vad.rmsThreshold || 0.018; // RMS below this is "silent"

        var vadInterval = null;
        var vadAC = null;
        function teardownVad() {
          if (vadInterval) { clearInterval(vadInterval); vadInterval = null; }
          if (vadAC) { try { vadAC.close(); } catch (_) {} vadAC = null; }
        }

        if (vadEnabled && typeof (window.AudioContext || window.webkitAudioContext) !== 'undefined') {
          try {
            vadAC = new (window.AudioContext || window.webkitAudioContext)();
            var vadSrc = vadAC.createMediaStreamSource(stream);
            var vadAnalyser = vadAC.createAnalyser();
            vadAnalyser.fftSize = 1024;
            vadAnalyser.smoothingTimeConstant = 0.4;
            vadSrc.connect(vadAnalyser);
            var vadBuf = new Float32Array(vadAnalyser.fftSize);
            var vadStartTs = Date.now();
            var vadLastLoudTs = vadStartTs;
            vadInterval = setInterval(function () {
              if (!recorder || recorder.state !== 'recording') { teardownVad(); return; }
              try { vadAnalyser.getFloatTimeDomainData(vadBuf); } catch (_) { teardownVad(); return; }
              var sumSq = 0;
              for (var i = 0; i < vadBuf.length; i++) sumSq += vadBuf[i] * vadBuf[i];
              var rms = Math.sqrt(sumSq / vadBuf.length);
              var now = Date.now();
              if (rms > vadThreshold) vadLastLoudTs = now;
              var elapsed = now - vadStartTs;
              var silentFor = now - vadLastLoudTs;
              if (elapsed >= vadMinMs && silentFor >= vadSilenceMs) {
                debug('VAD: silence ' + silentFor + 'ms after ' + elapsed + 'ms — auto-stop');
                teardownVad();
                try { if (recorder && recorder.state === 'recording') recorder.stop(); } catch (_) {}
              }
            }, 120);
            debug('VAD armed: minMs=' + vadMinMs + ' silenceMs=' + vadSilenceMs + ' rms=' + vadThreshold);
          } catch (vadErr) {
            debug('VAD setup failed:', vadErr && vadErr.message);
            teardownVad();
          }
        }

        // Hard ceiling — still applies as backup.
        setTimeout(function () {
          teardownVad();
          try {
            if (recorder && recorder.state === 'recording') recorder.stop();
          } catch (_) {}
        }, maxMs);
      });
    });
  }

  /**
   * Heuristic intent detector tuned for 7-year-old speech.
   * Negative patterns are checked FIRST so "I don't need help" doesn't trigger "yes".
   * Returns 'yes' | 'no' | 'unclear'.
   */
  function intentOf(transcript) {
    if (!transcript) return 'unclear';
    var t = String(transcript).toLowerCase();
    if (/\b(no|nope|nah|don'?t need|i got it|got it|got this|i can do it|i'?m good|im good|leave me|stop|by myself|on my own|not now)\b/.test(t)) return 'no';
    if (/\b(yes|yeah|yep|yup|please|help|sure|ok|okay|i need|i\s*don'?t|dunno|stuck|hard|tricky|show me|tell me|i give up)\b/.test(t)) return 'yes';
    return 'unclear';
  }

  NS.Listener = {
    listen: listen,
    stop: function () {
      try {
        if (recorder && recorder.state === 'recording') recorder.stop();
      } catch (_) {}
    },
    ensureMicPermission: ensureMicPermission,
    hasMicPermission: hasMicPermission,
    lastMicFailureReason: lastMicFailureReason,
    queryMicPermissionState: queryMicPermissionState,
    intentOf: intentOf
  };
})();
