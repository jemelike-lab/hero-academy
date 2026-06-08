// js/class-time.js
// Class Time orchestrator: lesson plan + ConvAI + 7-min timer + auto-vision-capture.
(function(){
  'use strict';
  const NS = window.HeroAcademy = window.HeroAcademy || {};

  const AGENT_ID = 'agent_5901kssbzjm1e0yvd0kdwxa3r49m';
  const SESSION_DURATION_SEC = 7 * 60; // 7 minutes
  const AUTO_CAPTURE_INTERVAL_MS = 8000;
  const CAPTURE_AFTER_STOP_MS = 2500;
  const CHILD_ID = '2e0e51c5-f120-4152-8aa1-041eeecc8165';

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);

  // ---------- State ----------
  const state = {
    lesson: null,
    currentTopicIdx: 0,
    timeRemainingSec: SESSION_DURATION_SEC,
    timerInterval: null,
    conversation: null,
    sdkConversationCtor: null,
    started: false,
    completed: false,
    captureInterval: null,
    lastCaptureAt: 0,
    pendingPostCapture: null,
    lastVisionText: '',
    stopCaptureWatcher: null,
    isMuted: false,
    voiceEventLogged: false,
    today: ymdLocal(new Date()),
    sessionStartedAt: null,
    // v142
    transcript: []
  };

  function ymdLocal(d){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  // ---------- API helpers ----------
  async function jsonFetch(url, opts){
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
    return r.json();
  }

  async function getTodayVoiceUsage(){
    try {
      const r = await jsonFetch('/api/voice-usage');
      return (r && typeof r.count === 'number') ? r.count : 0;
    } catch(e){
      console.warn('[class-time] voice usage check failed', e);
      return 0;
    }
  }

  async function fetchLessonPlan(){
    const today = state.today;
    try {
      const r = await jsonFetch(`/api/class-time/lesson-plan?date=${today}&child_id=${CHILD_ID}`);
      if (r && r.lesson) return r.lesson;
    } catch(e){
      console.warn('[class-time] lesson plan fetch failed, using fallback', e);
    }
    return fallbackLessonPlan();
  }

  function fallbackLessonPlan(){
    // Deterministic 4-topic plan if API fails — rotates by day-of-year
    const doy = (() => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 0);
      return Math.floor((now - start) / 86400000);
    })();
    const pool = [
      { id:'addition-10', skill:'math', title:'Addition within 10', focus:'7+3, 6+4, 8+2', tools:['drawDots','drawTenFrame','drawEquation'] },
      { id:'count-by-2', skill:'math', title:'Counting by 2s', focus:'2,4,6,8,10', tools:['drawNumber','drawDots'] },
      { id:'sight-words', skill:'reading', title:'Sight words', focus:'the, and, was, said', tools:['writeWord'] },
      { id:'letter-sounds', skill:'reading', title:'Letter sounds', focus:'b, d, p, q', tools:['writeLetter'] },
      { id:'living-things', skill:'science', title:'Living things', focus:'plants, animals', tools:['showVisual'] },
      { id:'subtract-5', skill:'math', title:'Subtraction within 5', focus:'5-2, 4-1, 3-3', tools:['drawTenFrame','drawEquation'] },
      { id:'rhyming', skill:'reading', title:'Rhyming words', focus:'cat/hat, dog/log', tools:['writeWord'] },
      { id:'maryland', skill:'social', title:'Maryland symbols', focus:'flag, oriole, blue crab', tools:['showVisual'] }
    ];
    const startIdx = doy % pool.length;
    const topics = [];
    for (let i = 0; i < 4; i++) topics.push(pool[(startIdx + i) % pool.length]);
    return {
      date: state.today,
      topics,
      theme: 'Daily review',
      source: 'fallback'
    };
  }

  // ---------- Voice cap UI ----------
  function showVoiceCap(){
    const cap = $('voice-cap-msg');
    if (cap) cap.classList.add('show');
    $('boot-overlay').style.display = 'none';
  }

  function exitToHome(){
    location.href = 'index.html';
  }

  // ---------- Timer ----------
  function startTimer(){
    state.sessionStartedAt = Date.now();
    updateTimerDisplay();
    state.timerInterval = setInterval(() => {
      state.timeRemainingSec--;
      updateTimerDisplay();
      // Update dynamic variable for Humphrey
      if (state.timeRemainingSec === 60) {
        sendContextualUpdate(`Class time: 1 minute remaining. Start wrapping up gently.`);
      }
      if (state.timeRemainingSec <= 0){
        clearInterval(state.timerInterval);
        handleCompletion('timer');
      }
    }, 1000);
  }

  function updateTimerDisplay(){
    const m = Math.max(0, Math.floor(state.timeRemainingSec / 60));
    const s = Math.max(0, state.timeRemainingSec % 60);
    const el = $('timer');
    if (el) el.textContent = `${m}:${String(s).padStart(2,'0')}`;
  }

  // ---------- Topic pips ----------
  function renderTopicPips(){
    const wrap = $('topic-pips');
    if (!wrap || !state.lesson) return;
    wrap.innerHTML = state.lesson.topics.map((_, i) => {
      let cls = '';
      if (i < state.currentTopicIdx) cls = 'done';
      else if (i === state.currentTopicIdx) cls = 'active';
      return `<span class="${cls}"></span>`;
    }).join('');
    const label = $('topic-label');
    if (label && state.lesson.topics[state.currentTopicIdx]){
      label.textContent = state.lesson.topics[state.currentTopicIdx].title;
    }
    // v152: session progress bar
    if (NS.SessionProgress) NS.SessionProgress.update(state.currentTopicIdx + 1, state.lesson.topics.length, 'Topic');
  }

  // ---------- Humphrey portrait state ----------
  function setHumphreyState(s){
    const p = $('humphrey-portrait');
    const m = $('mic-indicator');
    if (!p) return;
    p.classList.remove('speaking', 'listening');
    if (m) m.classList.remove('speaking', 'listening');
    if (s === 'speaking') {
      p.classList.add('speaking');
      if (m) { m.classList.add('show', 'speaking'); m.textContent = '🔊 Ms. Humphrey is talking…'; }
    } else if (s === 'listening') {
      p.classList.add('listening');
      if (m) { m.classList.add('show', 'listening'); m.textContent = '🎤 Listening…'; }
    } else {
      if (m) m.classList.remove('show');
    }
    // Swap portrait image based on state when possible
    const img = $('humphrey-img');
    if (img) {
      const map = { speaking:'humphrey-encouraging.png', listening:'humphrey-idle.png', idle:'humphrey-smile.png' };
      const file = map[s] || 'humphrey-smile.png';
      const wanted = `assets/humphrey/${file}`;
      if (!img.src.endsWith(file)) img.src = wanted;
    }
  }

  // ---------- ConvAI integration ----------
  async function startConversation(){
    const Conv = (window.ElevenLabsClient || window.ElevenLabs || {}).Conversation;
    if (!Conv){
      console.error('[class-time] ElevenLabs Conversation SDK not loaded');
      throw new Error('SDK_NOT_LOADED');
    }

    // Mic permission first
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop track immediately — SDK will request its own when needed
      s.getTracks().forEach(t => t.stop());
    } catch(e){
      console.error('[class-time] mic permission denied', e);
      alert('Ms. Humphrey needs the microphone to teach. Tap allow and try again.');
      throw e;
    }

    const clientTools = {
      drawNumber:   (p) => { NS.ClassTimeBoard.drawNumber(p);   return 'drew number'; },
      drawDots:     (p) => { NS.ClassTimeBoard.drawDots(p);     return 'drew dots'; },
      drawTenFrame: (p) => { NS.ClassTimeBoard.drawTenFrame(p); return 'drew ten frame'; },
      writeWord:    (p) => { NS.ClassTimeBoard.writeWord(p);    return 'wrote word'; },
      writeLetter:  (p) => { NS.ClassTimeBoard.writeLetter(p);  return 'wrote letter'; },
      drawEquation: (p) => { NS.ClassTimeBoard.drawEquation(p); return 'drew equation'; },
      // v142: showVisual is now async — fetch a live Wikipedia image, fall back to SVG
      showVisual:   async (p) => {
        const subject = String(p?.subject ?? p?.topic ?? p?.text ?? '').trim();
        if (!subject){
          NS.ClassTimeBoard.showVisual({ topic: '' });
          return 'showed visual (empty subject, fell back)';
        }
        try {
          const r = await fetch('/api/class-time/lookup-image', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ subject })
          });
          const data = await r.json();
          if (data && data.image_url){
            NS.ClassTimeBoard.showLiveImage({
              url: data.image_url,
              caption: data.caption || subject,
              attribution: data.attribution || 'Wikipedia'
            });
            return `showed live image: ${subject}`;
          }
        } catch(e){
          console.warn('[class-time] image lookup failed, falling back to SVG', e);
        }
        // No live image found — fall back to SVG library or text
        NS.ClassTimeBoard.showVisual({ topic: subject });
        return `showed visual fallback: ${subject}`;
      },
      clearBoard:   ()  => { NS.ClassTimeBoard.clearBoard();    return 'cleared board'; },
      nextTopic:    ()  => {
        if (!state.lesson) return 'no lesson';
        if (state.currentTopicIdx < state.lesson.topics.length - 1) {
          state.currentTopicIdx++;
          renderTopicPips();
          // v142: when she advances to a new topic, push her the topic context
          // including the why_chosen note so she opens the topic with a
          // personalized "I chose this because…" line.
          announceTopicToHumphrey(state.currentTopicIdx);
          return `topic ${state.currentTopicIdx + 1}`;
        }
        return 'last topic reached';
      },
      endClass: () => {
        setTimeout(() => handleCompletion('humphrey'), 600);
        return 'ending class';
      }
    };

    const dynamicVariables = {
      nigel_current_zone: 'class-time',
      lesson_topics: JSON.stringify(state.lesson.topics.map(t => ({
        title: t.title,
        focus: t.focus,
        skill: t.skill,
        why_chosen: t.why_chosen || ''
      }))),
      current_topic_index: 0,
      time_remaining_min: 7,
      lesson_theme: state.lesson.theme || 'daily review',
      lesson_source: state.lesson.source || 'unknown'
    };

    // v142: AUTO-START the class. Instead of letting the agent use her generic
    // dashboard default ("What are we working on first today?"), give her an
    // opener tailored to today's first topic. She immediately launches into
    // teaching topic 1 the moment Nigel connects.
    const t0 = state.lesson.topics[0];
    const why0 = (t0?.why_chosen || '').trim();
    const opener = (() => {
      const base = `Hey Nigel! Today we're starting with ${t0?.title || 'our lesson'}.`;
      if (why0) return `${base} ${why0} Let me show you something — watch the board.`;
      return `${base} Let me show you something — watch the board.`;
    })();

    state.conversation = await Conv.startSession({
      agentId: AGENT_ID,
      clientTools,
      dynamicVariables,
      overrides: {
        agent: {
          firstMessage: opener
        }
      },
      onConnect: () => { console.log('[class-time] connected'); setHumphreyState('listening'); },
      onDisconnect: () => { console.log('[class-time] disconnected'); setHumphreyState('idle'); },
      onError: (err) => { console.error('[class-time] conv error', err); },
      onModeChange: (m) => {
        if (m && m.mode === 'speaking') setHumphreyState('speaking');
        else setHumphreyState('listening');
      },
      onStatusChange: (s) => { console.log('[class-time] status', s); },
      // v142: capture transcript so it flows into the Saturday digest
      onMessage: (m) => {
        if (!m) return;
        const text = m.message || m.text || '';
        const source = m.source || m.role || 'unknown';
        if (text && state.transcript){
          state.transcript.push({ role: source, message: text, ts: Date.now() });
        }
      }
    });

    // Log telemetry for voice usage cap
    if (!state.voiceEventLogged){
      state.voiceEventLogged = true;
      logEvent('class_time_voice', { lesson_date: state.today, source: state.lesson.source });
    }
  }

  // v142: when Humphrey advances topics via the nextTopic tool, push her the
  // topic context so her next utterance opens that topic with the why_chosen
  // hook ("I picked this because…").
  function announceTopicToHumphrey(idx){
    if (!state.lesson || !state.lesson.topics[idx]) return;
    const t = state.lesson.topics[idx];
    const why = (t.why_chosen || '').trim();
    let msg = `Topic ${idx + 1} of ${state.lesson.topics.length} starting now: "${t.title}" (${t.skill}). Focus: ${t.focus}.`;
    if (why) msg += ` Why this topic for Nigel today: ${why}`;
    msg += " Open the topic by mentioning the why-chosen reason if it fits naturally, then start teaching.";
    sendContextualUpdate(msg);
  }

  function sendContextualUpdate(text){
    if (!state.conversation) return;
    try {
      if (typeof state.conversation.sendContextualUpdate === 'function') {
        state.conversation.sendContextualUpdate(text);
      } else if (typeof state.conversation.contextualUpdate === 'function') {
        state.conversation.contextualUpdate(text);
      } else {
        console.warn('[class-time] no contextual update method on conversation');
      }
    } catch(e){
      console.warn('[class-time] contextual update failed', e);
    }
  }

  // ---------- Auto-vision capture loop ----------
  function startCaptureLoop(){
    let lastStrokeAt = 0;
    let dirtySinceCapture = false;

    // Track drawing activity
    state.stopCaptureWatcher = NS.ClassTimeBoard.onDrawingActivity((kind) => {
      if (kind === 'start' || kind === 'move' || kind === 'end') {
        lastStrokeAt = Date.now();
        dirtySinceCapture = true;
      }
      if (kind === 'clear') {
        dirtySinceCapture = false;
        sendContextualUpdate("Nigel cleared his canvas. It's blank now.");
      }
      // After stop, schedule a capture if 2.5s pass without more activity
      if (kind === 'end') {
        clearTimeout(state.pendingPostCapture);
        state.pendingPostCapture = setTimeout(() => {
          if (Date.now() - lastStrokeAt >= CAPTURE_AFTER_STOP_MS - 100 && dirtySinceCapture) {
            triggerCapture('stopped-drawing');
            dirtySinceCapture = false;
          }
        }, CAPTURE_AFTER_STOP_MS);
      }
    });

    // Periodic capture: every 8s, if dirty since last capture
    state.captureInterval = setInterval(() => {
      const sinceCap = Date.now() - state.lastCaptureAt;
      if (sinceCap < AUTO_CAPTURE_INTERVAL_MS - 200) return;
      if (!dirtySinceCapture) return;
      if (NS.ClassTimeBoard.isCanvasBlank()) return;
      triggerCapture('interval');
      dirtySinceCapture = false;
    }, 2000);
  }

  async function triggerCapture(reason){
    state.lastCaptureAt = Date.now();
    const dataUrl = NS.ClassTimeBoard.captureNigelCanvasDataUrl(512);
    if (!dataUrl) return;
    try {
      const r = await jsonFetch('/api/class-time/see-canvas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: dataUrl,
          context: {
            lesson_topic: state.lesson?.topics?.[state.currentTopicIdx]?.title || '',
            lesson_focus: state.lesson?.topics?.[state.currentTopicIdx]?.focus || '',
            strokes: NS.ClassTimeBoard.getStrokeCount(),
            child_id: CHILD_ID,
            reason
          }
        })
      });
      const desc = r && r.description;
      if (desc && typeof desc === 'string' && desc.length > 0){
        if (desc === state.lastVisionText) return; // dedupe
        state.lastVisionText = desc;
        sendContextualUpdate(`What's on Nigel's canvas right now: ${desc}`);
        console.log('[class-time] vision update sent:', desc);
      }
    } catch(e){
      console.warn('[class-time] see-canvas failed', e);
    }
  }

  // ---------- Telemetry ----------
  async function logEvent(eventType, payload){
    try {
      await fetch('/api/record-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ child_id: CHILD_ID, event_type: eventType, payload: payload || {} })
      });
    } catch(e){ console.warn('[class-time] log event failed', eventType, e); }
  }

  function markClassDoneLocal(){
    try {
      localStorage.setItem('ha_class_time_' + state.today, JSON.stringify({
        completedAt: new Date().toISOString(),
        topicsCompleted: state.currentTopicIdx + 1,
        totalTopics: state.lesson?.topics?.length || 0,
        durationSec: state.sessionStartedAt ? Math.round((Date.now() - state.sessionStartedAt) / 1000) : 0
      }));
    } catch(e){}
  }

  // ---------- Completion ----------
  async function handleCompletion(reason){
    if (state.completed) return;
    state.completed = true;
    clearInterval(state.timerInterval);
    clearInterval(state.captureInterval);
    if (state.stopCaptureWatcher) state.stopCaptureWatcher();
    clearTimeout(state.pendingPostCapture);

    try {
      if (state.conversation && typeof state.conversation.endSession === 'function') {
        await state.conversation.endSession();
      }
    } catch(e){ console.warn('[class-time] endSession failed', e); }

    markClassDoneLocal();
    logEvent('class_time_complete', {
      lesson_date: state.today,
      reason,
      topics_completed: state.currentTopicIdx + 1,
      total_topics: state.lesson?.topics?.length || 0,
      duration_sec: state.sessionStartedAt ? Math.round((Date.now() - state.sessionStartedAt) / 1000) : 0,
      // v142: surface today's topic titles for the Saturday digest and for
      // the lesson-plan regen check (which keys on lesson_date).
      topic_titles: (state.lesson?.topics || []).map(t => t.title),
      lesson_theme: state.lesson?.theme || '',
      lesson_source: state.lesson?.source || '',
      transcript_turns: (state.transcript || []).length,
      transcript: (state.transcript || []).slice(-60) // last 60 turns max
    });

    // Mission integration
    try {
      const today = state.today;
      const key = 'ha_mission_zones_done_' + today;
      const cur = JSON.parse(localStorage.getItem(key) || '[]');
      if (!cur.includes('class-time')) cur.push('class-time');
      localStorage.setItem(key, JSON.stringify(cur));
    } catch(e){}

    showCompletion(reason);
  }

  function showCompletion(reason){
    const wrap = $('completion');
    const msg = $('completion-msg');
    if (msg){
      if (reason === 'humphrey') msg.textContent = `Class is done. Great work today, Nigel!`;
      else if (reason === 'timer') msg.textContent = `That's our 7 minutes! Beautiful class today.`;
      else msg.textContent = `Class wrapped up. See you tomorrow!`;
    }
    if (wrap) wrap.classList.add('show');
  }

  // ---------- Mute ----------
  function toggleMute(){
    state.isMuted = !state.isMuted;
    const btn = $('mute-btn');
    if (btn) btn.textContent = state.isMuted ? '🔇' : '🔊';
    if (state.conversation) {
      try {
        if (typeof state.conversation.setVolume === 'function'){
          state.conversation.setVolume({ volume: state.isMuted ? 0 : 1 });
        } else if (typeof state.conversation.setMicMuted === 'function'){
          // fallback: nothing — SDK may not expose audio mute
        }
      } catch(e){ console.warn('[class-time] mute failed', e); }
    }
  }

  // ---------- Exit ----------
  async function exit(){
    if (!state.completed) {
      // Confirm-then-exit (skip confirmation; Galaxy Tab — exit is final)
      state.completed = true;
      try { if (state.conversation) await state.conversation.endSession(); } catch(e){}
      clearInterval(state.timerInterval);
      clearInterval(state.captureInterval);
      logEvent('class_time_exit_early', { lesson_date: state.today, time_in_sec: state.sessionStartedAt ? Math.round((Date.now() - state.sessionStartedAt) / 1000) : 0 });
    }
    exitToHome();
  }

  // ---------- Boot ----------
  async function boot(){
    // 1. Voice cap check
    setBootMessage('Checking today\'s class allowance…');
    const usage = await getTodayVoiceUsage();
    // v152: raised from 15 to 50 — the old cap blocked actual curriculum
    // lessons because TTS calls across zones counted toward it.
    if (usage >= 50){
      showVoiceCap();
      return;
    }

    // 2. Board mount
    NS.ClassTimeBoard.mount({});

    // 3. Lesson plan
    setBootMessage('Loading today\'s class plan…');
    state.lesson = await fetchLessonPlan();
    console.log('[class-time] lesson loaded', state.lesson);
    renderTopicPips();

    // 4. Listeners
    $('exit-btn').addEventListener('click', exit);
    $('mute-btn').addEventListener('click', toggleMute);
    $('completion-btn').addEventListener('click', exitToHome);
    const capBack = $('cap-back-btn');
    if (capBack) capBack.addEventListener('click', exitToHome);

    // 5. ConvAI connect
    setBootMessage('Ms. Humphrey is on her way…');
    try {
      await startConversation();
    } catch(e){
      $('boot-overlay').style.display = 'none';
      alert('Ms. Humphrey couldn\'t connect today. Try again in a few minutes.');
      console.error(e);
      return;
    }

    // 6. Hide boot, start timer, start capture loop
    $('boot-overlay').style.display = 'none';
    startTimer();
    startCaptureLoop();
  }

  function setBootMessage(text){
    const el = $('boot-label');
    if (el) el.textContent = text;
  }

  // Bootstrap
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Expose for debugging
  NS.ClassTime = { state, _boot: boot };
})();
