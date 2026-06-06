// ============================================================================
// Hero Academy — Sound Stage data
// Songs (Piano Lab) + Curated music videos (Music Video Theater)
//
// Songs: arrays of { note, beats } where note is scientific pitch notation
//        (e.g. "C4" = middle C, "G4" = G above middle C).
//        beats = 1 (quarter note), 0.5 (eighth), 2 (half note).
//
// Videos: youtubeId is the 11-character YouTube ID (after watch?v= in the URL).
//         For curated playlists (whole playlist embed), use playlistId instead.
//         postQuestion is what Humphrey asks Nigel after the video ends.
//         All videos vetted Jun 5 2026 — Josh should re-verify before launch.
//
// To add more videos: copy a block, paste a new id from a vetted source,
//         and refill title/description/postQuestion. The hub picks them up
//         on next reload (no schema work needed).
// ============================================================================

window.HeroAcademy = window.HeroAcademy || {};
window.HeroAcademy.SoundStage = {

  // ── PIANO SONGS ─────────────────────────────────────────────────────────
  // Each song is { id, title, emoji, difficulty (1-3), notes: [{note, beats}] }
  // We work in C major, one octave (C4–C5), all white keys + sharps.
  // Add new songs by appending another object below.
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
  // Each video has either { youtubeId } for a single video, or
  // { playlistId } to embed an entire vetted playlist.
  //
  // post.text is what Humphrey says when the video ends.
  // post.choices is an optional 2–3 button question to gauge listening.
  //
  // SAFETY: all videos here were chosen from official channels (PBS Kids,
  // major classical labels). Re-verify the link still works before each
  // session by clicking through once.
  videoCategories: [
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
    // To add more categories (e.g. "Around the World", "Instrument Spotlight",
    // "Move & Groove"), copy a block above, change the id/title/emoji/color,
    // and fill in videos[] with vetted YouTube IDs.
  ],
};
