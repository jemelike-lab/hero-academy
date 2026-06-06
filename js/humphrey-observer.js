(function(){
  'use strict';
  var DEFAULT_COOLDOWN_MS = 25000;
  var FORCE_MIN_GAP_MS = 4000;
  var THUMB_SIZE = 384;
  function downscale(canvas, maxDim) {
    var w = canvas.width, h = canvas.height;
    var maxSide = Math.max(w, h);
    if (maxSide <= maxDim) return canvas.toDataURL('image/png');
    var scale = maxDim / maxSide;
    var c = document.createElement('canvas');
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  }
  function makeObserver(activity, opts) {
    opts = opts || {};
    var kidName = opts.kidName || 'Nigel';
    var lastSpokeAt = 0;
    var inflight = false;
    var actionCounts = {};
    var pilot = null;
    function markAction(label) { actionCounts[label] = (actionCounts[label] || 0) + 1; }
    function reset() { actionCounts = {}; }
    function summarize() {
      var parts = Object.keys(actionCounts).map(function(k){
        var n = actionCounts[k];
        return n === 1 ? ('1 ' + k) : (n + ' ' + k + 's');
      });
      if (!parts.length) return 'just exploring';
      return parts.join(', ');
    }
    function hasActions() { return Object.keys(actionCounts).length > 0; }
    async function observe(captureFn, options) {
      options = options || {};
      var now = Date.now();
      var minGap = options.force ? FORCE_MIN_GAP_MS : DEFAULT_COOLDOWN_MS;
      if (inflight) return false;
      if (now - lastSpokeAt < minGap) return false;
      try {
        if (window.HeroAcademy && window.HeroAcademy.Humphrey && window.HeroAcademy.Humphrey.isSpeaking && window.HeroAcademy.Humphrey.isSpeaking()) {
          return false;
        }
      } catch(e){}
      var captured;
      try { captured = await captureFn(); } catch(e){ return false; }
      var imageDataUrl;
      if (typeof captured === 'string' && captured.indexOf('data:image/') === 0) imageDataUrl = captured;
      else if (captured && typeof captured.toDataURL === 'function') imageDataUrl = downscale(captured, THUMB_SIZE);
      else return false;
      inflight = true;
      lastSpokeAt = now;
      try {
        var actionSummary = options.actionSummary || summarize();
        var resp = await fetch('/api/humphrey-observe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activity: activity, imageDataUrl: imageDataUrl, actionSummary: actionSummary }),
        });
        if (!resp.ok) return false;
        var data = await resp.json();
        if (!data || !data.text) return false;
        if (window.HeroAcademy && window.HeroAcademy.Humphrey) {
          window.HeroAcademy.Humphrey.say('quick-praise', {
            kidName: kidName,
            text: data.text,
            expression: data.expression || 'encouraging',
          });
        }
        reset();
        return true;
      } catch(e) { return false; }
      finally { inflight = false; }
    }
    function autopilot(captureFn, opts2) {
      opts2 = opts2 || {};
      var interval = opts2.intervalMs || 14000;
      if (pilot) clearInterval(pilot);
      pilot = setInterval(function(){
        if (!hasActions()) return;
        if (Date.now() - lastSpokeAt < DEFAULT_COOLDOWN_MS) return;
        if (inflight) return;
        observe(captureFn);
      }, interval);
      return function stop() { if (pilot) clearInterval(pilot); pilot = null; };
    }
    return {
      observe: observe, markAction: markAction, reset: reset,
      summarize: summarize, autopilot: autopilot,
      get lastSpokeAt() { return lastSpokeAt; },
      get isInflight() { return inflight; },
    };
  }
  window.HeroAcademy = window.HeroAcademy || {};
  window.HeroAcademy.HumphreyObserver = { make: makeObserver };
})();
