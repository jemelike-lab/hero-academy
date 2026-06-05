/**
 * Hero Academy — Parent Co-pilot (Build #5 v1)
 *
 * Single-page dashboard at parent.html, hash-gated.
 *   parent.html#bianca  -> "Hi, Bianca!"
 *   parent.html#josh    -> "Hi, Josh!"
 *   anything else       -> gate screen ("Ask Josh for the link")
 *
 * Reads via the ha_parent_dashboard RPC; writes via ha_create_directive /
 * ha_deactivate_directive. Anon role has EXECUTE; tables stay locked.
 */
(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // Config
  // -------------------------------------------------------------------------
  var SUPABASE_URL = 'https://yofqeuguxgujgqnaejmw.supabase.co';
  var SB_KEY       = 'sb_publishable_Cigt6z_S1YTSvChOi5E7tA_t1H_nNRI';
  var NIGEL_ID     = '2e0e51c5-f120-4152-8aa1-041eeecc8165';

  // Whitelist of valid parent hashes.
  var PARENTS = {
    'bianca': { display: 'Bianca', token: 'bianca' },
    'josh':   { display: 'Josh',   token: 'josh' },
  };

  // Zones available for skip / focus.
  var ZONE_LABELS = {
    'number-lab':  'Number Lab (math)',
    'word-tower':  'Word Tower (reading)',
    'story-time':  'Story Time',
    'story-lab':   'Story Lab (writing)',
    'discovery':   'Discovery Dome (science)',
    'explorer':    "Explorer's Hall (geography)",
    'writing':     'Writing',
    'hero-hall':   'Hero Hall',
  };

  // Skill keys for focus_skill directive.
  var SKILL_OPTIONS = [
    { key: 'add_within_10',      label: 'Addition within 10' },
    { key: 'add_within_20',      label: 'Addition within 20' },
    { key: 'subtract_within_10', label: 'Subtraction within 10' },
    { key: 'subtract_within_20', label: 'Subtraction within 20' },
    { key: 'make_10',            label: 'Make-a-10 strategy' },
    { key: 'place_value',        label: 'Place value' },
    { key: 'reading_fluency',    label: 'Reading fluency' },
    { key: 'sight_words',        label: 'Sight words' },
    { key: 'writing_sentences',  label: 'Writing sentences' },
  ];

  // Real-world quest categories.
  var QUEST_CATEGORIES = [
    { key: 'counting',     label: 'Counting things' },
    { key: 'color',        label: 'Spotting colors' },
    { key: 'letter',       label: 'Finding letters' },
    { key: 'observation',  label: 'Looking around / observing' },
    { key: 'show_and_tell',label: 'Show-and-tell with photo' },
  ];

  // -------------------------------------------------------------------------
  // DOM helpers
  // -------------------------------------------------------------------------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      for (var k in props) {
        if (k === 'class') node.className = props[k];
        else if (k === 'text') node.textContent = props[k];
        else if (k === 'html') node.innerHTML = props[k];
        else if (k === 'attrs') for (var a in props[k]) node.setAttribute(a, props[k][a]);
        else if (k === 'on') for (var ev in props[k]) node.addEventListener(ev, props[k][ev]);
        else if (k === 'style') for (var s in props[k]) node.style[s] = props[k][s];
        else node[k] = props[k];
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  // -------------------------------------------------------------------------
  // RPC client
  // -------------------------------------------------------------------------
  function rpc(fn, body) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body || {}),
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          throw new Error('RPC ' + fn + ' ' + r.status + ': ' + (t || r.statusText));
        });
      }
      return r.status === 204 ? null : r.json();
    });
  }

  // -------------------------------------------------------------------------
  // Hash gate
  // -------------------------------------------------------------------------
  function readParent() {
    var hash = (window.location.hash || '').replace(/^#/, '').toLowerCase().trim();
    return PARENTS[hash] || null;
  }

  // -------------------------------------------------------------------------
  // Formatters
  // -------------------------------------------------------------------------
  var WEEKDAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  function fmtShortDate(isoDate) {
    // isoDate is YYYY-MM-DD (string) or full ISO ts.
    var d = isoDate.length === 10
      ? new Date(isoDate + 'T12:00:00')  // anchor at noon to dodge TZ flips
      : new Date(isoDate);
    if (isNaN(d)) return isoDate;
    return WEEKDAY[d.getDay()] + ' ' + (d.getMonth() + 1) + '/' + d.getDate();
  }
  function fmtTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var h = d.getHours();
    var m = String(d.getMinutes()).padStart(2, '0');
    var ampm = h >= 12 ? 'pm' : 'am';
    var h12 = h % 12 || 12;
    return h12 + ':' + m + ampm;
  }
  function fmtDuration(secs) {
    if (!secs && secs !== 0) return '—';
    if (secs < 60) return secs + 's';
    var m = Math.round(secs / 60);
    if (m < 60) return m + 'm';
    return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  }
  function fmtRelative(iso) {
    var then = new Date(iso);
    var diff = (Date.now() - then.getTime()) / 1000;
    if (diff < 60)   return 'just now';
    if (diff < 3600) return Math.round(diff / 60) + ' min ago';
    if (diff < 86400) return Math.round(diff / 3600) + ' hr ago';
    var days = Math.round(diff / 86400);
    if (days === 1) return 'yesterday';
    if (days < 7)  return days + ' days ago';
    return fmtShortDate(iso);
  }
  function zoneLabel(zoneId) {
    return ZONE_LABELS[zoneId] || zoneId || '—';
  }

  // -------------------------------------------------------------------------
  // Renderers
  // -------------------------------------------------------------------------

  // Build the 7-day strip — fill in zeroes for missing days.
  function renderWeekStrip(sessionsByDay) {
    var strip = $('#weekStrip');
    strip.innerHTML = '';
    var byDay = {};
    (sessionsByDay || []).forEach(function (d) { byDay[d.day] = d; });

    var today = new Date();
    today.setHours(12, 0, 0, 0);
    var days = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date(today.getTime() - i * 86400000);
      var iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      days.push({ iso: iso, weekday: WEEKDAY[d.getDay()], day: d.getDate(), data: byDay[iso] });
    }

    // Max sessions in window (for scaling bars). Min 1 to avoid /0.
    var maxSessions = days.reduce(function (m, x) {
      return Math.max(m, x.data ? x.data.session_count : 0);
    }, 1);

    days.forEach(function (d) {
      var sessions = d.data ? d.data.session_count : 0;
      var pct = d.data && d.data.percent_correct != null ? d.data.percent_correct : null;
      var heightPct = Math.max(4, Math.round((sessions / maxSessions) * 100));
      var col = el('div', { class: 'parent-week-col' + (sessions > 0 ? ' has-data' : '') }, [
        el('div', { class: 'parent-week-bar-frame' }, [
          el('div', { class: 'parent-week-bar', style: { height: heightPct + '%' } }),
        ]),
        el('div', { class: 'parent-week-sessions', text: sessions ? String(sessions) : '·' }),
        el('div', { class: 'parent-week-weekday', text: d.weekday }),
        el('div', { class: 'parent-week-date', text: String(d.day) }),
        pct != null ? el('div', { class: 'parent-week-pct', text: pct + '%' }) : null,
      ]);
      strip.appendChild(col);
    });

    // Summary line under the strip.
    var totalSessions = 0, totalSeconds = 0, totalAttempts = 0, totalCorrect = 0, activeDays = 0;
    (sessionsByDay || []).forEach(function (d) {
      totalSessions += d.session_count || 0;
      totalSeconds += d.total_seconds || 0;
      totalAttempts += d.attempts || 0;
      totalCorrect += d.correct || 0;
      if (d.session_count > 0) activeDays += 1;
    });
    var summary;
    if (totalSessions === 0) {
      summary = 'No app activity in the last 7 days yet.';
    } else {
      var bits = [
        activeDays + ' active day' + (activeDays === 1 ? '' : 's'),
        totalSessions + ' session' + (totalSessions === 1 ? '' : 's'),
        fmtDuration(totalSeconds) + ' on task',
      ];
      if (totalAttempts > 0) {
        var pct = Math.round((totalCorrect / totalAttempts) * 100);
        bits.push(pct + '% correct (' + totalCorrect + '/' + totalAttempts + ')');
      }
      summary = bits.join(' · ');
    }
    $('#weekSummary').textContent = summary;
  }

  // ===========================================================================
  // Subject helpers (shared by Today card + weekly subject roll-up)
  // ===========================================================================

  // Zone -> subject mapping. Mirrors api/mission/today.js DAILY_PLAN.
  var ZONE_TO_SUBJECT = {
    'word-tower': 'reading',
    'story-time': 'reading',
    'number-lab': 'math',
    'discovery':  'science',
    'explorer':   'social',
    'writing':    'writing',
    'story-lab':  'writing',   // older zone id, treat as writing
    'hero-hall':  'trophy',
  };

  // Subject display metadata. Colors match the home card so the family sees
  // the same scheme on both sides.
  var SUBJECTS = [
    { key: 'reading', label: 'Reading',        emoji: '📖', color: '#14b8d4' },
    { key: 'math',    label: 'Math',           emoji: '🔢', color: '#ff8b3d' },
    { key: 'writing', label: 'Writing',        emoji: '✍️', color: '#a855f7' },
    { key: 'science', label: 'Science',        emoji: '🔬', color: '#2ec27e' },
    { key: 'social',  label: 'Social Studies', emoji: '🌍', color: '#ec4899' },
  ];

  // Pull the full steps array out of a mission row. Today's Mission packs the
  // 7-step plan into m.planned[0].all_steps for backward-compatible storage;
  // legacy 3-anchor missions just use m.planned directly.
  function extractMissionSteps(m) {
    if (!m) return [];
    var planned = m.planned || [];
    if (planned.length > 0 && planned[0] && Array.isArray(planned[0].all_steps) && planned[0].all_steps.length > 0) {
      return planned[0].all_steps;
    }
    // Fall back to legacy planned[] — add subject inference for older rows.
    return planned.map(function (p) {
      return {
        slot:   p.phase || 'step',
        zone_id: p.zone_id,
        title:   p.title,
        minutes: p.minutes || 0,
        subject: ZONE_TO_SUBJECT[p.zone_id] || 'other',
      };
    });
  }

  // Today is the most recent mission_date == today's local ISO. Missions array
  // is server-sorted newest-first.
  function findTodayMission(missions) {
    if (!Array.isArray(missions) || missions.length === 0) return null;
    var d = new Date();
    var iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    for (var i = 0; i < missions.length; i++) {
      if (missions[i].mission_date === iso) return missions[i];
    }
    return null;
  }

  // ===========================================================================
  // Today card (daily report)
  // ===========================================================================
  function renderTodayCard(missions) {
    var card = $('#todayCard');
    var body = $('#todayBody');
    var dateLabel = $('#todayDate');
    if (!card || !body) return;
    body.innerHTML = '';

    var d = new Date();
    var weekdayFull = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
    var monthShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
    if (dateLabel) dateLabel.textContent = weekdayFull + ' · ' + monthShort + ' ' + d.getDate();

    var today = findTodayMission(missions);
    if (!today) {
      body.appendChild(el('p', { class: 'parent-empty', text: 'Nigel hasn\u2019t opened Hero Academy yet today.' }));
      return;
    }

    var steps = extractMissionSteps(today);
    var completed = today.completed_zones || [];

    // Aggregate planned + done minutes per subject.
    var bySubject = {};
    SUBJECTS.forEach(function (s) { bySubject[s.key] = { planned: 0, done: 0, zones: [] }; });
    steps.forEach(function (s) {
      if (!s || !s.subject || !bySubject[s.subject]) return;   // skip 'trophy' / unknowns
      var min = Number(s.minutes) || 0;
      bySubject[s.subject].planned += min;
      var isDone = !!(s.zone_id && completed.indexOf(s.zone_id) !== -1);
      if (isDone) bySubject[s.subject].done += min;
      bySubject[s.subject].zones.push({ zone_id: s.zone_id, title: s.title || s.zone_id, minutes: min, done: isDone });
    });

    // Top stat row: minutes done / planned + percent.
    var plannedTotal = 0, doneTotal = 0;
    SUBJECTS.forEach(function (s) { plannedTotal += bySubject[s.key].planned; doneTotal += bySubject[s.key].done; });
    var pct = plannedTotal > 0 ? Math.round((doneTotal / plannedTotal) * 100) : 0;

    var headline = el('div', { class: 'parent-today-headline' }, [
      el('div', { class: 'parent-today-bignum' }, [
        el('span', { class: 'parent-today-bignum-val', text: doneTotal + ' / ' + plannedTotal }),
        el('span', { class: 'parent-today-bignum-lbl', text: 'minutes done' }),
      ]),
      el('div', { class: 'parent-today-bigpct-frame' }, [
        el('div', { class: 'parent-today-bigpct-bar', style: { width: pct + '%' } }),
        el('div', { class: 'parent-today-bigpct-num', text: pct + '%' }),
      ]),
    ]);
    body.appendChild(headline);

    // Per-subject rows.
    var rowsWrap = el('div', { class: 'parent-today-subjects' });
    SUBJECTS.forEach(function (s) {
      var rec = bySubject[s.key];
      if (rec.planned === 0) return;   // no entry for this subject today (e.g. skipped)
      var rowPct = Math.min(100, Math.round((rec.done / rec.planned) * 100));
      var doneAll = rec.done >= rec.planned;

      var zoneChips = rec.zones.map(function (z) {
        return el('span', {
          class: 'parent-today-zone-chip' + (z.done ? ' is-done' : ''),
          attrs: { title: z.minutes + ' min' },
          text: (z.done ? '✓ ' : '') + z.title,
        });
      });

      var row = el('div', { class: 'parent-today-subject-row' + (doneAll ? ' is-done' : '') }, [
        el('div', { class: 'parent-today-subject-head' }, [
          el('span', { class: 'parent-today-subject-emoji', text: s.emoji }),
          el('span', { class: 'parent-today-subject-label', text: s.label }),
          el('span', { class: 'parent-today-subject-mins', text: rec.done + ' / ' + rec.planned + ' min' + (doneAll ? ' ✅' : '') }),
        ]),
        el('div', { class: 'parent-today-subject-bar-frame' }, [
          el('div', { class: 'parent-today-subject-bar', style: { width: rowPct + '%', background: s.color } }),
        ]),
        el('div', { class: 'parent-today-subject-zones' }, zoneChips),
      ]);
      rowsWrap.appendChild(row);
    });
    body.appendChild(rowsWrap);

    // Foot note — mission completion status.
    var foot;
    if (today.completed_at) {
      foot = 'Mission completed ' + fmtTime(today.completed_at) + '.';
    } else if (doneTotal > 0) {
      foot = 'In progress — ' + (plannedTotal - doneTotal) + ' minutes still to go.';
    } else {
      foot = 'Mission planned but not started yet.';
    }
    body.appendChild(el('p', { class: 'parent-card-foot', text: foot }));
  }

  // ===========================================================================
  // Weekly subject roll-up — total minutes per subject across the last 7 days.
  // ===========================================================================
  function renderWeekSubjects(missions) {
    var wrap = $('#weekSubjects');
    if (!wrap) return;
    wrap.innerHTML = '';

    var totals = {};
    SUBJECTS.forEach(function (s) { totals[s.key] = 0; });

    (missions || []).forEach(function (m) {
      var steps = extractMissionSteps(m);
      var completed = m.completed_zones || [];
      steps.forEach(function (s) {
        if (!s || !s.subject || !totals.hasOwnProperty(s.subject)) return;
        if (!s.zone_id || completed.indexOf(s.zone_id) === -1) return;
        totals[s.subject] += Number(s.minutes) || 0;
      });
    });

    var grandTotal = 0;
    SUBJECTS.forEach(function (s) { grandTotal += totals[s.key]; });
    if (grandTotal === 0) {
      wrap.hidden = true;
      return;
    }

    var max = 1;
    SUBJECTS.forEach(function (s) { if (totals[s.key] > max) max = totals[s.key]; });

    wrap.appendChild(el('div', { class: 'parent-week-subjects-title', text: 'Minutes by subject (last 7 days)' }));
    var grid = el('div', { class: 'parent-week-subjects-grid' });
    SUBJECTS.forEach(function (s) {
      var mins = totals[s.key];
      var w = Math.round((mins / max) * 100);
      grid.appendChild(el('div', { class: 'parent-week-subjects-row' }, [
        el('div', { class: 'parent-week-subjects-label', text: s.emoji + ' ' + s.label }),
        el('div', { class: 'parent-week-subjects-bar-frame' }, [
          el('div', { class: 'parent-week-subjects-bar', style: { width: Math.max(2, w) + '%', background: s.color } }),
        ]),
        el('div', { class: 'parent-week-subjects-val', text: mins + ' min' }),
      ]));
    });
    wrap.appendChild(grid);
    wrap.hidden = false;
  }

  function renderMissions(missions) {
    var list = $('#missionsList');
    list.innerHTML = '';
    if (!missions || !missions.length) {
      list.appendChild(el('p', { class: 'parent-empty', text: 'No daily missions in the last 7 days.' }));
      return;
    }
    missions.forEach(function (m) {
      var completed = m.completed_zones || [];
      var planned = m.planned || [];
      var done = planned.filter(function (p) { return p.zone_id && completed.indexOf(p.zone_id) !== -1; }).length;
      var total = planned.length;
      var isComplete = m.completed_at != null;

      var row = el('div', { class: 'parent-mission-row' + (isComplete ? ' is-complete' : '') }, [
        el('div', { class: 'parent-mission-date' }, [
          el('span', { class: 'parent-mission-date-main', text: fmtShortDate(m.mission_date) }),
          el('span', { class: 'parent-mission-progress', text: done + '/' + total }),
        ]),
        el('div', { class: 'parent-mission-zones' }, planned.map(function (p) {
          var visited = p.zone_id && completed.indexOf(p.zone_id) !== -1;
          return el('span', {
            class: 'parent-mission-chip' + (visited ? ' is-done' : ''),
            attrs: { title: p.phase + ' · ' + (p.minutes || 0) + ' min' },
            text: (visited ? '✓ ' : '') + (p.title || p.zone_id || p.phase),
          });
        })),
      ]);

      if (isComplete) {
        row.appendChild(el('div', { class: 'parent-mission-foot', text: 'Completed ' + fmtTime(m.completed_at) }));
      } else if (completed.length > 0) {
        row.appendChild(el('div', { class: 'parent-mission-foot', text: 'In progress' }));
      } else {
        row.appendChild(el('div', { class: 'parent-mission-foot parent-mission-foot-muted', text: 'Not started' }));
      }

      list.appendChild(row);
    });
  }

  function renderQuests(quests) {
    var list = $('#questsList');
    list.innerHTML = '';
    if (!quests || !quests.length) {
      list.appendChild(el('p', { class: 'parent-empty', text: 'No real-world quests in the last 7 days. They live on the home screen under the cyan-green tile.' }));
      return;
    }
    quests.forEach(function (q) {
      var isPhoto = q.category === 'show_and_tell';
      var hasAnswer = q.answer && q.completed_at;
      var card = el('div', { class: 'parent-quest-card' + (isPhoto ? ' is-photo' : '') }, [
        el('div', { class: 'parent-quest-head' }, [
          el('span', { class: 'parent-quest-cat', text: (isPhoto ? '📷 ' : '') + (q.category || 'quest').replace(/_/g, ' ').toUpperCase() }),
          el('span', { class: 'parent-quest-time', text: fmtRelative(q.started_at) }),
        ]),
        el('p', { class: 'parent-quest-prompt', text: q.quest_text || q.quest_key }),
        hasAnswer
          ? el('div', { class: 'parent-quest-answer' }, [
              el('div', { class: 'parent-quest-answer-label', text: isPhoto ? 'Ms. Humphrey said:' : 'Nigel answered:' }),
              el('div', { class: 'parent-quest-answer-body', text: isPhoto ? q.answer.replace(/^\[photo\]\s*/, '') : q.answer }),
              el('div', { class: 'parent-quest-answer-meta', text: 'Took ' + fmtDuration(q.duration_seconds) }),
            ])
          : el('div', { class: 'parent-quest-pending', text: q.completed_at ? '(no answer)' : 'Started but not completed' }),
      ]);
      list.appendChild(card);
    });
  }

  function directiveTitle(d) {
    var p = d.payload || {};
    switch (d.directive_type) {
      case 'focus_skill':
        var skill = SKILL_OPTIONS.filter(function (s) { return s.key === p.skill; })[0];
        return 'Focus on: ' + (skill ? skill.label : (p.skill || '?'));
      case 'skip_zone_today':
        return 'Skip ' + zoneLabel(p.zone) + (p.date ? ' on ' + fmtShortDate(p.date) : ' today');
      case 'request_quest_category':
        var cat = QUEST_CATEGORIES.filter(function (c) { return c.key === p.category; })[0];
        return 'Suggest a quest about: ' + (cat ? cat.label : (p.category || '?'));
      case 'note_for_humphrey':
        return 'Note for Ms. Humphrey';
      default:
        return d.directive_type;
    }
  }

  function renderDirectives(directives) {
    var list = $('#directivesList');
    list.innerHTML = '';
    if (!directives || !directives.length) {
      list.appendChild(el('p', { class: 'parent-empty', text: 'No active notes. Send one with the button above — Ms. Humphrey will fold it into Nigel’s next session.' }));
      return;
    }
    directives.forEach(function (d) {
      var card = el('div', { class: 'parent-directive-card' }, [
        el('div', { class: 'parent-directive-head' }, [
          el('span', { class: 'parent-directive-by', text: 'from ' + (d.created_by || 'parent') }),
          el('span', { class: 'parent-directive-time', text: fmtRelative(d.created_at) }),
        ]),
        el('div', { class: 'parent-directive-title', text: directiveTitle(d) }),
        d.directive_type === 'note_for_humphrey' && d.payload && d.payload.text
          ? el('div', { class: 'parent-directive-note', text: '“' + d.payload.text + '”' })
          : null,
        el('button', {
          class: 'parent-directive-deactivate',
          text: 'Done — remove this note',
          on: {
            click: function () {
              if (!confirm('Remove this note?')) return;
              deactivateDirective(d.id);
            },
          },
        }),
      ]);
      list.appendChild(card);
    });
  }

  // -------------------------------------------------------------------------
  // Directive composer overlay
  // -------------------------------------------------------------------------
  function renderPayloadFields(type) {
    var host = $('#payloadFields');
    host.innerHTML = '';
    if (type === 'focus_skill') {
      var sel = el('select', { class: 'parent-input', id: 'pf-skill' });
      SKILL_OPTIONS.forEach(function (s) {
        sel.appendChild(el('option', { attrs: { value: s.key }, text: s.label }));
      });
      host.appendChild(el('label', { class: 'parent-field' }, [
        el('span', { class: 'parent-field-label', text: 'Which skill?' }),
        sel,
      ]));
    } else if (type === 'skip_zone_today') {
      var zsel = el('select', { class: 'parent-input', id: 'pf-zone' });
      Object.keys(ZONE_LABELS).forEach(function (k) {
        zsel.appendChild(el('option', { attrs: { value: k }, text: ZONE_LABELS[k] }));
      });
      host.appendChild(el('label', { class: 'parent-field' }, [
        el('span', { class: 'parent-field-label', text: 'Which zone to skip today?' }),
        zsel,
      ]));
      host.appendChild(el('p', { class: 'parent-field-hint',
        text: 'Ms. Humphrey will swap this zone for a different one in today’s mission.' }));
    } else if (type === 'request_quest_category') {
      var csel = el('select', { class: 'parent-input', id: 'pf-cat' });
      QUEST_CATEGORIES.forEach(function (c) {
        csel.appendChild(el('option', { attrs: { value: c.key }, text: c.label }));
      });
      host.appendChild(el('label', { class: 'parent-field' }, [
        el('span', { class: 'parent-field-label', text: 'What kind of real-world quest?' }),
        csel,
      ]));
    } else {
      // note_for_humphrey
      var ta = el('textarea', {
        class: 'parent-input parent-input-text',
        id: 'pf-note',
        attrs: { rows: '4', maxlength: '500', placeholder: 'e.g. He was a little down at breakfast — be extra encouraging today.' },
      });
      host.appendChild(el('label', { class: 'parent-field' }, [
        el('span', { class: 'parent-field-label', text: 'What should she know?' }),
        ta,
      ]));
      host.appendChild(el('p', { class: 'parent-field-hint',
        text: 'Ms. Humphrey will keep this in mind during today’s sessions. Bianca will see it in Saturday’s email too.' }));
    }
  }

  function openComposer() {
    var overlay = $('#directiveOverlay');
    overlay.hidden = false;
    document.body.classList.add('parent-overlay-open');
    $('#directiveType').value = 'note_for_humphrey';
    renderPayloadFields('note_for_humphrey');
    $('#composerError').hidden = true;
    // Reset submit button — it may have been left in a "Sending…" / disabled
    // state by a prior successful submit (see submitComposer).
    var sub = $('#composerSubmit');
    sub.disabled = false;
    sub.textContent = 'Send';
    setTimeout(function () {
      var firstInput = overlay.querySelector('textarea, input, select:not(#directiveType)');
      if (firstInput) firstInput.focus();
    }, 50);
  }

  function closeComposer() {
    $('#directiveOverlay').hidden = true;
    document.body.classList.remove('parent-overlay-open');
  }

  function buildPayload(type) {
    if (type === 'focus_skill') return { skill: $('#pf-skill').value };
    if (type === 'skip_zone_today') {
      var d = new Date();
      var iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      return { zone: $('#pf-zone').value, date: iso };
    }
    if (type === 'request_quest_category') return { category: $('#pf-cat').value };
    var note = ($('#pf-note').value || '').trim();
    if (!note) throw new Error('Please write a short note before sending.');
    return { text: note };
  }

  function submitComposer() {
    var btn = $('#composerSubmit');
    var errEl = $('#composerError');
    errEl.hidden = true;
    var type = $('#directiveType').value;
    var payload;
    try {
      payload = buildPayload(type);
    } catch (e) {
      errEl.textContent = e.message;
      errEl.hidden = false;
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Sending…';
    rpc('ha_create_directive', {
      p_child_id: NIGEL_ID,
      p_directive_type: type,
      p_payload: payload,
      p_created_by: state.parent.token,
    }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Send';
      closeComposer();
      loadDashboard();
    }).catch(function (e) {
      errEl.textContent = e.message || String(e);
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Send';
    });
  }

  function deactivateDirective(id) {
    rpc('ha_deactivate_directive', { p_directive_id: id })
      .then(loadDashboard)
      .catch(function (e) {
        alert('Could not remove the note: ' + (e.message || e));
      });
  }

  // -------------------------------------------------------------------------
  // Main load
  // -------------------------------------------------------------------------
  var state = { parent: null, dash: null };

  function loadDashboard() {
    $('#loadingBlock').hidden = false;
    $('#errorBlock').hidden = true;
    $('#contentBlock').hidden = true;
    rpc('ha_parent_dashboard', { p_child_id: NIGEL_ID })
      .then(function (dash) {
        state.dash = dash;
        renderTodayCard(dash.missions);
        renderWeekStrip(dash.sessions_by_day);
        renderWeekSubjects(dash.missions);
        renderMissions(dash.missions);
        renderQuests(dash.quests);
        renderDirectives(dash.active_directives);
        $('#loadingBlock').hidden = true;
        $('#contentBlock').hidden = false;
      })
      .catch(function (e) {
        $('#loadingBlock').hidden = true;
        $('#errorBlock').hidden = false;
        $('#errorDetail').textContent = e.message || String(e);
        console.warn('[parent] dashboard load failed', e);
      });
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  function boot() {
    var parent = readParent();
    if (!parent) {
      $('#gateBlock').hidden = false;
      // v83: wire the parent-picker buttons on the gate. Tap → set hash → boot.
      console.log('[parent] gate shown, wiring picker buttons');
      $$('#gateBlock .parent-gate-btn').forEach(function (btn) {
        function handle(ev) {
          if (btn._ha_gate_clicked) return;        // prevent double-fire (click + touchend)
          btn._ha_gate_clicked = true;
          if (ev && ev.preventDefault) ev.preventDefault();
          var who = btn.getAttribute('data-parent');
          console.log('[parent] gate tap', who, 'evt=' + (ev && ev.type));
          if (who && PARENTS[who]) {
            window.location.hash = who;
            $('#gateBlock').hidden = true;
            boot();
          } else {
            console.warn('[parent] gate tap with unknown parent token:', who);
            btn._ha_gate_clicked = false;          // allow retry
          }
        }
        // Primary handler — works on every modern browser.
        btn.addEventListener('click', handle);
        // v88: Android Chrome PWA fallback. On some installed PWAs the first
        // click after a hash-only navigation doesn't fire reliably; touchend
        // bridges the gap. The _ha_gate_clicked flag prevents double-fire when
        // both events do arrive.
        btn.addEventListener('touchend', handle, { passive: false });
      });
      return;
    }
    state.parent = parent;
    $('#parentName').textContent = parent.display;
    $('#dashBlock').hidden = false;

    // Wire up composer
    $('#newDirectiveBtn').addEventListener('click', openComposer);
    $$('#directiveOverlay [data-close-overlay]').forEach(function (b) {
      b.addEventListener('click', closeComposer);
    });
    $('#directiveOverlay').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) closeComposer();
    });
    $('#directiveType').addEventListener('change', function () {
      renderPayloadFields(this.value);
    });
    $('#composerSubmit').addEventListener('click', submitComposer);
    $('#retryBtn').addEventListener('click', loadDashboard);

    // React to hash change (e.g., Bianca pastes #josh after #bianca).
    window.addEventListener('hashchange', function () {
      var p = readParent();
      if (!p) { window.location.reload(); return; }
      state.parent = p;
      $('#parentName').textContent = p.display;
    });

    loadDashboard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Expose for console debugging.
  window.HeroAcademy = window.HeroAcademy || {};
  window.HeroAcademy.Parent = { reload: loadDashboard, state: state };
})();
