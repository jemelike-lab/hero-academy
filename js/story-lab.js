/**
 * Hero Academy — Story Lab session controller.
 *
 * MadLibs-style narrative-writing zone aligned to CCSS W.2.3.
 *
 * Flow (4 screens):
 *   1. Picker      — choose 1 of 10 templates
 *   2. Slot fill   — for each slot, pick a word from a part-of-speech filtered bank
 *   3. Story view  — completed story + "READ TO ME!" (Ms. Humphrey reads dramatically)
 *                    + Save / Make another / Library
 *   4. Library     — list of saved stories, tap to re-read
 *
 * Persistence:
 *   ha_stories — array of { id, templateId, title, slots, text, createdAt }
 *   ha_story_session_count — bump per completed story for spaced repetition
 *
 * Public surface:
 *   window.HeroAcademy.StoryLab.{ boot, _session }
 */
(function () {
  'use strict';
  var NS = (window.HeroAcademy = window.HeroAcademy || {});

  var STORAGE_STORIES = 'ha_stories';
  var STORAGE_COUNT = 'ha_story_session_count';
  var STATE_KEY = 'hero_academy_state_v1';
  var MAX_SAVED_STORIES = 30;

  var session = {
    screen: 'picker',          // picker | slots | story | library
    template: null,            // currently-selected template
    slotValues: {},            // { slotKey: chosenWord }
    slotIndex: 0,
    completedText: null,       // final substituted story
  };

  function $(id) { return document.getElementById(id); }
  function safeJSON(key, fallback) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { return fallback; }
  }
  function safeSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function escapeHTML(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // --- Screen 1: template picker ------------------------------------------

  function showPicker() {
    session.screen = 'picker';
    session.template = null;
    session.slotValues = {};
    session.slotIndex = 0;
    session.completedText = null;

    var T = NS.StoryTemplates;
    if (!T) { console.error('[StoryLab] templates missing'); return; }

    $('sl-stage').className = 'sl-stage sl-stage--picker';
    $('sl-stage').innerHTML =
      '<div class="sl-picker-header">' +
        '<h2 class="sl-picker-title">Pick a story to write!</h2>' +
        '<p class="sl-picker-sub">Tap one. I will help you fill in the blanks.</p>' +
      '</div>' +
      '<div class="sl-template-grid" id="sl-template-grid"></div>' +
      '<button class="sl-library-link" id="sl-library-link">📚 My saved stories (<span id="sl-saved-count">0</span>)</button>';

    // Try the Supabase content bank first; fall back to the static curated
    // list on any failure or empty pool. The kid never blocks on Haiku.
    loadServerTemplates().then(function (tpls) {
      if (!tpls || tpls.length === 0) tpls = T.all();
      renderPickerGrid(tpls);
      maybeTopUpStoryPool();
    }).catch(function () {
      renderPickerGrid(T.all());
    });

    var saved = safeJSON(STORAGE_STORIES, []);
    $('sl-saved-count').textContent = saved.length;
    $('sl-library-link').onclick = function () { showLibrary(); };
    if (saved.length === 0) $('sl-library-link').style.display = 'none';

    // Quiet welcome — let Ms. Humphrey explain on the first visit only
    maybeWelcome();
  }

  // Renders the picker cards. Extracted so both server and static paths
  // share the same DOM construction.
  function renderPickerGrid(tpls) {
    var grid = $('sl-template-grid');
    if (!grid) return;
    grid.innerHTML = '';
    tpls.forEach(function (tpl) {
      var btn = document.createElement('button');
      btn.className = 'sl-template-card';
      btn.innerHTML =
        '<div class="sl-tpl-emoji">' + tpl.emoji + '</div>' +
        '<div class="sl-tpl-title">' + escapeHTML(tpl.title) + '</div>' +
        '<div class="sl-tpl-meta">' + tpl.slots.length + ' words to pick</div>';
      btn.onclick = function () { startTemplate(tpl); };
      grid.appendChild(btn);
    });
  }

  // --- Server content bank --------------------------------------------------

  // Server rows look like:
  //   { id, title, emoji, theme, slots_json, text_template }
  // Client templates look like:
  //   { id?, title, emoji, slots[], text }
  // The picker + slot picker only care about slots/text — keep names aligned
  // and stash _server so the started/completed mirrors fire.
  function mapServerTemplate(row) {
    var slots = Array.isArray(row.slots_json) ? row.slots_json : [];
    return {
      id: row.id,
      title: row.title || '',
      emoji: row.emoji || '✨',
      slots: slots,
      text: row.text_template || '',
      theme: row.theme || '',
      _server: true,
    };
  }

  function loadServerTemplates() {
    var Tel = NS.Telemetry;
    if (!Tel || typeof Tel.rpc !== 'function') return Promise.resolve(null);
    return Tel.rpc('ha_get_story_templates', {
      p_child_id: Tel.childId(),
      p_n: 10
    }).then(function (r) {
      if (!r || !r.ok) return null;
      return r.json();
    }).then(function (rows) {
      if (!Array.isArray(rows) || rows.length === 0) return null;
      return rows.map(mapServerTemplate);
    });
  }

  function maybeTopUpStoryPool() {
    var Tel = NS.Telemetry;
    if (!Tel || typeof Tel.rpc !== 'function') return;
    Tel.rpc('ha_story_pool_status', { p_child_id: Tel.childId() })
      .then(function (r) {
        if (!r || !r.ok) return null;
        return r.json();
      })
      .then(function (rows) {
        var s = Array.isArray(rows) ? rows[0] : rows;
        if (!s) return;
        if ((s.unseen || 0) >= 6) return;
        fetch('/api/humphrey/generate-story-templates', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            child_id: Tel.childId(),
            target_count: 6
          }),
          keepalive: true
        }).catch(function () {});
      }).catch(function () {});
  }

  function maybeWelcome() {
    var H = NS.Humphrey;
    if (!H) return;
    var today = (new Date()).toISOString().slice(0, 10);
    var key = 'ha_welcomed_storylab_' + today;
    var already = false;
    try { already = localStorage.getItem(key) === '1'; } catch (e) {}
    if (already) return;
    try { localStorage.setItem(key, '1'); } catch (e) {}
    setTimeout(function () {
      H.say('try-again-reading', {
        kidName: 'Nigel',
        expression: 'smile',
        text: 'Welcome to Story Lab, Nigel! Pick a story you like, and I will help you fill in the missing words. Ready? Tap one.',
      });
    }, 600);
  }

  // --- Screen 2: slot filling --------------------------------------------

  function startTemplate(tpl) {
    session.screen = 'slots';
    session.template = tpl;
    session.slotValues = {};
    session.slotIndex = 0;
    // Mirror "kid picked this template" to the content bank for seen tracking.
    if (tpl && tpl.id && tpl._server) {
      var Tel = NS.Telemetry;
      if (Tel && typeof Tel.rpc === 'function') {
        Tel.rpc('ha_mark_story_started', { p_item_id: tpl.id }).catch(function () {});
      }
    }
    renderSlot();
  }

  function renderSlot() {
    var tpl = session.template;
    var slot = tpl.slots[session.slotIndex];
    var V = NS.Vocab;
    if (!V) { console.error('[StoryLab] vocab missing'); return; }

    $('sl-stage').className = 'sl-stage sl-stage--slots';
    $('sl-stage').innerHTML =
      '<div class="sl-slot-header">' +
        '<button class="sl-back" id="sl-slot-back" aria-label="Back to story picker">‹ Back</button>' +
        '<div class="sl-slot-title">' + tpl.emoji + ' ' + escapeHTML(tpl.title) + '</div>' +
      '</div>' +
      '<div class="sl-progress" id="sl-progress"></div>' +
      '<div class="sl-slot-step">Word ' + (session.slotIndex + 1) + ' of ' + tpl.slots.length + '</div>' +
      '<div class="sl-slot-prompt-wrap">' +
        '<div class="sl-slot-kindline">Pick <strong>' + V.kindLabel(slot.kind) + '</strong>:</div>' +
        '<div class="sl-slot-prompt">' + escapeHTML(slot.prompt) + '</div>' +
      '</div>' +
      '<div class="sl-word-grid" id="sl-word-grid"></div>';

    // Progress dots
    var prog = $('sl-progress');
    for (var i = 0; i < tpl.slots.length; i++) {
      var d = document.createElement('div');
      d.className = 'sl-progress-dot' + (i < session.slotIndex ? ' filled' : (i === session.slotIndex ? ' current' : ''));
      prog.appendChild(d);
    }

    // Back button — to picker (with confirm if mid-story)
    $('sl-slot-back').onclick = function () {
      if (session.slotIndex === 0) { showPicker(); return; }
      // Mid-story: just go back one slot
      session.slotIndex -= 1;
      delete session.slotValues[tpl.slots[session.slotIndex].key];
      renderSlot();
    };

    // Word picker
    var grid = $('sl-word-grid');
    V.get(slot.kind).forEach(function (word) {
      var btn = document.createElement('button');
      btn.className = 'sl-word-btn';
      btn.textContent = word;
      btn.onclick = function () { pickWord(word, btn); };
      grid.appendChild(btn);
    });
  }

  function pickWord(word, btn) {
    var tpl = session.template;
    var slot = tpl.slots[session.slotIndex];
    session.slotValues[slot.key] = word;

    // Brief visual confirmation
    btn.classList.add('sl-word-btn--picked');
    document.querySelectorAll('.sl-word-btn').forEach(function (b) { b.disabled = true; });

    setTimeout(function () {
      session.slotIndex += 1;
      if (session.slotIndex >= tpl.slots.length) {
        showCompletedStory();
      } else {
        renderSlot();
      }
    }, 500);
  }

  // --- Screen 3: completed story -----------------------------------------

  function showCompletedStory() {
    session.screen = 'story';
    var tpl = session.template;
    var text = tpl.text.replace(/\{(\w+)\}/g, function (_, key) {
      return session.slotValues[key] || '???';
    });
    session.completedText = text;

    // --- telemetry: record this completed story --------------------------
    if (window.HeroAcademy && window.HeroAcademy.Telemetry &&
        typeof window.HeroAcademy.Telemetry.recordAttempt === 'function') {
      window.HeroAcademy.Telemetry.recordAttempt(
        true,
        (tpl && tpl.title) || 'story',
        'completion',
        String(text).slice(0, 200)
      );
      // Mirror completion to per-template bank — bumps completed_count and
      // (after 3 completions) auto-masters the template so it rotates out.
      if (tpl && tpl.id && tpl._server && typeof window.HeroAcademy.Telemetry.rpc === 'function') {
        window.HeroAcademy.Telemetry.rpc('ha_mark_story_completed', {
          p_item_id: tpl.id
        }).catch(function () {});
      }
    }

    $('sl-stage').className = 'sl-stage sl-stage--story';
    $('sl-stage').innerHTML =
      '<div class="sl-story-header">' +
        '<div class="sl-story-eyebrow">YOUR STORY</div>' +
        '<h2 class="sl-story-title">' + tpl.emoji + ' ' + escapeHTML(tpl.title) + '</h2>' +
      '</div>' +
      '<div class="sl-story-body" id="sl-story-body">' + escapeHTML(text) + '</div>' +
      '<div class="sl-story-actions">' +
        '<button class="sl-action sl-action--primary" id="sl-read">🔊  READ TO ME!</button>' +
        '<button class="sl-action sl-action--secondary" id="sl-save">💾  SAVE</button>' +
        '<button class="sl-action sl-action--secondary" id="sl-another">✨  ANOTHER</button>' +
      '</div>' +
      '<button class="sl-back sl-back--bottom" id="sl-story-home">‹ Back to map</button>';

    $('sl-read').onclick = readAloud;
    $('sl-save').onclick = saveStory;
    $('sl-another').onclick = showPicker;
    $('sl-story-home').onclick = function () { window.location.href = 'index.html'; };

    // Ms. Humphrey kicks off by reading the story automatically — that's the
    // payoff moment. User can re-tap READ TO ME to hear it again.
    setTimeout(readAloud, 500);

    burstConfetti();
  }

  function readAloud() {
    var H = NS.Humphrey;
    if (!H || !session.completedText) return;
    // Pass duration override so the bubble doesn't dismiss before she finishes.
    var dur = Math.min(20000, Math.max(6000, session.completedText.length * 70));
    H.say('correct-answer-reading', {
      kidName: 'Nigel',
      text: 'Listen to your story, Nigel. ' + session.completedText,
      expression: 'cheering',
      duration: dur,
    });
    var btn = $('sl-read');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '🔊  Reading…';
      setTimeout(function () {
        btn.disabled = false;
        btn.textContent = '🔊  READ AGAIN!';
      }, dur + 400);
    }
  }

  function saveStory() {
    var tpl = session.template;
    if (!tpl || !session.completedText) return;
    var saved = safeJSON(STORAGE_STORIES, []);
    var story = {
      id: 'story-' + Date.now(),
      templateId: tpl.id,
      title: tpl.title,
      emoji: tpl.emoji,
      slots: Object.assign({}, session.slotValues),
      text: session.completedText,
      createdAt: new Date().toISOString(),
    };
    saved.push(story);
    // Cap at MAX_SAVED_STORIES (drop oldest)
    if (saved.length > MAX_SAVED_STORIES) saved = saved.slice(-MAX_SAVED_STORIES);
    safeSet(STORAGE_STORIES, saved);

    // Bump count + push a summary into Ms. Humphrey's memory store
    var n = safeJSON(STORAGE_COUNT, 0) + 1;
    safeSet(STORAGE_COUNT, n);
    persistSessionSummary(story);

    // Update zone progress (+10% per saved story, capped at 100)
    var globalState = safeJSON(STATE_KEY, {});
    globalState.zoneProgress = globalState.zoneProgress || {};
    globalState.zoneProgress.writing = Math.min(100, (globalState.zoneProgress.writing || 0) + 10);
    globalState.coins = (globalState.coins || 0) + 2;
    globalState.zonesCompletedToday = Math.min(3, (globalState.zonesCompletedToday || 0) + (n === 1 ? 1 : 0));
    safeSet(STATE_KEY, globalState);

    // Visual confirmation
    var btn = $('sl-save');
    if (btn) {
      btn.textContent = '✓  SAVED!';
      btn.disabled = true;
    }
  }

  function persistSessionSummary(story) {
    try {
      var M = NS.Memory;
      if (!M || typeof M.addCustomSummary !== 'function') return;
      var summary =
        'Nigel wrote a story in Story Lab called "' + story.title +
        '". He picked words to fill in the blanks and Ms. Humphrey read it back to him.';
      M.addCustomSummary(summary);
    } catch (e) { /* non-fatal */ }
  }

  // --- Screen 4: library --------------------------------------------------

  function showLibrary() {
    session.screen = 'library';
    var saved = safeJSON(STORAGE_STORIES, []);

    $('sl-stage').className = 'sl-stage sl-stage--library';
    $('sl-stage').innerHTML =
      '<div class="sl-library-header">' +
        '<button class="sl-back" id="sl-lib-back" aria-label="Back to story picker">‹ Back</button>' +
        '<h2 class="sl-library-title">📚 My Stories</h2>' +
      '</div>' +
      (saved.length === 0
        ? '<p class="sl-library-empty">No saved stories yet. Pick a template and write one!</p>'
        : '<div class="sl-library-list" id="sl-library-list"></div>');

    $('sl-lib-back').onclick = showPicker;

    if (saved.length === 0) return;
    var list = $('sl-library-list');
    saved.slice().reverse().forEach(function (story) {
      var item = document.createElement('div');
      item.className = 'sl-lib-item';
      var dateStr = '';
      try { dateStr = new Date(story.createdAt).toLocaleDateString(); } catch (e) {}
      item.innerHTML =
        '<div class="sl-lib-item-head">' +
          '<span class="sl-lib-item-emoji">' + story.emoji + '</span>' +
          '<span class="sl-lib-item-title">' + escapeHTML(story.title) + '</span>' +
          '<span class="sl-lib-item-date">' + dateStr + '</span>' +
        '</div>' +
        '<div class="sl-lib-item-body">' + escapeHTML(story.text) + '</div>' +
        '<div class="sl-lib-item-actions">' +
          '<button class="sl-action sl-action--secondary sl-lib-read">🔊  Read again</button>' +
        '</div>';
      item.querySelector('.sl-lib-read').onclick = function () {
        var H = NS.Humphrey;
        if (H) {
          var dur = Math.min(20000, Math.max(6000, story.text.length * 70));
          H.say('correct-answer-reading', {
            kidName: 'Nigel',
            text: 'Here is your story, Nigel. ' + story.text,
            expression: 'cheering',
            duration: dur,
          });
        }
      };
      list.appendChild(item);
    });
  }

  // --- Confetti ----------------------------------------------------------

  function burstConfetti() {
    var colors = ['#ffd147', '#ec4899', '#4287ff', '#2ec27e', '#a855f7', '#ff8b3d'];
    var ct = document.createElement('div');
    ct.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:200;overflow:hidden';
    for (var i = 0; i < 60; i++) {
      var p = document.createElement('div');
      var sz = 6 + Math.random() * 10;
      var cl = colors[Math.floor(Math.random() * colors.length)];
      var sx = 20 + Math.random() * 60;
      var dr = (Math.random() - 0.5) * 70;
      var rt = Math.random() * 720;
      var du = 1.5 + Math.random() * 1.2;
      p.style.cssText =
        'position:absolute;left:' + sx + '%;top:40%;width:' + sz + 'px;height:' + sz +
        'px;background:' + cl + ';border-radius:' + (Math.random() > 0.5 ? '50%' : '2px') +
        ';animation:sl-confetti-fall ' + du + 's ' + Math.random() * 0.4 +
        's cubic-bezier(0.2,0.7,0.3,1) forwards;--drift:' + dr + 'vw;--rot:' + rt + 'deg;';
      ct.appendChild(p);
    }
    document.body.appendChild(ct);
    setTimeout(function () { ct.remove(); }, 3500);
  }

  // --- Boot ---------------------------------------------------------------

  function boot() {
    if (!NS.StoryTemplates || !NS.Vocab) {
      console.error('[StoryLab] data files not loaded');
      return;
    }
    showPicker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  NS.StoryLab = {
    boot: boot,
    _session: function () { return session; },
    _showLibrary: showLibrary,
  };
})();
