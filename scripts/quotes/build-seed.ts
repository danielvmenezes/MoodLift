// Turn data/quotes/quotes.json into SQL insert batches for the `quotes` table.
// Re-runnable: existing slugs are updated in place, new ones inserted.
//
//   node scripts/quotes/build-seed.ts
//   → .cache/quotes/seed/NNN.sql (alternative to load.ts: paste each into the SQL editor)
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE, DATA, readJson, type QuoteRecord } from "./common.ts";

const BATCH = 250;
const quotes = readJson<QuoteRecord[]>(join(DATA, "quotes.json"));

const lit = (v: string | null) => (v === null ? "null" : `'${v.replace(/'/g, "''")}'`);
const cols = [
  "slug", "text", "form", "author", "work", "translator", "citation",
  "source_name", "source_url", "verified_by", "rights",
] as const;

const dir = join(CACHE, "seed");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

for (let i = 0; i < quotes.length; i += BATCH) {
  const rows = quotes
    .slice(i, i + BATCH)
    .map((q) => `(${cols.map((c) => lit(q[c])).join(", ")})`)
    .join(",\n");
  const sql = `insert into public.quotes (${cols.join(", ")}) values\n${rows}\non conflict (slug) do update set\n${cols
    .filter((c) => c !== "slug")
    .map((c) => `  ${c} = excluded.${c}`)
    .join(",\n")};\n`;
  writeFileSync(join(dir, `${String(i / BATCH).padStart(3, "0")}.sql`), sql);
}
console.log(`${quotes.length} quotes → ${Math.ceil(quotes.length / BATCH)} batches in ${dir}`);
