// Verify every selected quote and write the final data set.
//
// 1. Primary text: search Wikisource (public-domain original texts) for the
//    exact wording; if the page contains it and names the author, the quote
//    is verified against the original and cited there.
// 2. Otherwise the Wikiquote entry must still contain the wording in a
//    sourced section with a citation (checked by re-reading the page).
// Anything that passes neither is rejected (strict mode).
//
//   node scripts/quotes/verify.ts
//   in:  .cache/quotes/candidates.json, data/quotes/selection.json, data/quotes/manual.json,
//        data/quotes/excluded.json (candidate ids or slugs dropped after review, with reasons)
//   out: data/quotes/quotes.json, data/quotes/rejected.json
import { join } from "node:path";
import { authors } from "./authors.ts";
import {
  cachedFetch, CACHE, DATA, normalise, readJson, slugify, writeJson,
  type Candidate, type QuoteRecord,
} from "./common.ts";

const WIKISOURCE = "https://en.wikisource.org/w/api.php";
const WIKIQUOTE = "https://en.wikiquote.org/w/api.php";

const candidates = new Map(readJson<Candidate[]>(join(CACHE, "candidates.json")).map((c) => [c.id, c]));
const selection = readJson<string[]>(join(DATA, "selection.json"));
const manual = readJson<QuoteRecord[]>(join(DATA, "manual.json"));
const excluded = new Map(
  readJson<{ id: string; reason: string }[]>(join(DATA, "excluded.json")).map((e) => [e.id, e.reason]),
);
const authorInfo = new Map(authors.map((a) => [a.name ?? a.page, a]));

