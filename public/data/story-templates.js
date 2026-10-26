/**
 * Hero Academy — Story Lab templates
 *
 * 10 MadLibs-style narrative templates aligned to CCSS W.2.3 (narrative
 * writing). Each template has a title, an emoji, and a sequence of slots.
 * Slots are 4–5 per template to keep sessions short for a 7-year-old.
 *
 * Slot shape: { key, kind, prompt }
 *   kind matches a category in data/grade2-vocab.js — the picker filters
 *   the word bank to just that category when the slot is active.
 *
 * Template text uses {slotKey} placeholders that the controller substitutes
 * after the kid picks all the slots. The output is a complete 3–5 sentence
 * story Ms. Humphrey reads aloud dramatically.
 */
(function () {
  'use strict';
  var NS = (window.HeroAcademy = window.HeroAcademy || {});

  var TEMPLATES = [
    {
      id: 'spiderman-saturday', emoji: '🕷️', title: "Spider-Man's Big Saturday",
      slots: [
        { key: 'place',    kind: 'place',     prompt: 'Where did Spider-Man swing to?' },
        { key: 'feeling',  kind: 'feeling',   prompt: 'How did he feel when he got there?' },
        { key: 'animal',   kind: 'animal',    prompt: 'What animal did he find?' },
        { key: 'action',   kind: 'action',    prompt: 'What did Spider-Man do?' },
        { key: 'food',     kind: 'food',      prompt: 'What snack did he eat after?' },
      ],
      text: "One Saturday, Spider-Man swung all the way to {place}. He felt very {feeling}. Suddenly a {animal} jumped out from behind a tree! Spider-Man decided to {action}. When the adventure was over, he ate a big plate of {food} and went home happy.",
    },
    {
      id: 'mario-mushroom', emoji: '🍄', title: "Mario's Magical Mushroom",
      slots: [
        { key: 'look',    kind: 'look',    prompt: 'What did the forest look like?' },
        { key: 'object',  kind: 'object',  prompt: 'What did Mario find on the ground?' },
        { key: 'animal',  kind: 'animal',  prompt: 'What did he turn into?' },
        { key: 'action',  kind: 'action',  prompt: 'What did he start doing?' },
        { key: 'food',    kind: 'food',    prompt: 'What did he want to eat?' },
      ],
      text: "Mario was walking through a {look} forest when he found a glowing {object}. He picked it up and POOF! He turned into a giant {animal}! Mario started to {action} all the way to the castle. By the end of the day, all he wanted was some {food}.",
    },
    {
      id: 'park-day', emoji: '🌳', title: 'A Day at the Park',
      slots: [
        { key: 'person',  kind: 'person',  prompt: 'Who went with you?' },
        { key: 'size',    kind: 'size',    prompt: 'How big was the animal?' },
        { key: 'animal',  kind: 'animal',  prompt: 'What animal did you see?' },
        { key: 'action',  kind: 'action',  prompt: 'What did you try to do?' },
        { key: 'food',    kind: 'food',    prompt: 'What did you eat at the end?' },
      ],
      text: "Today I went to the park with {person}. We saw a really {size} {animal} running around the swings. I tried to {action} after it but I tripped over my own feet! By the end of the day, we sat in the grass and ate {food}.",
    },
    {
      id: 'lost-dog', emoji: '🐶', title: 'The Lost Dog',
      slots: [
        { key: 'place',    kind: 'place',     prompt: 'Where did Biscuit get lost?' },
        { key: 'feeling',  kind: 'feeling',   prompt: 'How did Biscuit feel?' },
        { key: 'person',   kind: 'person',    prompt: 'Who found him?' },
        { key: 'food',     kind: 'food',      prompt: 'What did they give him?' },
        { key: 'action',   kind: 'action',    prompt: 'What did Biscuit do next?' },
      ],
      text: "There was a fluffy dog named Biscuit who got lost in {place}. He felt very {feeling} and started to whimper. Just then, a kind {person} found him and gave him some {food}. Biscuit was so happy he started to {action} all the way home!",
    },
    {
      id: 'grandma-cookout', emoji: '🍲', title: "Grandma's Big Cookout",
      slots: [
        { key: 'food',     kind: 'food',     prompt: 'What was Grandma cooking?' },
        { key: 'object',   kind: 'object',   prompt: 'What did she find in the garden?' },
        { key: 'feeling',  kind: 'feeling',  prompt: 'How did everyone feel after dinner?' },
        { key: 'action',   kind: 'action',   prompt: 'What did you do in the backyard?' },
      ],
      text: "Grandma was making her famous {food} for the whole family. She walked outside and found a tiny {object} hiding in the garden. After dinner everyone felt {feeling} and patted their bellies. Then my cousin and I ran into the backyard to {action} until the sun went down.",
    },
    {
      id: 'pizza-robot', emoji: '🤖', title: 'The Robot Who Loved Pizza',
      slots: [
        { key: 'food',     kind: 'food',     prompt: 'What did Beep love to eat?' },
        { key: 'action',   kind: 'action',   prompt: 'How did Beep get to the shop?' },
        { key: 'feeling',  kind: 'feeling',  prompt: 'How did Beep feel when his arm broke?' },
        { key: 'person',   kind: 'person',   prompt: 'Who came to help?' },
      ],
      text: "There was once a shiny robot named Beep who loved {food} more than anything. Every single day Beep would {action} all the way to the pizza shop. One sad day, his metal arm broke and he felt very {feeling}. Luckily, a clever {person} came along and fixed him good as new.",
    },
    {
      id: 'space-adventure', emoji: '🚀', title: 'Adventure in Outer Space',
      slots: [
        { key: 'look',     kind: 'look',     prompt: 'What did the planet look like?' },
        { key: 'animal',   kind: 'animal',   prompt: 'What strange creature did he see?' },
        { key: 'object',   kind: 'object',   prompt: 'What was it as big as?' },
        { key: 'food',     kind: 'food',     prompt: 'What did the alien offer?' },
        { key: 'action',   kind: 'action',   prompt: 'How did Captain Astro get home?' },
      ],
      text: "Captain Astro flew his rocket ship to a {look} planet far away from Earth. There he saw a strange {animal} that was as big as a {object}! The friendly alien offered him some space {food} to try. After their tea party, Captain Astro decided to {action} all the way back home.",
    },
    {
      id: 'dragon-knight', emoji: '🐉', title: 'The Dragon and the Knight',
      slots: [
        { key: 'look',     kind: 'look',     prompt: 'What did the cave look like inside?' },
        { key: 'size',     kind: 'size',     prompt: 'How big was the dragon?' },
        { key: 'action',   kind: 'action',   prompt: 'What did the dragon want to do?' },
        { key: 'food',     kind: 'food',     prompt: 'What did the dragon serve?' },
      ],
      text: "Sir Lance the brave knight rode his horse into a {look} cave deep in the mountain. Inside he met a {size} dragon who, surprisingly, just wanted to {action}. The dragon offered him a plate of dragon-roasted {food}. From that day on, Sir Lance and the dragon were best friends forever.",
    },
    {
      id: 'birthday', emoji: '🎂', title: 'My Best Birthday Ever',
      slots: [
        { key: 'size',     kind: 'size',     prompt: 'What kind of present did you want?' },
        { key: 'object',   kind: 'object',   prompt: 'What was the present?' },
        { key: 'food',     kind: 'food',     prompt: 'What shape was the cake?' },
        { key: 'action',   kind: 'action',   prompt: 'What did everyone do at the party?' },
        { key: 'feeling',  kind: 'feeling',  prompt: 'How did you feel when they sang?' },
      ],
      text: "For my birthday this year I asked for a {size} {object}. Mom baked me a giant {food}-shaped birthday cake. All my friends came over and we ran around the yard playing tag and trying to {action}. When everyone sang Happy Birthday to me, I felt so {feeling} I could have cried.",
    },
    {
      id: 'mystery-door', emoji: '🚪', title: 'The Mysterious Door',
      slots: [
        { key: 'look',     kind: 'look',     prompt: 'What did the door look like?' },
        { key: 'animal',   kind: 'animal',   prompt: 'What was on the other side?' },
        { key: 'food',     kind: 'food',     prompt: 'What was it eating?' },
        { key: 'action',   kind: 'action',   prompt: 'What did it ask you to do?' },
        { key: 'feeling',  kind: 'feeling',  prompt: 'How did you feel?' },
      ],
      text: "One rainy afternoon, I found a {look} door hidden behind my bookshelf. When I pushed it open, I saw a {animal} sitting at a tiny table, calmly eating {food}. The animal looked up at me and asked if I wanted to {action} together. I felt very {feeling} but I said yes, and we had the best afternoon ever.",
    },
  ];

  function byId(id) {
    for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].id === id) return TEMPLATES[i];
    return null;
  }

  NS.StoryTemplates = {
    all: function () { return TEMPLATES.slice(); },
    byId: byId,
    count: TEMPLATES.length,
  };
})();
