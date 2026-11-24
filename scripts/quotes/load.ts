// Sync the `quotes` table to data/quotes/quotes.json: upsert every quote
// (matched on slug), then delete rows whose slug is no longer in the file.
// Mood labels (quote_moods) are added by a person in the Supabase table
// editor; this script never touches them.
// Needs a server-only secret key, never exposed to the browser:
//
//   SUPABASE_SECRET_KEY=sb_secret_... in .env.local (no NEXT_PUBLIC_ prefix)
//   node --env-file=.env.local scripts/quotes/load.ts
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { DATA, readJson, type QuoteRecord } from "./common.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (see header).");

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const quotes = readJson<QuoteRecord[]>(join(DATA, "quotes.json"));

const BATCH = 250;
for (let i = 0; i < quotes.length; i += BATCH) {
  const { error } = await db.from("quotes").upsert(quotes.slice(i, i + BATCH), { onConflict: "slug" });
  if (error) throw error;
  console.log(`${Math.min(i + BATCH, quotes.length)}/${quotes.length}`);
}

// Remove quotes dropped from the data set since the last load.
const keep = new Set(quotes.map((q) => q.slug));
const stale: string[] = [];
for (let from = 0; ; from += 1000) {
  // The API returns at most 1,000 rows per request, so page through.
  const { data, error } = await db.from("quotes").select("slug").order("id").range(from, from + 999);
  if (error) throw error;
  stale.push(...data.map((r) => r.slug as string).filter((slug) => !keep.has(slug)));
  if (data.length < 1000) break;
}
for (let i = 0; i < stale.length; i += 100) {
  const { error } = await db.from("quotes").delete().in("slug", stale.slice(i, i + 100));
  if (error) throw error;
}
if (stale.length) console.log(`removed ${stale.length} stale: ${stale.join(", ")}`);

const { count, error } = await db.from("quotes").select("*", { count: "exact", head: true });
if (error) throw error;
console.log(`table now has ${count} quotes`);
