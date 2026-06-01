/**
 * Hero Academy — Discovery Dome science cards
 *
 * 32 fact-cards aligned to Grade 2 NGSS + MD MCCRS science standards,
 * curated for Nigel's interests (Spider-Man, animals, space, weather).
 *
 * Card shape:
 *   { id, topic, emoji, title, fact, question, choices[4], answer, standard }
 *
 * 'topic' is one of: animals, weather, space, plants, physics
 * 'answer' is the index (0–3) into choices.
 * 'fact' is what Ms. Humphrey reads aloud. Keep under ~30 words.
 * 'question' is the comprehension prompt.
 *
 * Standards reference:
 *   NGSS 2-LS4 (biological diversity), 2-ESS1/2 (Earth's systems),
 *   2-PS1 (matter), K-2-ETS1 (engineering), MD MCCRS aligned.
 */
(function () {
  'use strict';
  var NS = (window.HeroAcademy = window.HeroAcademy || {});

  var CARDS = [
    // -------- ANIMALS (8) ----------------------------------------------------
    {
      id: 'spider-silk', topic: 'animals', emoji: '🕷️',
      title: 'Spider Webs',
      fact: "Spiders make their webs out of silk that comes from their own bodies. The silk starts as a liquid and turns hard in the air.",
      question: 'Where does spider silk start out?',
      choices: ['As a liquid inside the spider', 'As a solid leaf', 'From a tree', 'From a cloud'],
      answer: 0,
      standard: 'NGSS 2-LS4-1',
    },
    {
      id: 'hummingbird-wings', topic: 'animals', emoji: '🐦',
      title: 'Hummingbird Wings',
      fact: "Hummingbirds beat their wings about 50 times every second. That fast flapping is what makes the humming sound we hear.",
      question: 'Why do we call them hummingbirds?',
      choices: ['They sing songs all day', 'Their wings make a humming sound', 'They live on humming flowers', 'They only fly at night'],
      answer: 1,
      standard: 'NGSS 2-LS4-1',
    },
    {
      id: 'octopus-arms', topic: 'animals', emoji: '🐙',
      title: 'Octopus Arms',
      fact: "An octopus has eight arms, and each arm can move on its own. An octopus can even taste things with its arms.",
      question: 'How many arms does an octopus have?',
      choices: ['Four', 'Six', 'Eight', 'Ten'],
      answer: 2,
      standard: 'NGSS 2-LS4-1',
    },
    {
      id: 'shark-teeth', topic: 'animals', emoji: '🦈',
      title: 'Shark Teeth',
      fact: "Sharks grow new teeth all the time. A shark might use thousands of teeth in its whole life as old ones fall out.",
      question: 'What happens when a shark loses a tooth?',
      choices: ['It stops eating', 'A new tooth grows in', 'Another shark gives it one', 'Nothing ever grows back'],
      answer: 1,
      standard: 'NGSS 2-LS4-1',
    },
    {
      id: 'gecko-feet', topic: 'animals', emoji: '🦎',
      title: 'Gecko Feet',
      fact: "Geckos can walk on walls and even on ceilings. Their feet have millions of tiny hairs that stick to almost any surface.",
      question: 'How can a gecko walk on the ceiling?',
      choices: ['Magic powers', 'Glue on its feet', 'Tiny hairs on its feet', 'Wings on its back'],
      answer: 2,
      standard: 'NGSS 2-LS4-1',
    },
    {
      id: 'ant-strength', topic: 'animals', emoji: '🐜',
      title: 'Ants Are Strong',
      fact: "An ant can lift things that are 50 times heavier than itself. That would be like a person lifting a small car!",
      question: 'How much can an ant lift, compared to its own body?',
      choices: ['Just a grain of sand', '50 times its own weight', 'Nothing at all', 'Only other ants'],
      answer: 1,
      standard: 'NGSS 2-LS4-1',
    },
    {
      id: 'jellyfish-brain', topic: 'animals', emoji: '🪼',
      title: 'Jellyfish Have No Brain',
      fact: "Jellyfish do not have a brain or a heart. They drift in the ocean and sense the world through their whole body.",
      question: 'What does a jellyfish NOT have?',
      choices: ['A body', 'Tentacles', 'A brain', 'Water around it'],
      answer: 2,
      standard: 'NGSS 2-LS4-1',
    },
    {
      id: 'butterfly-metamorphosis', topic: 'animals', emoji: '🦋',
      title: 'Butterfly Change',
      fact: "Every butterfly was once a caterpillar. It builds a hard shell called a chrysalis, then comes out with wings.",
      question: 'What is a butterfly before it has wings?',
      choices: ['A bird', 'A caterpillar', 'A spider', 'An egg only'],
      answer: 1,
      standard: 'NGSS 3-LS1-1',
    },

    // -------- WEATHER (7) ----------------------------------------------------
    {
      id: 'cloud-water', topic: 'weather', emoji: '☁️',
      title: 'What Clouds Are Made Of',
      fact: "Clouds are made of tiny drops of water floating in the sky. When the drops join together and get too heavy, they fall as rain.",
      question: 'What are clouds made of?',
      choices: ['Cotton', 'Tiny drops of water', 'Smoke', 'Wool'],
      answer: 1,
      standard: 'NGSS 2-ESS2-3',
    },
    {
      id: 'lightning-sound', topic: 'weather', emoji: '⚡',
      title: 'Thunder and Lightning',
      fact: "Lightning is a flash of light, and thunder is the sound that flash makes. Light travels faster than sound, so we see the flash first.",
      question: 'Why do we see lightning before we hear thunder?',
      choices: ['Light travels faster than sound', 'Thunder is shy', 'Sound goes upward first', 'They never happen together'],
      answer: 0,
      standard: 'NGSS 4-PS4-3',
    },
    {
      id: 'snow-water', topic: 'weather', emoji: '❄️',
      title: 'How Snow Forms',
      fact: "Snow is frozen water from the clouds. When it is very cold up there, water drops freeze into tiny ice crystals.",
      question: 'Snow is really just frozen…',
      choices: ['Sugar', 'Dirt', 'Water', 'Sand'],
      answer: 2,
      standard: 'NGSS 2-ESS2-3',
    },
    {
      id: 'rainbow-colors', topic: 'weather', emoji: '🌈',
      title: 'Rainbows',
      fact: "A rainbow appears when sunlight shines through raindrops in the air. The light bends and splits into many colors.",
      question: 'What two things do you need to see a rainbow?',
      choices: ['Sun and rain', 'Wind and snow', 'Stars and clouds', 'Moon and dust'],
      answer: 0,
      standard: 'NGSS 1-PS4-3',
    },
    {
      id: 'wind-air', topic: 'weather', emoji: '🌬️',
      title: 'What Makes Wind',
      fact: "Wind is just air that is moving. Air moves because the sun warms some parts of the Earth more than other parts.",
      question: 'What is wind?',
      choices: ['Empty space', 'Air that is moving', 'Cold water', 'Sunshine'],
      answer: 1,
      standard: 'NGSS K-ESS2-1',
    },
    {
      id: 'hurricane-ocean', topic: 'weather', emoji: '🌀',
      title: 'Big Storms',
      fact: "Hurricanes are huge storms that form over warm oceans. They have very strong winds and bring lots of rain.",
      question: 'Where do hurricanes form?',
      choices: ['In the desert', 'Over warm oceans', 'On mountains', 'In the snow'],
      answer: 1,
      standard: 'NGSS 3-ESS2-2',
    },
    {
      id: 'seasons-tilt', topic: 'weather', emoji: '🍂',
      title: 'Why Seasons Change',
      fact: "Earth is tilted a little as it travels around the sun. When our part of Earth tilts toward the sun it is summer. When it tilts away it is winter.",
      question: 'Why is it summer in some months and winter in others?',
      choices: ['The sun gets bigger', 'Earth tilts toward or away from the sun', 'Clouds block the sun', 'Days get longer for no reason'],
      answer: 1,
      standard: 'NGSS 5-ESS1-2',
    },

    // -------- SPACE (7) ------------------------------------------------------
    {
      id: 'sun-is-star', topic: 'space', emoji: '☀️',
      title: 'The Sun is a Star',
      fact: "The sun is a star, just like the ones we see at night. It looks bigger and brighter because it is much closer to us.",
      question: 'What is the sun?',
      choices: ['A planet', 'A star', 'A moon', 'A cloud'],
      answer: 1,
      standard: 'NGSS 5-ESS1-1',
    },
    {
      id: 'moon-light', topic: 'space', emoji: '🌙',
      title: 'Why the Moon Shines',
      fact: "The moon does not make its own light. It shines because sunlight bounces off of it, like light bouncing off a mirror.",
      question: 'Where does the moon get its light from?',
      choices: ['From the moon itself', 'From the sun', 'From the stars', 'From the ocean'],
      answer: 1,
      standard: 'NGSS 1-ESS1-1',
    },
    {
      id: 'eight-planets', topic: 'space', emoji: '🪐',
      title: 'Eight Planets',
      fact: "There are eight planets that travel around our sun. Earth is the third planet from the sun.",
      question: 'How many planets are in our solar system?',
      choices: ['Five', 'Eight', 'Twelve', 'One hundred'],
      answer: 1,
      standard: 'NGSS 5-ESS1-1',
    },
    {
      id: 'stars-twinkle', topic: 'space', emoji: '✨',
      title: 'Why Stars Twinkle',
      fact: "Stars twinkle because their light passes through the moving air around Earth. The air bends the light a tiny bit each time it moves.",
      question: 'Why do stars seem to twinkle?',
      choices: ['They turn on and off', 'Air around Earth bends their light', 'They are dancing', 'They are tiny clouds'],
      answer: 1,
      standard: 'NGSS 1-ESS1-1',
    },
    {
      id: 'gravity-pull', topic: 'space', emoji: '🌍',
      title: 'Gravity',
      fact: "Gravity is the pull that keeps everything on Earth from floating away. It is why a ball comes back down after you throw it up.",
      question: 'What does gravity do?',
      choices: ['Makes things float up', 'Pulls things down toward Earth', 'Makes wind blow', 'Makes lightning flash'],
      answer: 1,
      standard: 'NGSS 5-PS2-1',
    },
    {
      id: 'astronaut-air', topic: 'space', emoji: '👨‍🚀',
      title: 'Astronauts in Space',
      fact: "Astronauts wear special suits to stay safe in space. There is no air to breathe up there, so they carry their own air with them.",
      question: 'Why do astronauts wear special suits?',
      choices: ['To look cool for photos', 'There is no air in space to breathe', 'Because space is always cold', 'To match each other'],
      answer: 1,
      standard: 'NGSS 3-5-ETS1-1',
    },
    {
      id: 'day-night-spin', topic: 'space', emoji: '🌗',
      title: 'Day and Night',
      fact: "Earth spins like a top. The side facing the sun has day, and the other side has night. Earth makes one full spin every day.",
      question: 'Why do we have day and night?',
      choices: ['The sun moves around Earth', 'Earth spins so different sides face the sun', 'Clouds cover the sun at night', 'The sun goes to sleep'],
      answer: 1,
      standard: 'NGSS 1-ESS1-1',
    },

    // -------- PLANTS (5) -----------------------------------------------------
    {
      id: 'seed-needs', topic: 'plants', emoji: '🌱',
      title: 'How Seeds Grow',
      fact: "A seed needs water, light, and warm soil to grow. Inside every seed is a tiny baby plant waiting to come out.",
      question: 'What does a seed need to grow?',
      choices: ['Just sunlight', 'Water, light, and warm soil', 'Only water', 'Nothing at all'],
      answer: 1,
      standard: 'NGSS 2-LS2-1',
    },
    {
      id: 'photosynthesis', topic: 'plants', emoji: '🌿',
      title: 'Plant Food from Sunlight',
      fact: "Plants make their own food using sunlight, water, and air. Their green leaves are the part that catches the sunlight.",
      question: 'How do plants make their food?',
      choices: ['They eat bugs', 'They use sunlight, water, and air', 'Someone feeds them every day', 'They do not need food'],
      answer: 1,
      standard: 'NGSS 5-LS1-1',
    },
    {
      id: 'roots-jobs', topic: 'plants', emoji: '🌾',
      title: 'Why Plants Have Roots',
      fact: "Roots hold a plant in place so it does not fall over. They also drink water from the soil and send it up to the leaves.",
      question: 'What are two jobs of roots?',
      choices: ['Catch sunlight and make seeds', 'Hold the plant and drink water', 'Make flowers smell good', 'Keep bugs away'],
      answer: 1,
      standard: 'NGSS 4-LS1-1',
    },
    {
      id: 'trees-oxygen', topic: 'plants', emoji: '🌳',
      title: 'Trees Help Us Breathe',
      fact: "Trees take in air that we do not need, and they give back air that we do need to breathe. Trees help every animal stay alive.",
      question: 'What do trees give back to the air?',
      choices: ['Air we need to breathe', 'Smoke', 'Water only', 'Dust'],
      answer: 0,
      standard: 'NGSS 5-LS1-1',
    },
    {
      id: 'bees-flowers', topic: 'plants', emoji: '🌻',
      title: 'Bees and Flowers',
      fact: "Flowers are bright and smell sweet to attract bees. The bees help the flowers make more seeds so that even more flowers can grow.",
      question: 'Why do flowers smell sweet?',
      choices: ['To smell nice for people', 'To attract bees', 'By accident', 'Because of the sun'],
      answer: 1,
      standard: 'NGSS 2-LS2-2',
    },

    // -------- PHYSICS (5) ----------------------------------------------------
    {
      id: 'push-pull', topic: 'physics', emoji: '🛒',
      title: 'Push and Pull',
      fact: "Every time you move something, you either push it or pull it. Pushing a door open and pulling a wagon are both ways to move things.",
      question: 'What two things can you do to move an object?',
      choices: ['Look at it and yell at it', 'Push it and pull it', 'Sing to it', 'Wait for it'],
      answer: 1,
      standard: 'NGSS K-PS2-1',
    },
    {
      id: 'magnets-metal', topic: 'physics', emoji: '🧲',
      title: 'Magnets Stick',
      fact: "Magnets pull on certain metals, like iron and steel. They do not pull on plastic, paper, or wood.",
      question: 'Which of these will a magnet stick to?',
      choices: ['A plastic spoon', 'A paper towel', 'An iron nail', 'A wooden block'],
      answer: 2,
      standard: 'NGSS 3-PS2-3',
    },
    {
      id: 'friction-shoes', topic: 'physics', emoji: '👟',
      title: 'Why You Do Not Slip',
      fact: "When two things rub together, they slow each other down. That is called friction. It is why your shoes do not slip on the floor.",
      question: 'What slows things down when they rub together?',
      choices: ['Gravity', 'Friction', 'Wind', 'Heat'],
      answer: 1,
      standard: 'NGSS 3-PS2-1',
    },
    {
      id: 'balance-ears', topic: 'physics', emoji: '🧍',
      title: 'Standing on One Foot',
      fact: "Your body uses tiny parts inside your ears to help you keep your balance. That is why it is harder to stand on one foot with your eyes closed.",
      question: 'What part of your body helps you balance?',
      choices: ['Your toes', 'Tiny parts inside your ears', 'Your hair', 'Your stomach'],
      answer: 1,
      standard: 'NGSS 4-LS1-2',
    },
    {
      id: 'sound-vibration', topic: 'physics', emoji: '🥁',
      title: 'Where Sound Comes From',
      fact: "Sound is made when things shake quickly. When you talk, parts of your throat shake. When a drum is hit, the drum itself shakes.",
      question: 'What makes sound?',
      choices: ['Light', 'Things shaking quickly', 'Color', 'Time'],
      answer: 1,
      standard: 'NGSS 1-PS4-1',
    },
  ];

  var TOPICS = {
    animals: { label: 'Animals',         emoji: '🦋' },
    weather: { label: 'Weather',         emoji: '🌦️' },
    space:   { label: 'Space',           emoji: '🚀' },
    plants:  { label: 'Plants',          emoji: '🌳' },
    physics: { label: 'How Things Work', emoji: '⚛️' },
  };

  function byId(id) {
    for (var i = 0; i < CARDS.length; i++) if (CARDS[i].id === id) return CARDS[i];
    return null;
  }

  function byTopic(topic) {
    return CARDS.filter(function (c) { return c.topic === topic; });
  }

  NS.ScienceCards = {
    all: function () { return CARDS.slice(); },
    byId: byId,
    byTopic: byTopic,
    topics: TOPICS,
    count: CARDS.length,
  };
})();
