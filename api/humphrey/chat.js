/**
 * Hero Academy — Ms. Humphrey Q&A endpoint backed by Claude Haiku 4.5.
 *
 * Request:  POST application/json
 *           { question: string,
 *             activeProblem?: string,   // e.g. "7 + 5"
 *             activeProblemAnswer?: string,
 *             kidName?: string,         // default "Nigel"
 *             grade?: string,           // default "2nd grade"
 *             history?: Array<{role: 'user'|'assistant', content: string}>  // prior turns
 *           }
 *
 * Response: JSON { answer: string, redirected?: boolean }
 *
 * Behavior:
 *   - Detects when the question overlaps the current on-screen math problem and
 *     redirects to scaffolding ("count up from 7...") instead of giving the
 *     answer outright (HANDOFF §2.4 Option C).
 *   - Caps Claude max_tokens so responses stay short enough to feel
 *     conversational at TTS speed.
 *   - When history is supplied, prior turns are included so Ms. Humphrey can
 *     carry a real multi-turn conversation. History is server-side-capped to
 *     the last 10 messages (5 turns) to keep tokens bounded.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY not configured',
      hint: 'Add it in Vercel Project Settings → Environment Variables.'
    });
  }

  let body = req.body;
  // Some Vercel runtimes hand us a buffer instead of parsed JSON
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  if (!body || typeof body !== 'object') body = {};

  const question = String(body.question || '').trim();
  if (!question) {
    return res.status(400).json({ error: 'question is required' });
  }
  if (question.length > 500) {
    return res.status(400).json({ error: 'question too long (max 500 chars)' });
  }

  const kidName = String(body.kidName || 'Nigel').trim() || 'Nigel';
  const grade = String(body.grade || '2nd grade').trim() || '2nd grade';
  const activeProblem = body.activeProblem ? String(body.activeProblem).trim() : '';
  const activeProblemAnswer = body.activeProblemAnswer != null ? String(body.activeProblemAnswer).trim() : '';

  // Page-aware context (from humphrey-qna's sniffPageContext). All optional.
  const zoneId      = body.zoneId      ? String(body.zoneId).trim().slice(0, 60)       : '';
  const zoneLabel   = body.zoneLabel   ? String(body.zoneLabel).trim().slice(0, 120)   : '';
  const pageTitle   = body.pageTitle   ? String(body.pageTitle).trim().slice(0, 120)   : '';
  const visibleText = body.visibleText ? String(body.visibleText).trim().slice(0, 800) : '';

  // Sanitize + clamp history. Anthropic requires strict alternation user→assistant→user,
  // and the final message MUST be a user message (which we add ourselves below).
  // We drop malformed entries, then keep only the last 10 messages.
  let history = Array.isArray(body.history) ? body.history : [];
  history = history
    .map(m => {
      if (!m || typeof m !== 'object') return null;
      const role = m.role === 'assistant' ? 'assistant' : (m.role === 'user' ? 'user' : null);
      const content = typeof m.content === 'string' ? m.content.trim() : '';
      if (!role || !content) return null;
      return { role, content: content.slice(0, 1000) };
    })
    .filter(Boolean)
    .slice(-10);
  // Enforce alternation: if the last history message is a user, drop it (would
  // conflict with the new user turn we're about to append).
  if (history.length && history[history.length - 1].role === 'user') {
    history = history.slice(0, -1);
  }

  // ---- Notebook: profile + recent conversation summaries -----------------
  const profile = (body.profile && typeof body.profile === 'object') ? body.profile : null;
  let recentSummaries = Array.isArray(body.recentSummaries) ? body.recentSummaries : [];
  recentSummaries = recentSummaries.map(s => {
    if (!s || typeof s !== 'object') return null;
    const at = typeof s.at === 'string' ? s.at : '';
    const summary = typeof s.summary === 'string' ? s.summary.trim().slice(0, 600) : '';
    if (!summary) return null;
    return { at, summary };
  }).filter(Boolean).slice(-10);

  function renderProfileLines(p) {
    if (!p || typeof p !== 'object') return [];
    const lines = [];
    if (p.name) lines.push(`Name: ${p.name}` + (p.age ? `, ${p.age} years old` : '') + (p.birthday ? `, birthday ${p.birthday}` : '') + '.');
    if (p.grade) lines.push(`Grade: ${p.grade}${p.school ? `, ${p.school}` : ''}.`);
    if (p.family) {
      const f = p.family;
      const parts = [];
      if (f.mother) parts.push(`mother ${f.mother}`);
      if (f.father) parts.push(`father ${f.father}`);
      if (Array.isArray(f.siblings) && f.siblings.length) parts.push(`siblings: ${f.siblings.join(', ')}`);
      else if (Array.isArray(f.siblings)) parts.push(`no siblings`);
      if (Array.isArray(f.cousins) && f.cousins.length) parts.push(`cousins: ${f.cousins.join(', ')}`);
      if (f.best_friend) parts.push(`best friend ${f.best_friend}`);
      if (Array.isArray(f.other_friends) && f.other_friends.length) parts.push(`other friends: ${f.other_friends.join(', ')}`);
      if (parts.length) lines.push(`Family: ${parts.join('; ')}.`);
    }
    if (p.home) {
      const h = p.home;
      const parts = [];
      if (h.city) parts.push(`lives in ${h.city}`);
      if (h.type) parts.push(`in a ${h.type}`);
      if (h.neighbor) parts.push(`neighbor's name is ${h.neighbor}`);
      if (parts.length) lines.push(parts.join(', ') + '.');
    }
    if (p.faith) {
      const fa = p.faith;
      const parts = [];
      if (fa.religion) parts.push(`${fa.religion} family`);
      if (fa.notes) parts.push(fa.notes);
      if (parts.length) lines.push(`Faith: ${parts.join('. ')}`);
    }
    if (Array.isArray(p.heritage_food) && p.heritage_food.length) lines.push(`Favorite foods: ${p.heritage_food.join(', ')}.`);
    if (Array.isArray(p.loves) && p.loves.length) lines.push(`Loves: ${p.loves.join(', ')}.`);
    if (Array.isArray(p.hobbies) && p.hobbies.length) lines.push(`Hobbies: ${p.hobbies.join('; ')}.`);
    if (Array.isArray(p.academic_strengths) && p.academic_strengths.length) lines.push(`Academic strengths: ${p.academic_strengths.join(', ')}.`);
    if (Array.isArray(p.academic_struggles) && p.academic_struggles.length) lines.push(`Academic struggles: ${p.academic_struggles.join('; ')}.`);
    if (p.personality) lines.push(`Personality: ${p.personality}`);
    if (p.routine) lines.push(`Daily routine: ${p.routine}`);
    if (Array.isArray(p.wants_to_be_when_grown) && p.wants_to_be_when_grown.length) lines.push(`Wants to be when he grows up: ${p.wants_to_be_when_grown.join(' and ')}.`);
    if (Array.isArray(p.recent_milestones) && p.recent_milestones.length) {
      p.recent_milestones.forEach(m => lines.push(`Recent: ${m}`));
    }
    if (Array.isArray(p.playmates) && p.playmates.length) lines.push(`Plays mostly with: ${p.playmates.join(', ')}.`);
    if (Array.isArray(p.do_not_bring_up_unprompted) && p.do_not_bring_up_unprompted.length) {
      lines.push(`SENSITIVE — do not bring up unprompted: ${p.do_not_bring_up_unprompted.join('; ')}.`);
    }
    if (p.humor_easter_egg && p.humor_easter_egg.phrase) {
      lines.push(`Humor easter egg — IMPORTANT, he loves this: "${p.humor_easter_egg.phrase}" is one of ${kidName}'s favorite jokes. ${p.humor_easter_egg.note || 'It always makes him laugh.'} Actively look for fun, light moments to drop it — a great natural hook is whenever the numbers 6 and 7 (or 67) show up, e.g. count "...five, six... SEVEN!" with a playful beat, or react to a 6 and a 7 in a problem. Use it a few times in a session to keep things fun, but NOT every single message, and never during a serious, frustrated, or sad moment.`);
    }
    return lines;
  }

  function fmtSummaryDate(at) {
    try {
      const d = new Date(at);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (_) { return ''; }
  }

  const profileLines = renderProfileLines(profile);
  const notebookSections = [];
  if (profileLines.length) {
    notebookSections.push(
      'WHAT YOU KNOW ABOUT ' + kidName.toUpperCase() + ' (your notebook):\n' +
      profileLines.map(l => '- ' + l).join('\n')
    );
  }
  if (recentSummaries.length) {
    notebookSections.push(
      'RECENT CONVERSATIONS YOU HAD WITH ' + kidName.toUpperCase() + ' (use these to follow up naturally — do not list them, just remember them):\n' +
      recentSummaries.map(s => '- ' + (fmtSummaryDate(s.at) || '(recent)') + ': ' + s.summary).join('\n')
    );
  }
  const notebookBlock = notebookSections.length ? ('\n\n' + notebookSections.join('\n\n') + '\n') : '';
  // -----------------------------------------------------------------------

  // ---- Page-awareness block: what zone Nigel is on, what's on his screen --
  // Built only when we have something to share. The block is informational —
  // activeProblem rules below still take precedence for math problems.
  const screenLines = [];
  if (zoneLabel) screenLines.push(`Zone: ${zoneLabel}.`);
  else if (zoneId) screenLines.push(`Zone: ${zoneId}.`);
  if (pageTitle && pageTitle.toLowerCase() !== (zoneLabel || '').toLowerCase()) {
    screenLines.push(`Page: ${pageTitle}.`);
  }
  if (visibleText) screenLines.push(`Visible content on screen:\n"${visibleText}"`);
  const screenBlock = screenLines.length
    ? '\n\nWHAT IS ON ' + kidName.toUpperCase() + "'S SCREEN RIGHT NOW (use this to ground your answer — if he asks \"what is this?\" or \"read this to me\" or anything that depends on what he's looking at, refer to this content. Don't read it back verbatim unless he asked you to; explain it in your own words):\n" + screenLines.join('\n') + '\n'
    : '';
  // -----------------------------------------------------------------------

  const systemPrompt = [
    `You are Ms. Humphrey, a warm, patient elementary-school teacher speaking aloud to ${kidName}, a ${grade} student.`,
    `Your voice will be spoken via TTS, so answer in two or three short conversational sentences. No markdown, no lists, no parentheticals.`,
    `CRITICAL: never use filler phrases or thinking-aloud preambles. Forbidden openings include "let me think about that", "hmm, let me see", "good question", "that's a great question", "interesting question", "one moment", and any variation. Start your answer with the actual answer. Filler wastes TTS time and feels robotic.`,
    `You speak directly to the child using their name occasionally but not in every sentence.`,
    `You can carry a real conversation — if the child asks a follow-up, refer back to what you just said. If their reply is a one-word "yes" or "okay" or "mm-hmm", treat it as an invitation to elaborate or ask a small follow-up question of your own to keep them engaged.`,
    `When the conversation has naturally reached a stopping point, or when ${kidName} seems satisfied, you can wrap up. To signal that you are wrapping up, end your reply with a clear sign-off phrase like "Talk to you later, ${kidName}!" or "Goodbye for now!" or "See you next time!". The system uses those phrases to close the chat cleanly. Do not say a sign-off unless you actually mean to end the conversation.`,
    `If the question is about a school subject and you don't know the exact answer for sure, say honestly that you'd love to look it up together.`,
    `Never tell ${kidName} they are wrong or scold them. If they sound frustrated, validate the feeling first, then help.`,
    notebookBlock,
    screenBlock,
    `Use the notebook above to be warm and specific — when explaining math, reach for things he loves (Spider-Man swinging, Mario coins, soccer goals, building Legos). When he mentions family or friends, you already know who they are. Reference recent conversations naturally when relevant. Do NOT dump the notebook at him; let it inform your tone.`,
    activeProblem
      ? `IMPORTANT TUTORING RULE: ${kidName} is currently working on the math problem "${activeProblem}"${activeProblemAnswer ? ` (the answer is ${activeProblemAnswer})` : ''}. If their question is asking you to solve this exact problem or one that uses the same numbers, DO NOT give the answer. Instead, gently nudge them with a counting-on strategy, a real-world example, or a question that helps them figure it out. For any unrelated question, just answer normally.`
      : `There is no active math problem on screen right now, so feel free to answer general curiosity questions directly and warmly.`
  ].join(' ');

  // Final message list: [history..., { role: 'user', content: question }]
  const messages = [...history, { role: 'user', content: question }];

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 200,
        temperature: 0.6,
        system: systemPrompt,
        messages
      })
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error('[humphrey/chat] Anthropic upstream error:', upstream.status, text.slice(0, 500));
      return res.status(502).json({
        error: 'Claude upstream error',
        status: upstream.status,
        detail: text.slice(0, 500)
      });
    }
    const json = await upstream.json();
    const blocks = Array.isArray(json.content) ? json.content : [];
    const text = blocks
      .filter(b => b && b.type === 'text' && typeof b.text === 'string')
      .map(b => b.text)
      .join(' ')
      .replace(/[*_`#>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const safeAnswer = text || `Could you say that one more time, ${kidName}?`;
    return res.status(200).json({
      answer: safeAnswer,
      redirected: !!activeProblem,
      model: json.model || 'claude-haiku-4-5',
      stop_reason: json.stop_reason || null
    });
  } catch (err) {
    console.error('[humphrey/chat] handler error:', err);
    return res.status(500).json({ error: 'Internal error: ' + (err && err.message || err) });
  }
}
