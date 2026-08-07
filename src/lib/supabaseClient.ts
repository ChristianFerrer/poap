import { createClient } from "@supabase/supabase-js";

/**
 * One shared client for the whole app. Uses the publishable (anon) key —
 * every table has an open "using (true)" RLS policy (see the migration),
 * matching the app's current no-login behavior: anyone with the link can
 * already create/edit/delete everything client-side, so the database
 * isn't a stricter boundary than the UI already is. Revisit if/when real
 * auth is added.
 */
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
