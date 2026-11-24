// Add a mood-targeted curation round to the data set: quotes picked because
// they help anxiety, burnout or overwhelm. Only the selection is stored;
// classifying quotes by mood is done by a person in the Supabase table editor.
//
//   node scripts/quotes/add-mood-picks.ts <picks.tsv>...
//   in:  TSV lines `candidateId<TAB>moods` (moods are the curator's reason for
//        the pick and are checked, not stored)
//   out: ids appended to data/quotes/selection.json; run verify.ts next
import { join } from "node:path";
import { CACHE, DATA, isMood, readJson, readTsv, writeJson, type Candidate } from "./common.ts";

const candidates = new Set(readJson<Candidate[]>(join(CACHE, "candidates.json")).map((c) => c.id));
const selectionFile = join(DATA, "selection.json");
// A Set keeps insertion order, so the file keeps its order with new ids appended.
const selected = new Set(readJson<string[]>(selectionFile));
const before = selected.size;

for (const { file, key: id, values: moods } of readTsv(process.argv.slice(2))) {
  if (!candidates.has(id)) throw new Error(`${file}: unknown candidate ${id}`);
  if (!moods.every(isMood) || moods.every((m) => m === "sadness")) {
    throw new Error(`${file}: ${id} must be picked for anxiety, burnout or overwhelm, got "${moods.join()}"`);
  }
  selected.add(id);
}

writeJson(selectionFile, [...selected]);
console.log(`${selected.size - before} ids added to the selection; run verify.ts next`);
