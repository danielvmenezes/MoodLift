// Apply a mood screening pass: each quote was judged against the four moods
// and those that help none are removed from the selection, so verify.ts never
// fetches them. Only the keep/drop decision is used; classifying quotes by
// mood is done by a person in the Supabase table editor (quote_moods).
//
//   node scripts/quotes/apply-mood-screen.ts <labels.tsv>...
//   in:  TSV lines `slug<TAB>moods` for every quote in quotes.json
//        (comma-separated moods, or `none`)
//   out: data/quotes/selection.json without the `none` quotes; run verify.ts next
import { join } from "node:path";
import { CACHE, DATA, isMood, normalise, readJson, readTsv, writeJson, type Candidate, type QuoteRecord } from "./common.ts";

const quotes = readJson<QuoteRecord[]>(join(DATA, "quotes.json"));
const textBySlug = new Map(quotes.map((q) => [q.slug, normalise(q.text)]));
const labelled = new Set<string>();
const dropTexts = new Set<string>();

for (const { file, key: slug, values } of readTsv(process.argv.slice(2))) {
  if (!textBySlug.has(slug)) throw new Error(`${file}: unknown slug ${slug}`);
  if (labelled.has(slug)) throw new Error(`${file}: ${slug} labelled twice`);
  labelled.add(slug);
  if (values.join() === "none") dropTexts.add(textBySlug.get(slug)!);
  else if (!values.every(isMood)) throw new Error(`${file}: ${slug} has invalid moods "${values.join()}"`);
}

const missing = quotes.filter((q) => !labelled.has(q.slug)).map((q) => q.slug);
if (missing.length) throw new Error(`${missing.length} quotes not labelled, e.g. ${missing.slice(0, 5).join(", ")}`);

const manual = readJson<QuoteRecord[]>(join(DATA, "manual.json")).filter((q) => dropTexts.has(normalise(q.text)));
if (manual.length) throw new Error(`Remove these from manual.json by hand: ${manual.map((q) => q.slug).join(", ")}`);

// Drop every selected candidate with a screened-out wording.
const dropIds = new Set(
  readJson<Candidate[]>(join(CACHE, "candidates.json"))
    .filter((c) => dropTexts.has(normalise(c.text)))
    .map((c) => c.id),
);
const selectionFile = join(DATA, "selection.json");
const selection = readJson<string[]>(selectionFile);
const kept = selection.filter((id) => !dropIds.has(id));
writeJson(selectionFile, kept);
console.log(`${dropTexts.size} quotes dropped (${selection.length - kept.length} selection ids); run verify.ts next`);
