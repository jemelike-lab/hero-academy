/**
 * Hero Academy — Story Time passage generator.
 *
 * Claude Haiku writes a tiny 3-sentence decodable passage personalized to
 * Nigel using his profile (Spider-Man, Mario, soccer, cousin Skylar, jollof
 * rice, etc.) while targeting a specific phonics pattern he's learning.
 * Also includes one comprehension question + expected answer hint.
 *
 * Request:  POST application/json
 *   { profile?: object,          // Nigel profile (loves, family, foods, etc.)
 *     pattern?: string,          // 'digraphs' (default), 'CVC', 'CVCe', ...
 *     targetWords?: string[],    // optional word list to encourage in passage
 *     kidName?: string,          // default 'Nigel'
 *     excludeTopics?: string[]   // recent passage topics to avoid repeating
 *   }
 *
 * Response: { title, sentences: [s1, s2, s3], comprehensionQuestion, expectedAnswerHint, model, latency_ms }
 */
export default async function handler(req, res) {
  const t0 = Date.now();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  if (!body || typeof body !== 'object') body = {};

  const profile = (body.profile && typeof body.profile === 'object') ? body.profile : null;
  const pattern = String(body.pattern || 'digraphs').trim();
  const kidName = String(body.kidName || 'Nigel').trim() || 'Nigel';
  const targetWords = Array.isArray(body.targetWords)
    ? body.targetWords.filter(w => typeof w === 'string').slice(0, 30)
    : [];
  const excludeTopics = Array.isArray(body.excludeTopics)
    ? body.excludeTopics.filter(t => typeof t === 'string').slice(0, 10)
    : [];

  // Build child-context summary from profile (compact)
  const profileLines = [];
  if (profile) {
    if (Array.isArray(profile.loves) && profile.loves.length)
      profileLines.push(`Loves: ${profile.loves.join(', ')}.`);
    if (Array.isArray(profile.hobbies) && profile.hobbies.length)
      profileLines.push(`Hobbies: ${profile.hobbies.join('; ')}.`);
    if (Array.isArray(profile.heritage_food) && profile.heritage_food.length)
      profileLines.push(`Favorite foods: ${profile.heritage_food.join(', ')}.`);
    if (profile.family) {
      const f = profile.family;
      const fam = [];
      if (f.mother) fam.push(`mom ${f.mother}`);
      if (f.father) fam.push(`dad ${f.father}`);
      if (Array.isArray(f.cousins) && f.cousins.length) fam.push(`cousins ${f.cousins.join(' and ')}`);
      if (f.best_friend) fam.push(`best friend ${f.best_friend}`);
      if (fam.length) profileLines.push(`Family: ${fam.join('; ')}.`);
    }
    if (Array.isArray(profile.recent_milestones) && profile.recent_milestones.length)
      profileLines.push(`Recent: ${profile.recent_milestones[0]}`);
  }

  const phonicsBlurb = pattern === 'digraphs'
    ? "The phonics target is consonant digraphs (sh, ch, th, wh). Try to include at least 2-3 words containing these patterns. Examples: ship, fish, lunch, chat, that, with, when, what."
    : `The phonics target is "${pattern}".`;

  const targetWordsBlurb = targetWords.length
    ? `If natural, weave in some of these target words: ${targetWords.join(', ')}.`
    : '';

  const avoidBlurb = excludeTopics.length
    ? `Avoid these recent topics so the story feels fresh: ${excludeTopics.join('; ')}.`
    : '';

  const systemPrompt = [
    `You write tiny decodable reading passages for ${kidName}, a 7-year-old 2nd-grade reader. Your output is ONLY consumed by software — return JSON only, no preamble.`,
    `Write exactly 3 sentences. Each sentence: 4 to 8 words. Each sentence is a complete thought. Together the 3 sentences form a tiny coherent story.`,
    `Vocabulary: simple, 2nd-grade level. Concrete nouns, common verbs. AVOID hard or uncommon words. AVOID hyphens or contractions that confuse a young reader (no "don't", use "do not"; no "I'm", use "I am"). NO em-dashes or semicolons.`,
    phonicsBlurb,
    targetWordsBlurb,
    `Personalize warmly: use ${kidName}'s interests from the context below. ${kidName} can be the protagonist if it fits.`,
    avoidBlurb,
    `Then write ONE comprehension question about the passage. Keep it concrete ("Who...", "What...", "Where..."), one-sentence, answerable from the passage in 1-3 words.`,
    `Provide expectedAnswerHint as the short ideal answer (one to three words).`,
    `Also provide a short title (2-4 words).`,
    // v174b: ALSO produce 3 MC questions about the passage. These drive
    // the new tap-to-answer comprehension flow that replaces the
    // listen-to-Nigel-read-aloud assessment. Mix of comprehension +
    // vocabulary + inference. Each question gets 3-4 short options, one
    // marked correct, with a one-sentence explanation.
    `Also write THREE multiple-choice questions about the passage:`,
    `  Q1: literal comprehension ("Who...", "What...", "Where..."), answer is in the passage`,
    `  Q2: vocabulary in context ("In the story, X means..." or "Which word means..."), tests one age-appropriate word from the passage`,
    `  Q3: inference or sequencing ("How does X probably feel?", "What happened first?")`,
    `Each MC question has 3-4 options (each ≤ 24 characters), one correct_index (0-based), and a one-sentence explanation (≤ 120 chars).`,
    `Return ONLY this JSON shape and nothing else:`,
    `{"title": <string>, "sentences": [<s1>, <s2>, <s3>], "comprehensionQuestion": <string>, "expectedAnswerHint": <string>, "mcQuestions": [{"q": <string>, "kind": "comp"|"vocab"|"infer", "options": [<string>], "correct_index": <int>, "explanation": <string>}, {"q": ..., ...}, {"q": ..., ...}]}`,
    `Context about ${kidName}: ${profileLines.length ? profileLines.join(' ') : 'No profile available.'}`
  ].filter(Boolean).join(' ');

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
        max_tokens: 900,  // v174b: bigger — also returning 3 MC questions
        temperature: 0.85,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Write a passage now for ${kidName}.` }]
      })
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error('[humphrey/generate-passage] upstream error:', upstream.status, text.slice(0, 500));
      return res.status(502).json({ error: 'Claude upstream error', detail: text.slice(0, 500) });
    }

    const json = await upstream.json();
    const blocks = Array.isArray(json.content) ? json.content : [];
    const raw = blocks
      .filter(b => b && b.type === 'text' && typeof b.text === 'string')
      .map(b => b.text).join(' ').trim();

    // Parse JSON object from Claude output
    let parsed = null;
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch (_) { parsed = null; } }

    if (!parsed || !Array.isArray(parsed.sentences) || parsed.sentences.length < 1) {
      console.error('[humphrey/generate-passage] parse fail. raw=', raw.slice(0, 400));
      // Fallback canned passage so the kid is never stuck
      return res.status(200).json({
        title: 'The Wish',
        sentences: [
          'Nigel had a big wish.',
          'He went to find his cousin Skylar.',
          'They sat and ate lunch with much fun.'
        ],
        comprehensionQuestion: 'Who did Nigel go to find?',
        expectedAnswerHint: 'Skylar',
        model: 'fallback',
        latency_ms: Date.now() - t0
      });
    }

    // Sanitize: strip punctuation that breaks TTS or assessment matching
    const sanitize = s => String(s || '')
      .replace(/[*_`#>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const sentences = parsed.sentences.map(sanitize).filter(Boolean).slice(0, 5);

    // v174b: sanitize + validate MC questions. Drop any that fail the schema.
    // Falls back to a generic comprehension MC built from comprehensionQuestion
    // + expectedAnswerHint if Haiku produced nothing usable.
    function validateMC(q) {
      if (!q || typeof q !== 'object') return null;
      const qText = sanitize(q.q);
      if (!qText) return null;
      if (!Array.isArray(q.options)) return null;
      const options = q.options
        .map(o => sanitize(o))
        .filter(s => s && s.length <= 30)
        .slice(0, 4);
      if (options.length < 3) return null;
      const ci = parseInt(q.correct_index, 10);
      if (!Number.isInteger(ci) || ci < 0 || ci >= options.length) return null;
      const kind = ['comp','vocab','infer'].includes(q.kind) ? q.kind : 'comp';
      const explanation = sanitize(q.explanation).slice(0, 200) || '';
      return { q: qText, kind, options, correct_index: ci, explanation };
    }
    let mcQuestions = Array.isArray(parsed.mcQuestions)
      ? parsed.mcQuestions.map(validateMC).filter(Boolean).slice(0, 4)
      : [];
    // If nothing valid, build ONE fallback MC from the open-ended comp question.
    if (mcQuestions.length === 0) {
      const hint = sanitize(parsed.expectedAnswerHint) || sentences[0].split(' ')[0];
      mcQuestions = [{
        q: sanitize(parsed.comprehensionQuestion) || `What was the story mainly about, ${kidName}?`,
        kind: 'comp',
        options: [hint, 'a dragon', 'the moon', 'nothing'].slice(0, 4),
        correct_index: 0,
        explanation: `${hint} is mentioned in the passage.`,
      }];
    }

    return res.status(200).json({
      title: sanitize(parsed.title) || 'Story Time',
      sentences: sentences,
      comprehensionQuestion: sanitize(parsed.comprehensionQuestion) || `What was the story about, ${kidName}?`,
      expectedAnswerHint: sanitize(parsed.expectedAnswerHint) || '',
      mcQuestions: mcQuestions,  // v174b
      model: json.model || 'claude-haiku-4-5',
      latency_ms: Date.now() - t0
    });
  } catch (err) {
    console.error('[humphrey/generate-passage] handler error:', err);
    return res.status(500).json({ error: 'Internal error: ' + (err && err.message || err) });
  }
}
