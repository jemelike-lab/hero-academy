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

  function ensureMicPermission() {
    if (stream) return Promise.resolve(true);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      debug('getUserMedia not supported');
      return Promise.resolve(false);
    }
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      stream = s;
      debug('mic granted');
      return true;
    }).catch(function (err) {
      debug('mic denied:', err && err.name);
      stream = null;
      return false;
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
      if (!ok) return { transcript: '', error: 'no-mic' };

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

        setTimeout(function () {
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
    intentOf: intentOf
  };
})();
