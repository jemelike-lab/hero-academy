// js/class-time.js
// v158 — Class Time v2: full school day = 4 courses × 7-10 min, 15-min breaks
// between courses, subject-aware board mode, resumable on reload.
//
// Each course is its own ConvAI conversation with course-specific dynamic
// variables and a subject-aware opener. The existing per-class state machine
// (topic pips, auto-vision capture, topic-watcher, completion) is reused
// inside each course. Breaks are a full-screen overlay with a 15-min
// countdown + stretch prompt + chime + Resume button.
//
// Day plan comes from /api/class-time/lesson-plan-day (Haiku-generated,
// Supabase-cached). Course completion is persisted via
// /api/class-time/record-course so reloading mid-day resumes at the right
// course.
(function(){
  'use strict';
  const NS = window.HeroAcademy = window.HeroAcademy || {};

  const AGENT_ID = 'agent_5901kssbzjm1e0yvd0kdwxa3r49m';
  const AUTO_CAPTURE_INTERVAL_MS = 8000;
  const CAPTURE_AFTER_STOP_MS = 2500;
  const CHILD_ID = '2e0e51c5-f120-4152-8aa1-041eeecc8165';
  const BREAK_MS = 15 * 60 * 1000;       // 15-minute breaks between courses
  const COURSES_PER_DAY = 4;
  const DEFAULT_COURSE_MIN = 8;          // safety default if plan omits target_minutes

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);

  // ---------- State ----------
  const state = {
    // Day-level
    dayPlan: null,                       // { date, theme, courses: [...] }
    courseProgress: [],                  // array of { course_order, subject, completed_at? }
    currentCourseIdx: 0,                 // 0-3
    inBreak: false,
    breakEndsAt: null,
    breakInterval: null,
    // Per-course (reset by startCourse)
    lesson: null,                        // legacy alias — current course shaped like old lesson
    currentTopicIdx: 0,
    timeRemainingSec: DEFAULT_COURSE_MIN * 60,
    timerInterval: null,
    conversation: null,
    sdkConversationCtor: null,
    captureInterval: null,
    lastCaptureAt: 0,
    pendingPostCapture: null,
    lastVisionText: '',
    stopCaptureWatcher: null,
    topicWatcherInterval: null,
    topicStartedAt: 0,
    topicNudged: false,
    sessionStartedAt: null,
    transcript: [],                      // accumulated across all courses for Saturday email
    // Misc
    completed: false,                    // true once full DAY is done
    isMuted: false,
    voiceEventLogged: false,
    today: ymdLocal(new Date())
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

  async function fetchDayPlan(){
    try {
      const r = await jsonFetch(`/api/class-time/lesson-plan-day?date=${state.today}&child_id=${CHILD_ID}`);
      if (r && r.plan && Array.isArray(r.plan.courses)) return r.plan;
    } catch(e){
      console.warn('[class-time] day plan fetch failed, using local fallback', e);
    }
    return fallbackDayPlan();
  }

  async function fetchCourseProgress(){
    try {
      // v159: cache:'no-store' is defensive — the endpoint now also sends
      // Cache-Control:no-store, but Service Worker or browser HTTP cache could
      // otherwise return stale empty progress after a course completion.
      const r = await fetch(
        `/api/class-time/course-progress?date=${state.today}&child_id=${CHILD_ID}`,
        { cache: 'no-store' }
      );
      if (!r.ok) throw new Error('http ' + r.status);
      const data = await r.json();
      if (data && Array.isArray(data.progress)) return data.progress;
    } catch(e){
      console.warn('[class-time] progress fetch failed (assuming none)', e);
    }
    return [];
  }

  async function recordCourseComplete(courseOrder, subject, topicsCovered){
    try {
      await fetch('/api/class-time/record-course', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          child_id: CHILD_ID,
          date: state.today,
          course_order: courseOrder,
          subject,
          topics_covered: topicsCovered
        })
      });
    } catch(e){
      console.warn('[class-time] record-course failed (continuing)', e);
    }
  }

  function fallbackDayPlan(){
    // If both endpoint AND Haiku fail, hand back a deterministic 4-course day.
    // Matches the shape of /api/class-time/lesson-plan-day.
    return {
      date: state.today,
      theme: 'Daily practice',
      source: 'client-fallback',
      courses: [
        { order:1, subject:'math',    subject_label:'Math',           board_mode:'drawing', target_minutes:8,  why_chosen:'Warm up with math.', image_keywords:[],
          topics:[
            {id:'add-10', title:'Addition within 10', focus:'7+3, 6+4, 8+2', tools:['drawDots','drawTenFrame','drawEquation']},
            {id:'count-2', title:'Counting by 2s', focus:'2,4,6,8,10', tools:['drawNumber','drawDots']}
          ]},
        { order:2, subject:'reading', subject_label:'Reading',        board_mode:'mixed',   target_minutes:9,  why_chosen:'Practice reading fluency.', image_keywords:['butterfly'],
          topics:[
            {id:'sight', title:'Sight words', focus:'the, and, was, said', tools:['writeWord']}
          ]},
        { order:3, subject:'spelling',subject_label:'Spelling',       board_mode:'drawing', target_minutes:8,  why_chosen:'Spell common short words.', image_keywords:[],
          topics:[
            {id:'cvc', title:'CVC words', focus:'cat, dog, sun, pig', tools:['writeWord']}
          ]},
        { order:4, subject:'science', subject_label:'Science',        board_mode:'image',   target_minutes:10, why_chosen:'Look at the natural world.', image_keywords:['butterfly','caterpillar','cocoon'],
          topics:[
            {id:'life-cycle', title:'Butterfly life cycle', focus:'egg → caterpillar → cocoon → butterfly', tools:['showVisual']}
          ]}
      ]
    };
  }

  function findFirstIncompleteCourse(){
    const doneOrders = new Set();
    for (const row of (state.courseProgress || [])){
      if (row && row.completed_at && row.course_order){
        doneOrders.add(row.course_order);
      }
    }
    for (let i = 1; i <= COURSES_PER_DAY; i++){
      if (!doneOrders.has(i)) return i - 1;
    }
    return COURSES_PER_DAY; // all done
  }

  function showVoiceCap(){
    $('boot-overlay').style.display = 'none';
    $('voice-cap-msg').classList.add('show');
  }

  function exitToHome(){
    location.href = '/index.html';
  }

  // ---------- Timer ----------
  function startTimer(){
    clearInterval(state.timerInterval);
    const minutes = state.lesson?.target_minutes || DEFAULT_COURSE_MIN;
    state.timeRemainingSec = minutes * 60;
    updateTimerDisplay();
    state.timerInterval = setInterval(() => {
      state.timeRemainingSec--;
      updateTimerDisplay();
      if (state.timeRemainingSec <= 0){
        clearInterval(state.timerInterval);
        endCourse('timer');
      }
    }, 1000);
  }

  function updateTimerDisplay(){
    const el = $('timer');
    if (!el) return;
    const m = Math.floor(state.timeRemainingSec / 60);
    const s = state.timeRemainingSec % 60;
    el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  function formatMMSS(ms){
    const sec = Math.max(0, Math.floor(ms / 1000));
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  // ---------- Course / topic header ----------
  function renderCourseHeader(){
    const wrap = $('course-header');
    if (!wrap) return;
    const order = state.currentCourseIdx + 1;
    const label = state.lesson?.subject_label || '…';
    wrap.innerHTML = `Course <strong>${order}/${COURSES_PER_DAY}</strong> · <strong>${label}</strong>`;
  }

  function renderTopicPips(){
    const wrap = $('topic-pips');
    if (!wrap || !state.lesson) return;
    wrap.innerHTML = (state.lesson.topics || []).map((_, i) => {
      const cls = i < state.currentTopicIdx ? 'done' : (i === state.currentTopicIdx ? 'active' : '');
      return `<span class="${cls}"></span>`;
    }).join('');
    const label = $('topic-label');
    if (label && state.lesson.topics[state.currentTopicIdx]){
      label.textContent = state.lesson.topics[state.currentTopicIdx].title;
    }
    if (NS.SessionProgress) NS.SessionProgress.update(state.currentTopicIdx + 1, state.lesson.topics.length, 'Topic');
  }

  // ---------- Humphrey portrait state ----------
  function setHumphreyState(s){
    const portrait = $('humphrey-portrait');
    const mic = $('mic-indicator');
    if (!portrait) return;
    portrait.classList.remove('speaking','listening');
    if (s === 'speaking') {
      portrait.classList.add('speaking');
      if (mic){ mic.className='show speaking'; mic.textContent='Ms. Humphrey is speaking…'; }
    } else if (s === 'listening'){
      portrait.classList.add('listening');
      if (mic){ mic.className='show listening'; mic.textContent='Listening for you…'; }
    } else {
      if (mic){ mic.className=''; mic.textContent=''; }
    }
    const img = $('humphrey-img');
    if (img) {
      const expr = s === 'speaking' ? 'humphrey-encouraging' :
                   s === 'listening' ? 'humphrey-idle' : 'humphrey-smile';
      img.src = `assets/humphrey/${expr}.png`;
    }
  }

  // ---------- ConvAI conversation (per-course) ----------
  async function startConversation(){
    if (!window.ElevenLabsClient && !window.ElevenLabs){
      throw new Error('ElevenLabs SDK not loaded');
    }
    const Conv = (window.ElevenLabsClient && window.ElevenLabsClient.Conversation)
              || (window.ElevenLabs && window.ElevenLabs.Conversation);
    if (!Conv) throw new Error('ElevenLabs Conversation class not found');

    // Mic permission (no-op if already granted)
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach(t => t.stop());
    } catch(e){
      console.warn('[class-time] mic permission warning', e);
    }

    const clientTools = {
      drawNumber:   (p) => { NS.ClassTimeBoard.drawNumber(p);   const v = p?.n ?? p?.number ?? p?.value ?? p?.count ?? '?'; console.log('[class-time] drawNumber', p); return `drew number ${v} on the board`; },
      drawDots:     (p) => { NS.ClassTimeBoard.drawDots(p);     const v = p?.count ?? p?.n ?? p?.dots ?? p?.value ?? p?.number ?? '?'; console.log('[class-time] drawDots', p); return `drew ${v} dots on the board`; },
      drawTenFrame: (p) => { NS.ClassTimeBoard.drawTenFrame(p); const v = p?.filled ?? p?.n ?? p?.count ?? p?.value ?? p?.number ?? '?'; console.log('[class-time] drawTenFrame', p); return `drew ten frame with ${v} filled circles on the board — verify this matches what you said`; },
      writeWord:    (p) => { NS.ClassTimeBoard.writeWord(p);    const v = p?.word ?? p?.text ?? p?.value ?? '?'; console.log('[class-time] writeWord', p); return `wrote "${v}" on the board`; },
      writeLetter:  (p) => { NS.ClassTimeBoard.writeLetter(p);  const v = p?.letter ?? p?.char ?? p?.text ?? p?.value ?? '?'; console.log('[class-time] writeLetter', p); return `wrote letter "${v}" on the board`; },
      drawEquation: (p) => { NS.ClassTimeBoard.drawEquation(p); const v = p?.equation ?? p?.eq ?? p?.text ?? p?.value ?? '?'; console.log('[class-time] drawEquation', p); return `drew equation "${v}" on the board`; },
      // showVisual: live Wikipedia lookup; falls back to SVG library / text
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
        NS.ClassTimeBoard.showVisual({ topic: subject });
        return `showed visual fallback: ${subject}`;
      },
      clearBoard:   ()  => { NS.ClassTimeBoard.clearBoard();    return 'cleared board'; },
      // v157: Humphrey actually LOOKS at the board before answering visual
      // questions, instead of guessing from memory. Returns a short
      // spoken-style reply she can repeat or paraphrase.
      whatIsOnBoard: async (p) => {
        const which = String(p?.which ?? p?.board ?? 'humphrey').toLowerCase();
        const question = String(p?.question ?? p?.about ?? p?.q ?? '').trim();
        const meta = (NS.ClassTimeBoard.getBoardMeta && NS.ClassTimeBoard.getBoardMeta()) || { mode: 'drawing' };
        console.log('[class-time] whatIsOnBoard called', { which, question, meta });
        let snapshot = null;
        try {
          snapshot = await NS.ClassTimeBoard.captureBoardDataUrl({ which, maxDim: 640 });
        } catch(e){
          console.warn('[class-time] capture failed', e);
        }
        if (!snapshot){
          return which === 'nigel'
            ? "Nigel's board is empty — he hasn't drawn yet."
            : "The board is empty right now — nothing to look at yet.";
        }
        const topic = state.lesson?.topics?.[state.currentTopicIdx] || {};
        const subjectGuess = topic.skill || topic.subject || state.lesson?.subject || 'class time';
        try {
          const r = await fetch('/api/humphrey/see-board', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              image: snapshot,
              media_type: 'image/jpeg',
              context: {
                subject: subjectGuess,
                board_mode: meta.mode,
                displayed_image_caption: meta.image_caption || '',
                question_from_nigel: question
              }
            })
          });
          const data = await r.json();
          if (data && (data.suggested_reply || data.description)){
            const reply = String(data.suggested_reply || data.description).trim();
            console.log('[class-time] see-board reply', reply, 'can_see=', data.can_see, 'conf=', data.confidence);
            return reply;
          }
          if (data && data.error){
            console.warn('[class-time] see-board error', data);
            return 'I cannot quite make it out — let me try again in a moment.';
          }
          return 'I see the board, but cannot describe it clearly.';
        } catch(e){
          console.warn('[class-time] see-board fetch failed', e);
          return 'I cannot see the board right now.';
        }
      },
      nextTopic:    ()  => {
        if (!state.lesson) return 'no lesson';
        if (state.currentTopicIdx < state.lesson.topics.length - 1) {
          state.currentTopicIdx++;
          state.topicStartedAt = Date.now();
          state.topicNudged = false;
          renderTopicPips();
          announceTopicToHumphrey(state.currentTopicIdx);
          return `topic ${state.currentTopicIdx + 1}`;
        }
        return 'last topic reached';
      },
      // v158: agent ends the CURRENT course (not the whole day)
      endClass: () => {
        setTimeout(() => endCourse('humphrey'), 600);
        return 'ending course';
      }
    };

    const dynamicVariables = {
      nigel_current_zone: 'class-time',
      // Per-course context (changes every course)
      current_subject: state.lesson?.subject_label || '',
      current_subject_key: state.lesson?.subject || '',
      current_course_order: state.currentCourseIdx + 1,
      total_courses: COURSES_PER_DAY,
      current_board_mode: state.lesson?.board_mode || 'drawing',
      lesson_topics: JSON.stringify((state.lesson?.topics || []).map(t => ({
        title: t.title,
        focus: t.focus,
        skill: t.skill,
        why_chosen: t.why_chosen || ''
      }))),
      current_topic_index: 0,
      time_remaining_min: state.lesson?.target_minutes || DEFAULT_COURSE_MIN,
      lesson_theme: state.dayPlan?.theme || '',
      lesson_source: state.dayPlan?.source || 'unknown',
      course_why_chosen: state.lesson?.why_chosen || ''
    };

    // Subject-aware opener
    const t0 = state.lesson.topics[0];
    const why0 = (t0?.why_chosen || state.lesson.why_chosen || '').trim();
    const subj = state.lesson.subject_label || 'class';
    const order = state.currentCourseIdx + 1;
    const opener = (() => {
      const courseTag = order === 1
        ? `Hey Nigel! Time to start school. First up is ${subj}.`
        : `Welcome back, Nigel! Course ${order} of ${COURSES_PER_DAY} — ${subj}.`;
      const topicTag = t0?.title ? ` We're going to work on ${t0.title}.` : '';
      const whyTag = why0 ? ` ${why0}` : '';
      const cta = ' Watch the board.';
      return `${courseTag}${topicTag}${whyTag}${cta}`;
    })();

    state.conversation = await Conv.startSession({
      agentId: AGENT_ID,
      clientTools,
      dynamicVariables,
      overrides: {
        agent: { firstMessage: opener }
      },
      onConnect: () => { console.log('[class-time] connected (course', state.currentCourseIdx + 1, ')'); setHumphreyState('listening'); },
      onDisconnect: () => { console.log('[class-time] disconnected'); setHumphreyState('idle'); },
      onError: (err) => { console.error('[class-time] conv error', err); },
      onModeChange: (m) => {
        if (m && m.mode === 'speaking') setHumphreyState('speaking');
        else setHumphreyState('listening');
      },
      onStatusChange: (s) => { console.log('[class-time] status', s); },
      // Transcript accumulates across courses for Saturday digest
      onMessage: (m) => {
        if (!m) return;
        const text = m.message || m.text || '';
        const source = m.source || m.role || 'unknown';
        if (text && state.transcript){
          state.transcript.push({
            role: source,
            message: text,
            ts: Date.now(),
            course_order: state.currentCourseIdx + 1,
            subject: state.lesson?.subject || ''
          });
        }
      }
    });

    if (!state.voiceEventLogged){
      state.voiceEventLogged = true;
      logEvent('class_time_voice', { lesson_date: state.today, source: state.dayPlan?.source });
    }

    // Topic-watcher (nudge + auto-advance) — per course
    state.topicStartedAt = Date.now();
    state.topicNudged = false;
    state.topicWatcherInterval = setInterval(() => {
      if (!state.lesson || state.completed || state.inBreak) return;
      const elapsed = (Date.now() - state.topicStartedAt) / 1000;
      const isLast = state.currentTopicIdx >= state.lesson.topics.length - 1;
      if (elapsed >= 90 && !state.topicNudged && !isLast) {
        state.topicNudged = true;
        const next = state.lesson.topics[state.currentTopicIdx + 1];
        sendContextualUpdate(
          `You have been on this topic for about 90 seconds. ` +
          `Wrap up with one final thought, then call nextTopic to move on to "${next?.title || 'the next topic'}".`
        );
      }
      if (elapsed >= 130 && !isLast) {
        state.currentTopicIdx++;
        state.topicStartedAt = Date.now();
        state.topicNudged = false;
        renderTopicPips();
        announceTopicToHumphrey(state.currentTopicIdx);
      }
      if (isLast && elapsed >= 90 && !state.topicNudged) {
        state.topicNudged = true;
        sendContextualUpdate(
          `This is the last topic of this course. Wrap up in the next 30 seconds, ` +
          `then call endClass to finish the course.`
        );
      }
    }, 10000);
  }

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

  // ---------- Auto-vision capture (per course) ----------
  function startCaptureLoop(){
    let lastStrokeAt = 0;
    let dirtySinceCapture = false;
    state.stopCaptureWatcher = NS.ClassTimeBoard.onDrawingActivity((kind) => {
      if (kind === 'start' || kind === 'move' || kind === 'end') {
        lastStrokeAt = Date.now();
        dirtySinceCapture = true;
      }
      if (kind === 'clear') {
        dirtySinceCapture = false;
        sendContextualUpdate("Nigel cleared his canvas. It's blank now.");
      }
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
        if (desc === state.lastVisionText) return;
        state.lastVisionText = desc;
        sendContextualUpdate(`What's on Nigel's canvas right now: ${desc}`);
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

  function markDayDoneLocal(){
    try {
      localStorage.setItem('ha_class_time_' + state.today, JSON.stringify({
        completedAt: new Date().toISOString(),
        coursesCompleted: COURSES_PER_DAY,
        theme: state.dayPlan?.theme || ''
      }));
    } catch(e){}
  }

  // ---------- Course lifecycle ----------
  async function startCourse(idx){
    const course = state.dayPlan?.courses?.[idx];
    if (!course){ console.error('[class-time] no course at idx', idx); return; }
    state.currentCourseIdx = idx;
    state.lesson = {
      date: state.dayPlan.date,
      theme: state.dayPlan.theme,
      source: state.dayPlan.source || 'day-plan',
      subject: course.subject,
      subject_label: course.subject_label,
      board_mode: course.board_mode,
      image_keywords: course.image_keywords || [],
      target_minutes: course.target_minutes || DEFAULT_COURSE_MIN,
      why_chosen: course.why_chosen || '',
      course_order: course.order || (idx + 1),
      topics: (course.topics || []).map(t => ({
        ...t,
        skill: course.subject,
        subject_label: course.subject_label,
        why_chosen: t.why_chosen || course.why_chosen || ''
      }))
    };
    state.currentTopicIdx = 0;
    state.topicNudged = false;
    state.lastVisionText = '';
    state.sessionStartedAt = Date.now();
    renderCourseHeader();
    renderTopicPips();

    // Pre-load image for image-mode courses so the board STARTS visual
    if (course.board_mode === 'image' && course.image_keywords && course.image_keywords[0]){
      setBootMessage(`Pulling up ${course.subject_label} visuals…`);
      try {
        const r = await fetch('/api/class-time/lookup-image', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ subject: course.image_keywords[0] })
        });
        const data = await r.json();
        if (data && data.image_url){
          NS.ClassTimeBoard.showLiveImage({
            url: data.image_url,
            caption: data.caption || course.image_keywords[0],
            attribution: data.attribution || 'Wikipedia'
          });
        }
      } catch(e){
        console.warn('[class-time] image preload failed (continuing)', e);
      }
    }

    setBootMessage('Ms. Humphrey is on her way…');
    await startConversation();
    startTimer();
    startCaptureLoop();
  }

  async function endCourse(reason){
    if (state.inBreak || state.completed) return;
    const courseOrder = state.currentCourseIdx + 1;
    const subject = state.lesson?.subject || 'unknown';
    const topicIds = (state.lesson?.topics || []).map(t => t.id);

    // Persist completion
    await recordCourseComplete(courseOrder, subject, topicIds);
    logEvent('class_time_course_complete', {
      lesson_date: state.today,
      course_order: courseOrder,
      subject,
      reason,
      topics: topicIds,
      duration_sec: state.sessionStartedAt ? Math.round((Date.now() - state.sessionStartedAt) / 1000) : 0
    });

    // End ConvAI + intervals
    try { if (state.conversation) await state.conversation.endSession(); } catch(_){}
    state.conversation = null;
    clearInterval(state.timerInterval);
    clearInterval(state.captureInterval);
    clearInterval(state.topicWatcherInterval);
    if (state.stopCaptureWatcher) state.stopCaptureWatcher();
    clearTimeout(state.pendingPostCapture);
    NS.ClassTimeBoard.clearBoard();

    // Last course → day done
    if (state.currentCourseIdx >= COURSES_PER_DAY - 1){
      handleDayCompletion(reason);
      return;
    }
    // Otherwise: break
    showBreak();
  }

  // ---------- Break overlay ----------
  function showBreak(){
    state.inBreak = true;
    state.breakEndsAt = Date.now() + BREAK_MS;
    const overlay = $('break-overlay');
    if (overlay) overlay.classList.add('show');
    const nextCourse = state.dayPlan?.courses?.[state.currentCourseIdx + 1];
    const nextLabel = $('break-next-label');
    if (nextLabel && nextCourse) nextLabel.textContent = `Next: Course ${state.currentCourseIdx + 2}/${COURSES_PER_DAY} — ${nextCourse.subject_label}`;
    const btn = $('break-resume-btn');
    if (btn){ btn.disabled = true; btn.textContent = 'Take your break first…'; }
    tickBreak();
    state.breakInterval = setInterval(tickBreak, 1000);
  }

  function tickBreak(){
    const remaining = state.breakEndsAt - Date.now();
    const timerEl = $('break-timer');
    if (timerEl) timerEl.textContent = formatMMSS(remaining);
    const btn = $('break-resume-btn');
    if (remaining <= 0){
      clearInterval(state.breakInterval);
      state.breakInterval = null;
      if (btn){ btn.disabled = false; btn.textContent = 'Resume class →'; }
      playChime();
    }
  }

  async function resumeFromBreak(){
    if (!state.inBreak) return;
    state.inBreak = false;
    clearInterval(state.breakInterval);
    state.breakInterval = null;
    const overlay = $('break-overlay');
    if (overlay) overlay.classList.remove('show');
    const boot = $('boot-overlay');
    if (boot) boot.style.display = 'flex';
    setBootMessage('Starting next course…');
    try {
      await startCourse(state.currentCourseIdx + 1);
    } catch(e){
      console.error('[class-time] resume start course failed', e);
      alert('Couldn\'t start the next course. Try again in a few minutes.');
      exitToHome();
      return;
    }
    if (boot) boot.style.display = 'none';
  }

  function playChime(){
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      [880, 660].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.18;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.20, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc.start(t);
        osc.stop(t + 0.55);
      });
    } catch(_){}
  }

  // ---------- Day completion ----------
  function handleDayCompletion(reason){
    if (state.completed) return;
    state.completed = true;
    markDayDoneLocal();
    // Collect all topic titles across all courses for the Saturday digest
    const allTopicTitles = (state.dayPlan?.courses || [])
      .flatMap(c => (c.topics || []).map(t => `${c.subject_label}: ${t.title}`));
    logEvent('class_time_complete', {
      lesson_date: state.today,
      reason,
      courses_completed: COURSES_PER_DAY,
      total_courses: COURSES_PER_DAY,
      topic_titles: allTopicTitles,
      lesson_theme: state.dayPlan?.theme || '',
      lesson_source: state.dayPlan?.source || '',
      transcript_turns: (state.transcript || []).length,
      transcript: (state.transcript || []).slice(-200)  // raise from 60 → 200 since now full-day
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
      if (reason === 'day-already-done') msg.textContent = `You already finished today's classes, Nigel! See you tomorrow.`;
      else if (reason === 'humphrey') msg.textContent = `All four courses done! Beautiful work today, Nigel.`;
      else if (reason === 'timer') msg.textContent = `That's the school day! Great work in all four classes.`;
      else msg.textContent = `Class day wrapped up. See you tomorrow!`;
    }
    if (wrap) wrap.classList.add('show');
  }

  // ---------- Mute / Exit ----------
  function toggleMute(){
    state.isMuted = !state.isMuted;
    const btn = $('mute-btn');
    if (btn) btn.textContent = state.isMuted ? '🔇' : '🔊';
    if (state.conversation) {
      try {
        if (typeof state.conversation.setVolume === 'function'){
          state.conversation.setVolume({ volume: state.isMuted ? 0 : 1 });
        }
      } catch(e){ console.warn('[class-time] mute failed', e); }
    }
  }

  async function exit(){
    if (!state.completed) {
      state.completed = true;
      try { if (state.conversation) await state.conversation.endSession(); } catch(e){}
      clearInterval(state.timerInterval);
      clearInterval(state.captureInterval);
      clearInterval(state.topicWatcherInterval);
      clearInterval(state.breakInterval);
      logEvent('class_time_exit_early', {
        lesson_date: state.today,
        course_order: state.currentCourseIdx + 1,
        in_break: state.inBreak,
        time_in_course_sec: state.sessionStartedAt ? Math.round((Date.now() - state.sessionStartedAt) / 1000) : 0
      });
    }
    exitToHome();
  }

  // ---------- Boot ----------
  async function boot(){
    // 1. Voice cap check
    setBootMessage('Checking today\'s class allowance…');
    const usage = await getTodayVoiceUsage();
    if (usage >= 50){ showVoiceCap(); return; }

    // 2. Mount board
    NS.ClassTimeBoard.mount({});

    // 3. Fetch day plan + progress in parallel
    setBootMessage('Loading today\'s school day…');
    const [dayPlan, progress] = await Promise.all([fetchDayPlan(), fetchCourseProgress()]);
    state.dayPlan = dayPlan;
    state.courseProgress = progress;
    console.log('[class-time] day plan loaded', state.dayPlan, 'progress', progress);

    // 4. UI listeners (wire once)
    $('exit-btn').addEventListener('click', exit);
    $('mute-btn').addEventListener('click', toggleMute);
    $('completion-btn').addEventListener('click', exitToHome);
    const resumeBtn = $('break-resume-btn');
    if (resumeBtn) resumeBtn.addEventListener('click', resumeFromBreak);
    const capBack = $('cap-back-btn');
    if (capBack) capBack.addEventListener('click', exitToHome);

    // 5. Resume: find first incomplete course
    const startIdx = findFirstIncompleteCourse();
    if (startIdx >= COURSES_PER_DAY){
      $('boot-overlay').style.display = 'none';
      handleDayCompletion('day-already-done');
      return;
    }

    // 6. Start first course
    try {
      await startCourse(startIdx);
    } catch(e){
      $('boot-overlay').style.display = 'none';
      alert('Ms. Humphrey couldn\'t connect today. Try again in a few minutes.');
      console.error(e);
      return;
    }
    $('boot-overlay').style.display = 'none';
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
  NS.ClassTime = { state, _boot: boot, _startCourse: startCourse, _endCourse: endCourse, _showBreak: showBreak, _resumeFromBreak: resumeFromBreak };
})();
