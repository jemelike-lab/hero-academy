/**
 * Hero Academy — Grade 2 vocabulary bank for Story Lab
 *
 * Words are categorized by the "kind" they fill in template slots
 * (matches data/story-templates.js). Each entry is just the word as it
 * should appear in the story — so "the playground" or "Brooklyn" not
 * just "playground" or "brooklyn". The picker shows these as-is.
 *
 * Pedagogy: ~100 grade-2-friendly words, mix of common everyday vocabulary
 * plus a few culturally relevant items (jollof rice, plantain chips, etc.)
 * tied to Nigel's profile. Words chosen for variety and to produce stories
 * that read naturally even with random combinations.
 */
(function () {
  'use strict';
  var NS = (window.HeroAcademy = window.HeroAcademy || {});

  var VOCAB = {
    place: [
      'the playground', 'the moon', 'the kitchen', 'the beach',
      'the library', 'the basement', 'a treehouse', 'a museum',
      'Brooklyn', 'school', 'a candy shop', 'the rainforest',
    ],
    animal: [
      'turtle', 'dragon', 'hamster', 'lion', 'octopus', 'penguin',
      'gecko', 'hummingbird', 'spider', 'fox', 'dinosaur', 'unicorn',
    ],
    food: [
      'jollof rice', 'pizza', 'ice cream', 'cookies', 'banana',
      'a sandwich', 'watermelon', 'pancakes', 'a taco', 'mango',
      'plantain chips', 'gummy bears',
    ],
    object: [
      'backpack', 'telescope', 'flashlight', 'basketball', 'kite',
      'robot', 'key', 'drum', 'rocket', 'magnet',
      'Lego brick', 'paintbrush',
    ],
    person: [
      'my cousin', 'my best friend', 'a wizard', 'a chef',
      'a teacher', 'an astronaut', 'a firefighter', 'a kind stranger',
    ],
    action: [
      'run', 'jump', 'dance', 'sing', 'laugh',
      'climb', 'build a fort', 'paint', 'swim', 'sneak',
      'hop on one foot', 'gallop', 'tiptoe', 'sprint', 'wiggle',
    ],
    feeling: [
      'happy', 'sleepy', 'brave', 'surprised', 'proud',
      'calm', 'excited', 'silly', 'curious', 'peaceful',
    ],
    size: [
      'giant', 'tiny', 'sparkly', 'soft', 'wobbly',
      'sticky', 'fluffy', 'shiny',
    ],
    look: [
      'purple', 'glowing', 'mysterious', 'fuzzy', 'slimy',
      'fancy', 'dusty', 'crooked', 'smooth', 'polka-dotted',
    ],
  };

  // Friendly category labels shown in the slot prompt UI.
  var KIND_LABELS = {
    place:   'a place',
    animal:  'an animal',
    food:    'a food',
    object:  'a thing',
    person:  'a person',
    action:  'an action',
    feeling: 'a feeling',
    size:    'a size or texture',
    look:    'a way it looks',
  };

  function get(kind) { return (VOCAB[kind] || []).slice(); }
  function kindLabel(kind) { return KIND_LABELS[kind] || kind; }

  NS.Vocab = {
    get: get,
    kindLabel: kindLabel,
    kinds: Object.keys(VOCAB),
    totalWords: Object.keys(VOCAB).reduce(function (n, k) { return n + VOCAB[k].length; }, 0),
  };
})();
