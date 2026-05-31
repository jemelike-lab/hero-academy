/**
 * Hero Academy — Ms. Humphrey Q&A client.
 *
 * Wraps /api/humphrey/chat (Claude Haiku 4.5). Returns a plain text answer
 * suitable for handing straight to Humphrey.say(... , { text }).
 *
 * Public API on window.HeroAcademy.Chat:
 *   ask(question, ctx?) -> Promise<{ answer, redirected?, error?, detail? }>
 *     ctx = { activeProblem?, activeProblemAnswer?, kidName?, grade? }
 *   isQuestion(transcript) -> bool  (heuristic for routing in idle handler)
 */
(function(){
  'use strict';
  var NS = window.HeroAcademy = window.HeroAcademy || {};

  function debug() {
    try {
      if (window.localStorage && localStorage.getItem('ha_humphrey_debug') === '1') {
        var args = ['[Humphrey Chat]'].concat([].slice.call(arguments));
        console.log.apply(console, args);
      }
    } catch(_) {}
  }

  /**
   * Heuristic: does this look like a real question worth routing to Claude?
   * Returns true for things containing question words, false for short yes/no/
   * acknowledgement utterances.
   */
  function isQuestion(transcript) {
    if (!transcript) return false;
    var t = String(transcript).toLowerCase().trim();
    if (t.length < 4) return false;
    // Question marks first
    if (t.indexOf('?') !== -1) return true;
    // Wh-question + how/can/could/do/does at the start of any clause
    if (/\b(what|why|how|when|where|who|which|whose|can you|could you|do you|does|tell me|explain|teach me|i wonder)\b/.test(t)) return true;
    return false;
  }

  function ask(question, ctx) {
    ctx = ctx || {};
    var body = {
      question: question,
      activeProblem: ctx.activeProblem || '',
      activeProblemAnswer: (ctx.activeProblemAnswer != null ? String(ctx.activeProblemAnswer) : ''),
      kidName: ctx.kidName || 'Nigel',
      grade: ctx.grade || '2nd grade'
    };
    debug('ask:', body);
    return fetch('/api/humphrey/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function(resp){
      if (!resp.ok) {
        return resp.text().then(function(txt){
          debug('chat non-ok:', resp.status, txt.slice(0, 200));
          return { answer: '', error: 'chat-' + resp.status, detail: txt.slice(0, 300) };
        });
      }
      return resp.json().then(function(json){
        debug('answer:', json && json.answer);
        return {
          answer: (json && json.answer) || '',
          redirected: !!(json && json.redirected),
          model: json && json.model
        };
      });
    }).catch(function(err){
      debug('fetch err:', err);
      return { answer: '', error: 'fetch-failed', detail: String(err && err.message) };
    });
  }

  NS.Chat = { ask: ask, isQuestion: isQuestion };
})();
