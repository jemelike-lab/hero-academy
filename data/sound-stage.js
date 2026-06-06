// ============================================================================
// Hero Academy — Sound Stage data  (v110, Jun 6 2026)
// Songs (Piano Lab) + Curated music videos (Music Video Theater)
//
// VIDEO LIBRARY POLICY
// ---------------------
// All videos vetted Jun 6 2026 from official PBS Kids and Sesame Workshop
// YouTube channels. Each is either a real video (youtubeId) or an OFFICIAL
// curated playlist (playlistId). When in doubt, prefer playlists from
// channels Josh trusts (PBS Kids, Sesame Street) — those self-curate.
//
// To add more videos: copy a block, paste a new id from a vetted channel,
// fill in title/description/postQuestion. The hub picks them up on reload.
//
// FUTURE: monthly auto-curation
// ------------------------------
// A Vercel cron job (1st of each month) will call Haiku to suggest 5-10 new
// videos from the approved channel list below, email Josh + Bianca for
// review, and on approval append them to a Supabase ha_video_library table.
// The Video Theater frontend will read from that table first, falling back
// to this static list if Supabase is unreachable. See HANDOFF for the
// design. Until that ships, this static list is canonical.
//
// APPROVED SOURCE CHANNELS (for the auto-curator)
//   • PBS Kids — https://www.youtube.com/c/PBSKIDS
//   • Sesame Street — https://www.youtube.com/user/SesameStreet
//   • Sesame Workshop — official health/hygiene PSAs
//   • Daniel Tiger's Neighborhood (Fred Rogers Productions / PBS)
// ============================================================================