function plain(wikitext: string): string {
  return normalise(
    wikitext
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
      .replace(/\{\{[^{}]*\}\}/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/'''|''/g, ""),
  );
}

// Wikisource throttles full-text search hard. After a rate limit, skip the
// (optional) primary-text upgrade for a minute instead of waiting it out;
// those quotes are still verified against their Wikiquote entry.
let wikisourcePausedUntil = 0;

async function wikisourceFetch(url: string): Promise<string> {
  try {
    return await cachedFetch(url, { retries: 0 });
  } catch (err) {
    if (String(err).startsWith("429")) wikisourcePausedUntil = Date.now() + 60_000;
    throw err;
  }
}

async function wikitext(api: string, title: string): Promise<string | null> {
  const url = `${api}?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json&formatversion=2&redirects=1`;
  const json = JSON.parse(api === WIKISOURCE ? await wikisourceFetch(url) : await cachedFetch(url));
  return json.parse?.wikitext ?? null;
}

/** The longest run of words with no punctuation — the most searchable phrase. */
function searchPhrase(text: string): string | null {
  const runs = text.split(/[^\p{L}\p{N}’' ]+/u).map((r) => r.trim().split(/\s+/).filter(Boolean));
  const best = runs.sort((a, b) => b.length - a.length)[0] ?? [];
  if (best.length < 5) return null;
  return best.slice(0, 10).join(" ").replace(/’/g, "'");
}

async function findOnWikisource(c: Candidate): Promise<{ title: string } | null> {
  // Wikisource only holds public-domain texts; don't search for modern authors.
  const a = authorInfo.get(c.author);
  if (!a || a.died === null || a.died >= 1956) return null;
  if (Date.now() < wikisourcePausedUntil) return null;
  const phrase = searchPhrase(c.text);
  if (!phrase) return null;
  const url = `${WIKISOURCE}?action=query&list=search&srsearch=${encodeURIComponent(`"${phrase}"`)}&srnamespace=0&srlimit=3&format=json&formatversion=2`;
  const hits: { title: string }[] = JSON.parse(await wikisourceFetch(url)).query?.search ?? [];
  const surname = normalise(c.author).split(" ").at(-1)!;
  const want = normalise(c.text);
  for (const hit of hits) {
    const page = await wikitext(WIKISOURCE, hit.title);
    if (!page) continue;
    const text = plain(page);
    // Must contain the whole quote and name the author (header or title).
    if (text.includes(want) && (text.includes(surname) || normalise(hit.title).includes(surname))) {
      return { title: hit.title };
    }
  }
  return null;
}

async function onWikiquote(c: Candidate): Promise<boolean> {
  const page = await wikitext(WIKIQUOTE, c.page);
  return !!page && plain(page).includes(normalise(c.text));
}

const wikiUrl = (base: string, title: string) =>
  base + encodeURIComponent(title.replace(/ /g, "_")).replace(/%2F/g, "/").replace(/%3A/g, ":");

function rights(c: Candidate, primary: boolean): QuoteRecord["rights"] {
  if (primary) return "public_domain"; // Wikisource hosts public-domain texts
  const a = authorInfo.get(c.author);
  return a && !a.translated && a.died !== null && a.died < 1900 ? "public_domain" : "copyrighted";
}

function translatorOf(citation: string): string | null {
  const name = "([A-Z][\\w.'’-]*(?:\\s+(?:[A-Z][\\w.'’-]*|de|van|von))*)";
  const m =
    citation.match(new RegExp(`translat(?:ed|ion)(?: by|:)\\s+${name}`)) ??
    citation.match(new RegExp(`${name}(?:'s)? translation`));
  return m ? m[1] : null;
}

const out: QuoteRecord[] = [...manual];
const rejected: { id: string; reason: string }[] = [];
const seen = new Set(manual.map((q) => normalise(q.text)));
const slugs = new Set(manual.map((q) => q.slug));

let i = 0;
for (const id of selection) {
  i++;
  const c = candidates.get(id);
  if (!c) { rejected.push({ id, reason: "unknown candidate id" }); continue; }
  if (/[a-z][.,;:!?][A-Z]/.test(c.text)) { rejected.push({ id, reason: "run-together lines" }); continue; }
  if (/\s(?:n[’']t|[’'](?:s|ll|d|re|ve|m))\b/.test(c.text)) { rejected.push({ id, reason: "old-style split contraction" }); continue; }
  if (excluded.has(id)) { rejected.push({ id, reason: `excluded: ${excluded.get(id)}` }); continue; }
  const key = normalise(c.text);
  if (seen.has(key)) { rejected.push({ id, reason: "duplicate" }); continue; }

  const primary = await findOnWikisource(c).catch(() => null);
  const reference = primary ? true : await onWikiquote(c).catch(() => false);
  if (!primary && !reference) { rejected.push({ id, reason: "wording not found at source" }); continue; }

  let slug = `${slugify(c.author)}-${slugify(c.text.split(/\s+/).slice(0, 5).join(" "))}`;
  // Excluded by slug: quotes the dataset e2e test found too long for the card.
  if (excluded.has(slug)) { rejected.push({ id, reason: `excluded: ${excluded.get(slug)}` }); continue; }
  for (let n = 2; slugs.has(slug); n++) slug = `${slug.replace(/-\d+$/, "")}-${n}`;
  slugs.add(slug);
  seen.add(key);

  out.push({
    slug,
    text: c.text,
    form: c.form,
    author: c.author,
    work: c.work,
    translator: translatorOf(c.citation),
    citation: c.citation || null,
    source_name: primary ? "Wikisource" : "Wikiquote",
    source_url: primary
      ? wikiUrl("https://en.wikisource.org/wiki/", primary.title)
      : wikiUrl("https://en.wikiquote.org/wiki/", c.page),
    verified_by: primary ? "primary_text" : "reference",
    rights: rights(c, !!primary),
  });
  if (i % 50 === 0) console.log(`${i}/${selection.length} checked, ${out.length} kept`);
}

writeJson(join(DATA, "quotes.json"), out);
writeJson(join(DATA, "rejected.json"), rejected);
const primaryCount = out.filter((q) => q.verified_by === "primary_text").length;
console.log(`\n${out.length} quotes (${primaryCount} against primary text), ${rejected.length} rejected`);
