import { createClient } from "@supabase/supabase-js";

// Read-only, public data (quotes), so the publishable key and no session.
// Shared by the server render and the browser.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