window.HeroAcademy = window.HeroAcademy || {};
window.HeroAcademy.SoundStage = {

  // ── PIANO SONGS (unchanged from v109) ───────────────────────────────────
  songs: [
    {
      id: 'twinkle',
      title: 'Twinkle Twinkle Little Star',
      emoji: '⭐',
      difficulty: 1,
      tempoBpm: 96,
      notes: [
        { note: 'C4', beats: 1 }, { note: 'C4', beats: 1 },
        { note: 'G4', beats: 1 }, { note: 'G4', beats: 1 },
        { note: 'A4', beats: 1 }, { note: 'A4', beats: 1 },
        { note: 'G4', beats: 2 },
        { note: 'F4', beats: 1 }, { note: 'F4', beats: 1 },
        { note: 'E4', beats: 1 }, { note: 'E4', beats: 1 },
        { note: 'D4', beats: 1 }, { note: 'D4', beats: 1 },
        { note: 'C4', beats: 2 },
      ],
    },
    {
      id: 'mary',
      title: 'Mary Had a Little Lamb',
      emoji: '🐑',
      difficulty: 1,
      tempoBpm: 110,
      notes: [
        { note: 'E4', beats: 1 }, { note: 'D4', beats: 1 },
        { note: 'C4', beats: 1 }, { note: 'D4', beats: 1 },
        { note: 'E4', beats: 1 }, { note: 'E4', beats: 1 },
        { note: 'E4', beats: 2 },
        { note: 'D4', beats: 1 }, { note: 'D4', beats: 1 },
        { note: 'D4', beats: 2 },
        { note: 'E4', beats: 1 }, { note: 'G4', beats: 1 },
        { note: 'G4', beats: 2 },
      ],
    },
    {
      id: 'hotcross',
      title: 'Hot Cross Buns',
      emoji: '🥐',
      difficulty: 1,
      tempoBpm: 100,
      notes: [
        { note: 'E4', beats: 1 }, { note: 'D4', beats: 1 }, { note: 'C4', beats: 2 },
        { note: 'E4', beats: 1 }, { note: 'D4', beats: 1 }, { note: 'C4', beats: 2 },
        { note: 'C4', beats: 0.5 }, { note: 'C4', beats: 0.5 },
        { note: 'C4', beats: 0.5 }, { note: 'C4', beats: 0.5 },
        { note: 'D4', beats: 0.5 }, { note: 'D4', beats: 0.5 },
        { note: 'D4', beats: 0.5 }, { note: 'D4', beats: 0.5 },
        { note: 'E4', beats: 1 }, { note: 'D4', beats: 1 }, { note: 'C4', beats: 2 },
      ],
    },
    {
      id: 'odetojoy',
      title: 'Ode to Joy (Beethoven)',
      emoji: '🎼',
      difficulty: 2,
      tempoBpm: 108,
      notes: [
        { note: 'E4', beats: 1 }, { note: 'E4', beats: 1 },
        { note: 'F4', beats: 1 }, { note: 'G4', beats: 1 },
        { note: 'G4', beats: 1 }, { note: 'F4', beats: 1 },
        { note: 'E4', beats: 1 }, { note: 'D4', beats: 1 },
        { note: 'C4', beats: 1 }, { note: 'C4', beats: 1 },
        { note: 'D4', beats: 1 }, { note: 'E4', beats: 1 },
        { note: 'E4', beats: 1.5 }, { note: 'D4', beats: 0.5 },
        { note: 'D4', beats: 2 },
      ],
    },
    {
      id: 'happybday',
      title: 'Happy Birthday to You',
      emoji: '🎂',
      difficulty: 2,
      tempoBpm: 110,
      notes: [
        { note: 'C4', beats: 0.75 }, { note: 'C4', beats: 0.25 },
        { note: 'D4', beats: 1 }, { note: 'C4', beats: 1 },
        { note: 'F4', beats: 1 }, { note: 'E4', beats: 2 },
        { note: 'C4', beats: 0.75 }, { note: 'C4', beats: 0.25 },
        { note: 'D4', beats: 1 }, { note: 'C4', beats: 1 },
        { note: 'G4', beats: 1 }, { note: 'F4', beats: 2 },
      ],
    },
  ],

  // ── MUSIC VIDEO THEATER ─────────────────────────────────────────────────
  // Ordered with Life Skills first (Josh's request Jun 6 2026).
  videoCategories: [

    // ─────────────────────────────────────────────────────────────────────
    // LIFE SKILLS — songs that teach feelings, hygiene, kindness, manners.
    // Hand-picked from Daniel Tiger and Sesame Street official channels.
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'life-skills',
      title: 'Life Skills',
      emoji: '💛',
      color: 'orange',
      tagline: 'Songs that help you handle big feelings, take care of yourself, and be a good friend.',
      videos: [
        {
          id: 'feelings-songs',
          title: "Daniel's Feeling Songs",
          composer: "Daniel Tiger's Neighborhood",
          duration: '11 min',
          description: 'A compilation of Daniel Tiger songs about feelings — happy, sad, mad, frustrated. The musical strategies you can sing when YOU feel that way.',
          youtubeId: 'w0VQIJVnoxU',
          post: {
            text: "What did you do the last time you felt that way, Nigel?",
            choices: ["Took deep breaths", "Talked to someone", "I'm still figuring it out"],
          },
        },
        {
          id: 'guess-the-feeling',
          title: 'Guess The Feeling',
          composer: "Daniel Tiger's Neighborhood",
          duration: '3 min',
          description: 'Look at the faces — can you tell what each tiger is feeling?',
          youtubeId: 'ajT8JrfubGE',
          post: {
            text: 'Naming what you feel makes the feeling smaller. Which one are you good at spotting?',
            choices: ['😊 Happy', '😠 Mad', '😢 Sad'],
          },
        },
        {
          id: 'daniel-tiger-playlist',
          title: "Daniel Tiger Neighborhood — full PBS playlist",
          composer: 'PBS Kids',
          duration: 'Playlist',
          description: "The official PBS Kids Daniel Tiger playlist — hours of songs about feelings, family, friends, and trying new things.",
          playlistId: 'PLa8HWWMcQEGTvVi5IkHY526u1YMqM0w7m',
          post: {
            text: 'Which one was your favorite?',
            choices: ['The one about feelings', 'The one about family', 'I want to watch another'],
          },
        },
        {
          id: 'brushy-brush-animated',
          title: 'Brushy Brush! (animated)',
          composer: 'Sesame Street · Elmo',
          duration: '2 min',
          description: 'Elmo teaches the brushing-teeth song. Sing it every morning and night and your teeth will thank you.',
          youtubeId: 'lv7vZoR5zAI',
          post: {
            text: 'Do you brush twice a day, Nigel?',
            choices: ['Yes, every day!', 'Mostly', 'I forget sometimes'],
          },
        },
        {
          id: 'brushy-brush-ms-rachel',
          title: "Brushy Brush with Ms. Rachel & Elmo",
          composer: 'Sesame Street',
          duration: '2 min',
          description: 'Ms. Rachel and Elmo show exactly how to brush — front, back, tops, bottoms.',
          youtubeId: 'm-C1nrwzj-M',
          post: {
            text: 'Which part of brushing is hardest for you?',
            choices: ['The back teeth', 'Brushing long enough', "I'm a brushing pro"],
          },
        },
        {
          id: 'brushy-brush-celebs',
          title: 'Brushy Brush PSA',
          composer: 'Sesame Street · Bruno Mars + friends',
          duration: '2 min',
          description: "Elmo and a crowd of celebrities sing about taking care of your teeth. Yes, that's Bruno Mars.",
          youtubeId: 'wxMrtK-kYnE',
          post: {
            text: "Did you spot Bruno Mars in there?",
            choices: ["Yeah!", "Who's that?", "Play it again"],
          },
        },
        {
          id: 'kindness-tori-kelly',
          title: 'Try a Little Kindness (with Tori Kelly)',
          composer: 'Sesame Street',
          duration: '3 min',
          description: '"K is for kindness." Simple acts that make somebody else\'s day better.',
          youtubeId: 'enaRNnEzwi4',
          post: {
            text: 'How will you be kind today, Nigel?',
            choices: ['Help someone', 'Say something nice', 'Share something'],
          },
        },
        {
          id: 'kindness-compilation',
          title: 'Songs About Kindness — compilation',
          composer: 'Sesame Street',
          duration: '20 min',
          description: 'A whole compilation of Sesame Street songs about being kind. Good for a quiet morning.',
          youtubeId: 'yuMY2noPt08',
          post: {
            text: 'Which kindness idea will you try this week?',
            choices: ['Help at home', 'Be a good friend', 'Be kind to myself'],
          },
        },
        {
          id: 'healthy-habits-playlist',
          title: 'Healthy Habits — Sesame Street + Super Simple Songs',
          composer: 'Sesame Workshop',
          duration: 'Playlist',
          description: 'A whole playlist of songs about washing hands, brushing teeth, and other ways to stay healthy.',
          playlistId: 'PL8TioFHubWFtRPjYw_fXsuB5ZF0ZlpNI6',
          post: {
            text: 'What healthy habit do you want to get better at?',
            choices: ['Washing hands', 'Brushing teeth', 'Going to bed on time'],
          },
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // CLASSICAL FOR KIDS
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'classical',
      title: 'Classical for Kids',
      emoji: '🎻',
      color: 'violet',
      tagline: 'Music written long, long ago — still magic today.',
      videos: [
        {
          id: 'carnival-overview',
          title: 'Carnival of the Animals',
          composer: 'Camille Saint-Saëns',
          duration: '23 min',
          description: 'A musical zoo! Each animal has its own tune.',
          youtubeId: 'kY5QNNUX4cs',
          post: {
            text: "That was Saint-Saëns' Carnival of the Animals! Did you hear how each animal had its own sound?",
            choices: ['Yes, the elephant was BIG!', 'The swan was so smooth', 'Can we hear it again?'],
          },
        },
        {
          id: 'carnival-classic',
          title: 'Carnival of the Animals (HQ Recording)',
          composer: 'Camille Saint-Saëns',
          duration: '24 min',
          description: 'A beautiful orchestral version of the same suite.',
          youtubeId: 'k2RPKMJmSp0',
          post: {
            text: 'Which animal was your favorite this time?',
            choices: ['The Lion 🦁', 'The Aquarium 🐠', 'The Swan 🦢'],
          },
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // PBS KIDS SONGS
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'pbs-songs',
      title: 'PBS Kids Songs',
      emoji: '📺',
      color: 'cyan',
      tagline: 'Singalong songs from your favorite PBS shows.',
      videos: [
        {
          id: 'pbs-rocks-playlist',
          title: 'PBS Kids Music Playlist',
          composer: 'PBS Kids',
          duration: 'Playlist',
          description: 'A whole playlist of catchy songs from PBS shows.',
          playlistId: 'PLa8HWWMcQEGTTmuw5WJ6ylhivLU6tKi67',
          post: {
            text: 'Which song stuck in your head, hero?',
            choices: ['The catchy one!', 'I want to dance!', 'Play me another'],
          },
        },
      ],
    },
  ],
};
