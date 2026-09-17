// Single shared Supabase client — everything else (src/auth/useAuth.js,
// src/data/useClassroomStore.js) imports this instead of creating its own.
//
// URL/key come from Vite env vars (VITE_ prefix required to be exposed to
// client code — see Vite's docs). Set locally via a .env file (see
// .env.example; .env itself is gitignored) and in CI via GitHub Actions
// secrets (see .github/workflows/deploy.yml) — the anon key is meant to
// be public/client-side (row-level security is what actually protects
// data, not keeping this secret), but it still isn't committed since it's
// per-project and shouldn't be hardcoded into source.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fails loudly at import time rather than producing confusing runtime
  // errors from every Supabase call — see CLAUDE.md's Database section
  // for how to set these.
  console.error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env and fill in your Supabase project details.',
  );
}

export const supabase = createClient(url, anonKey);
