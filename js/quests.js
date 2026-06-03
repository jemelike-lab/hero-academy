/**
 * Hero Academy — Real-world Quests (Build #7 v1).
 *
 * Ms. Humphrey issues a quest that takes Nigel OFF the screen for 30s-3min,
 * then back to report what he found. Anchors learning to the physical
 * world — the structural advantage homeschool has over pure-screen apps.
 *
 * V1 flow:
 *   1. Tap quest tile on home page
 *   2. Modal opens — Ms. Humphrey says the quest text aloud
 *   3. Nigel taps START → countdown timer begins
 *   4. He goes does the thing in real life
 *   5. Taps "I'm back!" → answer prompt (number or short text)
 *   6. Submits → Humphrey celebrates → recorded to ha_real_world_quests
 *
 * Public API:
 *   HeroAcademy.Quests.init({ container, tileId })
 *   HeroAcademy.Quests.openRandom()
 *   HeroAcademy.Quests.openQuest(questKey)
 *
 * Camera capture is intentionally OUT OF SCOPE for v1 — added in v2 once
 * iPad PWA permission UX is validated.
 */
(function () {
  'use strict';
  var NS = window.HeroAcademy = window.HeroAcademy || {};
  if (NS.Quests) return;

  // ---- Seed quest catalog ---------------------------------------------------
  // Each quest is age-7-appropriate and achievable in 30s–3 min indoors.
  // category drives the celebration tone + future Saturday-email grouping.
  // answer_kind: 'number' | 'text' | 'photo'.
  //   - number/text: Nigel types a short answer when he comes back
  //   - photo: Nigel snaps a picture for Ms. Humphrey, Haiku vision reacts
  var QUESTS = [
    { key: 'count_spoons',   text: 'Go count the spoons in the kitchen drawer.',         category: 'counting',    target_seconds:  90, answer_kind: 'number' },
    { key: 'find_blue',      text: 'Find something blue in your room.',                  category: 'color',       target_seconds:  60, answer_kind: 'text'   },
    { key: 'count_windows',  text: 'Count how many windows are in your house.',          category: 'counting',    target_seconds: 120, answer_kind: 'number' },
    { key: 'find_leaf',      text: 'Find a leaf with 5 points (or close!).',             category: 'observation', target_seconds: 180, answer_kind: 'text'   },
    { key: 'find_wheels',    text: 'Find something with 4 wheels (other than a car).',   category: 'observation', target_seconds: 120, answer_kind: 'text'   },
    { key: 'count_books',    text: 'Count how many books are on one of your shelves.',   category: 'counting',    target_seconds:  90, answer_kind: 'number' },
    { key: 'letter_s',       text: 'Find something that starts with the letter S.',      category: 'letter',      target_seconds:  60, answer_kind: 'text'   },
    { key: 'find_rock',      text: 'Find a rock smaller than your thumb (outside).',     category: 'observation', target_seconds: 180, answer_kind: 'text'   },
    { key: 'count_chairs',   text: 'Count the chairs at the dining table.',              category: 'counting',    target_seconds:  30, answer_kind: 'number' },
    { key: 'find_round',     text: 'Find something perfectly round in your house.',      category: 'observation', target_seconds:  90, answer_kind: 'text'   },
    // ---- Photo quests (Build #7 v2) — Nigel shows it to Ms. Humphrey -----
    { key: 'show_drawing',   text: 'Show me a drawing you have made recently.',          category: 'show_and_tell', target_seconds: 180, answer_kind: 'photo' },
    { key: 'show_stuffie',   text: 'Show me your favorite stuffed animal or toy.',       category: 'show_and_tell', target_seconds:  60, answer_kind: 'photo' },
    { key: 'show_build',     text: 'Show me something you built (LEGOs, fort, anything!).', category: 'show_and_tell', target_seconds: 240, answer_kind: 'photo' },
    { key: 'show_cool_shape', text: 'Find something with a cool shape and show me!',     category: 'show_and_tell', target_seconds: 180, answer_kind: 'photo' },
    { key: 'show_fav_book',  text: 'Show me one of your favorite books.',                category: 'show_and_tell', target_seconds:  90, answer_kind: 'photo' },
  ];

  function pickRandom() {
    // Avoid repeating the same quest twice in a row.
    var lastKey = null;
    try { lastKey = localStorage.getItem('ha_quest_last_key'); } catch (e) {}
    var pool = QUESTS.filter(function (q) { return q.key !== lastKey; });
    if (!pool.length) pool = QUESTS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function pickByKey(key) {
    return QUESTS.find(function (q) { return q.key === key; }) || null;
  }

  // ---- State ----------------------------------------------------------------
  var state = {
    inited:   false,
    tile:     null,
    overlay:  null,
    quest:    null,
    questId:  null,
    timer:    null,
    timerEndsAt: 0,
    // Build #7 v2 — camera capture lifecycle
    stream:           null,    // MediaStream from getUserMedia
    snapshotDataUrl:  null,    // captured frame as data:image/jpeg;base64,...
    snapshotMediaType: 'image/jpeg',
  };

  // ---- Modal UI -------------------------------------------------------------

  function buildOverlay() {
    if (state.overlay) return state.overlay;
    var ov = document.createElement('div');
    ov.id = 'questOverlay';
    ov.className = 'quest-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', 'Real-world quest');
    ov.innerHTML = [
      '<div class="quest-overlay__backdrop"></div>',
      '<div class="quest-overlay__card">',
      '  <button type="button" class="quest-overlay__close" aria-label="Close quest">\u2715</button>',
      '  <div class="quest-overlay__eyebrow">\ud83c\udf1f Real-world Quest</div>',
      '  <div class="quest-overlay__category" data-quest-category></div>',
      '  <h2 class="quest-overlay__text" data-quest-text></h2>',
      '  <div class="quest-overlay__timer" data-quest-timer hidden>',
      '    <div class="quest-overlay__timer-clock" data-quest-clock>00:00</div>',
      '    <div class="quest-overlay__timer-bar"><div class="quest-overlay__timer-fill" data-quest-fill></div></div>',
      '  </div>',
      '  <div class="quest-overlay__actions" data-quest-actions>',
      '    <button type="button" class="quest-overlay__cta" data-quest-start>Start the quest!</button>',
      '    <button type="button" class="quest-overlay__skip" data-quest-skip>Pick a different one</button>',
      '  </div>',
      '  <div class="quest-overlay__return" data-quest-return hidden>',
      '    <button type="button" class="quest-overlay__cta quest-overlay__cta--green" data-quest-done>I\u2019m back!</button>',
      '  </div>',
      '  <div class="quest-overlay__answer" data-quest-answer-block hidden>',
      '    <label class="quest-overlay__answer-label" for="questAnswerInput" data-quest-answer-label>How many did you find?</label>',
      '    <input type="text" id="questAnswerInput" class="quest-overlay__answer-input" data-quest-answer-input autocomplete="off" inputmode="text">',
      '    <button type="button" class="quest-overlay__cta" data-quest-submit>Tell Ms. Humphrey</button>',
      '  </div>',
      // ---- Camera capture (Build #7 v2) ------------------------------------
      '  <div class="quest-overlay__camera" data-quest-camera-block hidden>',
      '    <div class="quest-overlay__camera-frame" data-quest-video-wrap>',
      '      <video class="quest-overlay__camera-video" data-quest-video autoplay playsinline muted></video>',
      '      <canvas class="quest-overlay__camera-canvas" data-quest-snapshot-canvas hidden></canvas>',
      '      <img class="quest-overlay__camera-preview" data-quest-snapshot-img hidden alt="">',
      '    </div>',
      '    <div class="quest-overlay__camera-actions" data-quest-camera-actions>',
      '      <button type="button" class="quest-overlay__cta quest-overlay__snap" data-quest-snap>\ud83d\udcf8 Snap!</button>',
      '    </div>',
      '    <div class="quest-overlay__camera-preview-actions" data-quest-preview-actions hidden>',
      '      <button type="button" class="quest-overlay__skip" data-quest-retake>Retake</button>',
      '      <button type="button" class="quest-overlay__cta quest-overlay__cta--green" data-quest-send>Send to Ms. Humphrey</button>',
      '    </div>',
      '    <div class="quest-overlay__camera-error" data-quest-camera-error hidden>',
      '      <div class="quest-overlay__camera-error-msg" data-quest-camera-error-msg>Couldn\u2019t open the camera.</div>',
      '      <button type="button" class="quest-overlay__cta" data-quest-fallback-text>Tell me about it instead</button>',
      '    </div>',
      '  </div>',
      '  <div class="quest-overlay__vision-loading" data-quest-vision-loading hidden>',
      '    <div class="quest-overlay__spinner" aria-hidden="true"></div>',
      '    <div class="quest-overlay__vision-loading-text">Ms. Humphrey is looking\u2026</div>',
      '  </div>',
      '  <div class="quest-overlay__vision-result" data-quest-vision-block hidden>',
      '    <div class="quest-overlay__done-emoji">\ud83d\udc96</div>',
      '    <div class="quest-overlay__vision-text" data-quest-vision-text></div>',
      '    <button type="button" class="quest-overlay__cta" data-quest-vision-close>Back to home</button>',
      '  </div>',
      '  <div class="quest-overlay__done" data-quest-done-block hidden>',
      '    <div class="quest-overlay__done-emoji">\ud83c\udf89</div>',
      '    <div class="quest-overlay__done-headline">Awesome quest, Nigel!</div>',
      '    <div class="quest-overlay__done-sub" data-quest-done-sub></div>',
      '    <button type="button" class="quest-overlay__cta" data-quest-close>Back to home</button>',
      '  </div>',
      '</div>',
    ].join('');
    document.body.appendChild(ov);
    state.overlay = ov;

    // Wire close + skip + start + done + submit
    var $ = function (sel) { return ov.querySelector(sel); };
    $('.quest-overlay__close').addEventListener('click', closeOverlay);
    $('[data-quest-skip]').addEventListener('click', function () {
      var current = state.quest && state.quest.key;
      var next;
      // Pick a different one than current
      do { next = pickRandom(); } while (current && next.key === current && QUESTS.length > 1);
      renderQuest(next);
    });
    $('[data-quest-start]').addEventListener('click', startTimer);
    $('[data-quest-done]').addEventListener('click', stopTimer);
    $('[data-quest-submit]').addEventListener('click', submitAnswer);
    $('[data-quest-close]').addEventListener('click', closeOverlay);
    // Camera capture (Build #7 v2)
    $('[data-quest-snap]').addEventListener('click', snapPhoto);
    $('[data-quest-retake]').addEventListener('click', retakePhoto);
    $('[data-quest-send]').addEventListener('click', sendPhoto);
    $('[data-quest-fallback-text]').addEventListener('click', fallbackToText);
    $('[data-quest-vision-close]').addEventListener('click', closeOverlay);
    return ov;
  }

  function renderQuest(quest) {
    state.quest = quest;
    var ov = buildOverlay();
    ov.querySelector('[data-quest-text]').textContent = quest.text;
    ov.querySelector('[data-quest-category]').textContent =
      ({ counting: 'COUNTING',
         color: 'COLOR HUNT',
         letter: 'LETTER HUNT',
         observation: 'OBSERVATION',
         show_and_tell: 'SHOW AND TELL \u2022 \ud83d\udcf8' }[quest.category] || 'QUEST');
    // Reset phases
    ov.querySelector('[data-quest-actions]').hidden = false;
    ov.querySelector('[data-quest-return]').hidden = true;
    ov.querySelector('[data-quest-timer]').hidden = true;
    ov.querySelector('[data-quest-answer-block]').hidden = true;
    ov.querySelector('[data-quest-camera-block]').hidden = true;
    ov.querySelector('[data-quest-camera-actions]').hidden = false;
    ov.querySelector('[data-quest-preview-actions]').hidden = true;
    ov.querySelector('[data-quest-camera-error]').hidden = true;
    ov.querySelector('[data-quest-vision-loading]').hidden = true;
    ov.querySelector('[data-quest-vision-block]').hidden = true;
    ov.querySelector('[data-quest-done-block]').hidden = true;
    // Clear any prior snapshot + reset video/img visibility
    var img = ov.querySelector('[data-quest-snapshot-img]');
    var vid = ov.querySelector('[data-quest-video]');
    if (img) { img.hidden = true; img.removeAttribute('src'); }
    if (vid) { vid.hidden = false; }
    state.snapshotDataUrl = null;
    stopStream();
  }

  function openOverlay() {
    var ov = state.overlay;
    if (!ov) return;
    ov.classList.add('quest-overlay--in');
  }

  function closeOverlay() {
    var ov = state.overlay;
    if (!ov) return;
    ov.classList.remove('quest-overlay--in');
    clearInterval(state.timer); state.timer = null;
    stopStream();
    // After fade-out, fully reset state for next time
    setTimeout(function () {
      state.quest = null;
      state.questId = null;
      state.snapshotDataUrl = null;
    }, 320);
  }

  // Release the MediaStream and detach from video element. Idempotent.
  function stopStream() {
    if (state.stream) {
      try {
        state.stream.getTracks().forEach(function (t) { t.stop(); });
      } catch (e) {}
      state.stream = null;
    }
    if (state.overlay) {
      var vid = state.overlay.querySelector('[data-quest-video]');
      if (vid && vid.srcObject) {
        try { vid.srcObject = null; } catch (e) {}
      }
    }
  }

  // ---- Phase 2: timer -------------------------------------------------------
  function startTimer() {
    var ov = state.overlay;
    var quest = state.quest;
    if (!quest) return;
    // Hide the start actions, show timer + "I'm back" button
    ov.querySelector('[data-quest-actions]').hidden = true;
    ov.querySelector('[data-quest-timer]').hidden = false;
    ov.querySelector('[data-quest-return]').hidden = false;

    // Persist start in DB (fire-and-forget)
    persistStart(quest);

    // Humphrey announces the quest aloud
    speak('quest_start',
      'Okay Nigel \u2014 ' + quest.text + ' I will wait right here. Come back when you are ready.',
      'encouraging');

    // Countdown
    state.timerEndsAt = Date.now() + quest.target_seconds * 1000;
    updateTimer();
    state.timer = setInterval(updateTimer, 250);
  }

  function updateTimer() {
    var ov = state.overlay;
    var quest = state.quest;
    if (!quest) return;
    var remaining = Math.max(0, Math.round((state.timerEndsAt - Date.now()) / 1000));
    var mm = Math.floor(remaining / 60);
    var ss = remaining % 60;
    ov.querySelector('[data-quest-clock]').textContent =
      String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
    var pct = 100 * (1 - remaining / quest.target_seconds);
    ov.querySelector('[data-quest-fill]').style.width = pct + '%';
    if (remaining <= 0) {
      clearInterval(state.timer); state.timer = null;
      // Don't auto-stop — Nigel may still be looking. Just gently nudge.
      ov.querySelector('[data-quest-clock]').textContent = 'Time!';
    }
  }

  // ---- Phase 3: "I'm back" --------------------------------------------------
  function stopTimer() {
    clearInterval(state.timer); state.timer = null;
    var ov = state.overlay;
    var quest = state.quest;
    if (!quest) return;
    ov.querySelector('[data-quest-return]').hidden = true;
    if (quest.answer_kind === 'photo') {
      startCameraPhase();
      return;
    }
    // text / number — show input form
    ov.querySelector('[data-quest-answer-block]').hidden = false;
    var label = ov.querySelector('[data-quest-answer-label]');
    var input = ov.querySelector('[data-quest-answer-input]');
    if (quest.answer_kind === 'number') {
      label.textContent = 'How many did you find?';
      input.placeholder = 'e.g. 7';
      input.inputMode = 'numeric';
    } else {
      label.textContent = 'What did you find?';
      input.placeholder = 'Tell me what you saw...';
      input.inputMode = 'text';
    }
    input.value = '';
    setTimeout(function () { input.focus(); }, 100);
  }

  // ---- Phase 3b: Camera capture (photo quests only) -------------------------
  function startCameraPhase() {
    var ov = state.overlay;
    ov.querySelector('[data-quest-camera-block]').hidden = false;
    ov.querySelector('[data-quest-camera-actions]').hidden = false;
    ov.querySelector('[data-quest-preview-actions]').hidden = true;
    ov.querySelector('[data-quest-camera-error]').hidden = true;
    var vid = ov.querySelector('[data-quest-video]');
    var img = ov.querySelector('[data-quest-snapshot-img]');
    vid.hidden = false;
    img.hidden = true;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showCameraError('Your browser can\u2019t open the camera. No worries \u2014 you can tell me about it instead!');
      return;
    }

    // Prefer rear camera on tablets/phones for "show me your drawing".
    // Fall back to any camera if rear is unavailable (e.g. desktop laptop).
    var constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    };

    navigator.mediaDevices.getUserMedia(constraints)
      .catch(function (err) {
        // Retry without facingMode preference (some devices reject 'environment' exact)
        if (err && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) {
          return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        throw err;
      })
      .then(function (stream) {
        state.stream = stream;
        try {
          vid.srcObject = stream;
          // Android Chrome usually auto-plays muted videos; iOS Safari needs an explicit play()
          var p = vid.play();
          if (p && p.catch) p.catch(function () { /* ignore — user-gesture already happened */ });
        } catch (e) {
          showCameraError('Couldn\u2019t connect to the camera. Want to tell me about it instead?');
        }
      })
      .catch(function (err) {
        var msg;
        if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
          msg = 'Camera permission was denied. Tap "Tell me about it instead" or allow camera in your browser settings.';
        } else if (err && err.name === 'NotFoundError') {
          msg = 'No camera found on this device. Let\u2019s describe it with words instead!';
        } else {
          msg = 'Camera couldn\u2019t start (' + (err && err.name || 'unknown') + '). Tell me about it in words?';
        }
        showCameraError(msg);
      });
  }

  function showCameraError(msg) {
    var ov = state.overlay;
    ov.querySelector('[data-quest-camera-actions]').hidden = true;
    ov.querySelector('[data-quest-preview-actions]').hidden = true;
    var errBlock = ov.querySelector('[data-quest-camera-error]');
    ov.querySelector('[data-quest-camera-error-msg]').textContent = msg;
    errBlock.hidden = false;
  }

  function fallbackToText() {
    // Switch the current quest to text-answer mode and show the input form.
    if (!state.quest) return;
    state.quest = Object.assign({}, state.quest, { answer_kind: 'text' });
    stopStream();
    var ov = state.overlay;
    ov.querySelector('[data-quest-camera-block]').hidden = true;
    ov.querySelector('[data-quest-answer-block]').hidden = false;
    var label = ov.querySelector('[data-quest-answer-label]');
    var input = ov.querySelector('[data-quest-answer-input]');
    label.textContent = 'Tell me about what you found!';
    input.placeholder = 'Describe it...';
    input.inputMode = 'text';
    input.value = '';
    setTimeout(function () { input.focus(); }, 100);
  }

  function snapPhoto() {
    var ov = state.overlay;
    var vid = ov.querySelector('[data-quest-video]');
    var canvas = ov.querySelector('[data-quest-snapshot-canvas]');
    var img = ov.querySelector('[data-quest-snapshot-img]');

    if (!state.stream || !vid.videoWidth) {
      // Camera not ready yet
      return;
    }

    // Downscale to a sane upload size: max 1024px on the longer edge
    var maxDim = 1024;
    var srcW = vid.videoWidth;
    var srcH = vid.videoHeight;
    var scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    var dstW = Math.round(srcW * scale);
    var dstH = Math.round(srcH * scale);
    canvas.width = dstW;
    canvas.height = dstH;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(vid, 0, 0, dstW, dstH);

    var dataUrl = canvas.toDataURL('image/jpeg', 0.78);
    state.snapshotDataUrl = dataUrl;
    state.snapshotMediaType = 'image/jpeg';

    // Show preview
    img.src = dataUrl;
    img.hidden = false;
    vid.hidden = true;
    ov.querySelector('[data-quest-camera-actions]').hidden = true;
    ov.querySelector('[data-quest-preview-actions]').hidden = false;
  }

  function retakePhoto() {
    var ov = state.overlay;
    var vid = ov.querySelector('[data-quest-video]');
    var img = ov.querySelector('[data-quest-snapshot-img]');
    state.snapshotDataUrl = null;
    img.hidden = true;
    img.removeAttribute('src');
    vid.hidden = false;
    ov.querySelector('[data-quest-preview-actions]').hidden = true;
    ov.querySelector('[data-quest-camera-actions]').hidden = false;
    // Stream is still live; nothing else needed
  }

  function sendPhoto() {
    if (!state.snapshotDataUrl) return;
    var ov = state.overlay;
    var quest = state.quest;
    // Free the camera *before* we POST so the LED turns off and the tab isn't
    // holding the camera while waiting on the network round-trip.
    stopStream();
    // Hide camera, show loading spinner
    ov.querySelector('[data-quest-camera-block]').hidden = true;
    ov.querySelector('[data-quest-vision-loading]').hidden = false;

    fetch('/api/humphrey/see-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image:      state.snapshotDataUrl,
        media_type: state.snapshotMediaType,
        quest_text: quest && quest.text || '',
      }),
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (json) {
        var reaction = (json && json.reaction) ||
                       'I love what you showed me, Nigel \u2014 thank you for sharing!';
        showVisionResult(reaction);
        persistComplete('[photo] ' + reaction);
      })
      .catch(function (err) {
        var fallback = 'I had trouble seeing your picture clearly, Nigel, ' +
                       'but I love that you showed me. Tell me about it next time!';
        showVisionResult(fallback);
        persistComplete('[photo error] ' + (err && err.message || 'unknown'));
      });
  }

  function showVisionResult(text) {
    var ov = state.overlay;
    ov.querySelector('[data-quest-vision-loading]').hidden = true;
    var block = ov.querySelector('[data-quest-vision-block]');
    ov.querySelector('[data-quest-vision-text]').textContent = text;
    block.hidden = false;

    // Remember last key + Humphrey speaks it
    try {
      if (state.quest) localStorage.setItem('ha_quest_last_key', state.quest.key);
    } catch (e) {}
    speak('quest_complete', text, 'cheering');
  }

  // ---- Phase 4: submit ------------------------------------------------------
  function submitAnswer() {
    var ov = state.overlay;
    var quest = state.quest;
    if (!quest) return;
    var input = ov.querySelector('[data-quest-answer-input]');
    var answer = (input.value || '').trim();
    if (!answer) { input.focus(); return; }

    // Fire-and-forget the DB completion
    persistComplete(answer);

    // Move to done screen
    ov.querySelector('[data-quest-answer-block]').hidden = true;
    ov.querySelector('[data-quest-done-block]').hidden = false;
    var sub = ov.querySelector('[data-quest-done-sub]');
    if (quest.answer_kind === 'number') {
      sub.textContent = 'You found ' + answer + '! That\u2019s your real-world win for today.';
    } else {
      sub.textContent = 'You found ' + answer + '. Real-world hero work!';
    }

    // Remember last key so we don't repeat next time
    try { localStorage.setItem('ha_quest_last_key', quest.key); } catch (e) {}

    // Humphrey celebrates
    speak('quest_complete',
      (quest.answer_kind === 'number'
        ? 'You found ' + answer + '! Wonderful counting, Nigel. That is real-world math.'
        : 'You found ' + answer + '! What a great find. I love how you noticed that.'),
      'cheering');
  }

  // ---- DB persistence -------------------------------------------------------
  function persistStart(quest) {
    try {
      var T = (window.HeroAcademy && window.HeroAcademy.Telemetry) || null;
      if (!T || typeof T.rpc !== 'function') return;
      T.rpc('ha_start_quest', {
        p_child_id:       T.childId(),
        p_quest_key:      quest.key,
        p_quest_text:     quest.text,
        p_category:       quest.category,
        p_target_seconds: quest.target_seconds,
        p_source:         'home_tile',
      }).then(function (r) {
        if (!r || !r.ok) return;
        return r.text();
      }).then(function (txt) {
        if (!txt) return;
        try {
          // RPC returns a quoted string UUID, e.g., "\"abc-123\""
          state.questId = JSON.parse(txt);
        } catch (e) {
          state.questId = String(txt).replace(/"/g, '');
        }
      }).catch(function () {});
    } catch (e) {}
  }

  function persistComplete(answer) {
    try {
      var T = (window.HeroAcademy && window.HeroAcademy.Telemetry) || null;
      if (!T || typeof T.rpc !== 'function') return;
      if (!state.questId) return;
      T.rpc('ha_complete_quest', {
        p_quest_id: state.questId,
        p_answer:   answer,
      }).catch(function () {});
    } catch (e) {}
  }

  // ---- Ms. Humphrey speech helper ------------------------------------------
  function speak(eventKey, text, expression) {
    try {
      var H = (window.HeroAcademy && window.HeroAcademy.Humphrey) || null;
      if (H && typeof H.say === 'function') {
        H.say(eventKey, { text: text, expression: expression || 'encouraging' });
      }
    } catch (e) {}
  }

  // ---- Public entry points -------------------------------------------------

  function init(opts) {
    if (state.inited) return;
    state.inited = true;
    opts = opts || {};
    var tile = opts.tile || document.getElementById(opts.tileId || 'realWorldQuestTile');
    if (!tile) return;
    state.tile = tile;
    tile.removeAttribute('hidden');
    tile.addEventListener('click', function (e) {
      e.preventDefault();
      openRandom();
    });
  }

  function openRandom() {
    var quest = pickRandom();
    renderQuest(quest);
    openOverlay();
  }

  function openQuest(key) {
    var quest = pickByKey(key);
    if (!quest) return false;
    renderQuest(quest);
    openOverlay();
    return true;
  }

  NS.Quests = {
    init:       init,
    openRandom: openRandom,
    openQuest:  openQuest,
    QUESTS:     QUESTS,
  };
})();
