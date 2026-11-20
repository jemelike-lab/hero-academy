// Where Nigel's profile lives at runtime (v317).
//
// v300 moved the static site, including data/, into public/. Eight API files
// kept reading process.cwd()/data/nigel-profile.json, which no longer exists,
// so the recipe generator, the daily-content and expedition crons, and the
// other Haiku generators failed from 27 Oct 2026. The path is built from this
// module's own URL so Vercel's file tracer bundles the JSON with every
// function that imports it.
import { fileURLToPath } from 'node:url';

export const PROFILE_PATH = fileURLToPath(new URL('../../public/data/nigel-profile.json', import.meta.url));
