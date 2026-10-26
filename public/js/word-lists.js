/**
 * Hero Academy — phonics word lists for the Word Tower read-aloud.
 *
 * Each level is a phonics pattern. Words are short, decodable, and tagged
 * with MD MCCRS standards. Add levels by extending the LEVELS object.
 *
 * Public API on window.HeroAcademy.WordLists:
 *   getLevels()                  -> array of level descriptors
 *   getLevel(id)                 -> { id, name, mccrs, ccss, words[] }
 *   getDefaultLevelId()          -> the level we start Nigel on
 */
(function () {
  'use strict';
  var NS = window.HeroAcademy = window.HeroAcademy || {};

  var LEVELS = {
    /* Consonant digraphs — where Nigel currently is in his curriculum.
       sh-, ch-, th-, wh- patterns at the start AND end of words. */
    digraphs: {
      id: 'digraphs',
      name: 'Consonant Digraphs',
      description: 'sh, ch, th, wh sounds',
      mccrs: '2.RF.3.b',
      ccss: 'CCSS.ELA-LITERACY.RF.2.3.B',
      words: [
        // sh- at start
        { word: 'ship',  pattern: 'sh-',  hint: 'Listen for the sh sound at the start.' },
        { word: 'shop',  pattern: 'sh-',  hint: 'sh- at the beginning.' },
        { word: 'shut',  pattern: 'sh-',  hint: 'sh- at the beginning.' },
        { word: 'shed',  pattern: 'sh-',  hint: 'sh- at the beginning.' },
        // -sh at end
        { word: 'fish',  pattern: '-sh',  hint: 'sh at the end, like saying shhh.' },
        { word: 'dish',  pattern: '-sh',  hint: '-sh at the end.' },
        { word: 'wish',  pattern: '-sh',  hint: '-sh at the end.' },
        { word: 'wash',  pattern: '-sh',  hint: '-sh at the end.' },
        { word: 'cash',  pattern: '-sh',  hint: '-sh at the end.' },
        { word: 'rush',  pattern: '-sh',  hint: '-sh at the end.' },
        // ch- at start
        { word: 'chip',  pattern: 'ch-',  hint: 'ch- at the beginning, like cheese.' },
        { word: 'chop',  pattern: 'ch-',  hint: 'ch- at the beginning.' },
        { word: 'chin',  pattern: 'ch-',  hint: 'ch- at the beginning.' },
        { word: 'chat',  pattern: 'ch-',  hint: 'ch- at the beginning.' },
        // -ch at end
        { word: 'much',  pattern: '-ch',  hint: '-ch at the end.' },
        { word: 'rich',  pattern: '-ch',  hint: '-ch at the end.' },
        { word: 'lunch', pattern: '-ch',  hint: 'Listen for the -nch at the end.' },
        { word: 'bunch', pattern: '-ch',  hint: '-nch at the end.' },
        { word: 'pinch', pattern: '-ch',  hint: '-nch at the end.' },
        { word: 'beach', pattern: '-ch',  hint: '-ch at the end.' },
        // th- at start
        { word: 'that',  pattern: 'th-',  hint: 'th- at the beginning.' },
        { word: 'them',  pattern: 'th-',  hint: 'th- at the beginning.' },
        { word: 'this',  pattern: 'th-',  hint: 'th- at the beginning.' },
        { word: 'then',  pattern: 'th-',  hint: 'th- at the beginning.' },
        // -th at end
        { word: 'with',  pattern: '-th',  hint: '-th at the end.' },
        { word: 'math',  pattern: '-th',  hint: '-th at the end.' },
        { word: 'bath',  pattern: '-th',  hint: '-th at the end.' },
        { word: 'path',  pattern: '-th',  hint: '-th at the end.' },
        { word: 'moth',  pattern: '-th',  hint: '-th at the end.' },
        { word: 'both',  pattern: '-th',  hint: '-th at the end.' },
        // wh- at start
        { word: 'when',  pattern: 'wh-',  hint: 'wh- at the beginning.' },
        { word: 'what',  pattern: 'wh-',  hint: 'wh- at the beginning.' },
        { word: 'whale', pattern: 'wh-',  hint: 'wh- at the beginning.' }
      ]
    }
  };

  function getLevels() {
    return Object.keys(LEVELS).map(function (id) {
      var L = LEVELS[id];
      return { id: id, name: L.name, description: L.description, mccrs: L.mccrs, ccss: L.ccss, wordCount: L.words.length };
    });
  }

  function getLevel(id) {
    var L = LEVELS[id];
    if (!L) return null;
    return JSON.parse(JSON.stringify(L)); // defensive deep copy
  }

  function getDefaultLevelId() {
    return 'digraphs';
  }

  NS.WordLists = {
    getLevels: getLevels,
    getLevel: getLevel,
    getDefaultLevelId: getDefaultLevelId
  };
})();
