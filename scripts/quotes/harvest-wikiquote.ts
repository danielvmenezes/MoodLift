// Pull candidate quotes from the *sourced* parts of each author's Wikiquote
// page. Disputed, misattributed, attributed, unsourced and "quotes about"
// sections are skipped, and every candidate must carry a citation.
//
//   node scripts/quotes/harvest-wikiquote.ts
//   → .cache/quotes/candidates.json
import { join } from "node:path";
import { authors } from "./authors.ts";
import { createHash } from "node:crypto";
import { CACHE, fetchWikitext, normalise, typeset, writeJson, type Candidate } from "./common.ts";

const API = "https://en.wikiquote.org/w/api.php";

const EXCLUDED_HEADING =
  /disputed|attribut|unsourced|unverified|dubious|spurious|contested|variants?$|^about|quotes? about|said about|about (him|her|them)\b|see also|external links|^references$|^sources?$|^notes$|quoted in|^dialogue$|^cast$|misquot|apocryph|doubtful|^related|bibliograph|by others|tributes/i;

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ", "&mdash;": "—", "&ndash;": "–", "&amp;": "&", "&quot;": '"', "&#39;": "'",
  "&hellip;": "…", "&lsquo;": "‘", "&rsquo;": "’", "&ldquo;": "“", "&rdquo;": "”",
};

function stripTemplates(s: string): string {
  // {{w|Target|Label}} / {{w|Target}} keep their text; everything else goes.
  let prev;
  do {
    prev = s;
    s = s.replace(/\{\{\s*(?:w|wp|ws|s)\s*\|([^{}|]*)(?:\|([^{}]*))?\}\}/gi, (_, a, b) => b ?? a);
    s = s.replace(/\{\{[^{}]*\}\}/g, "");
  } while (s !== prev);
  return s;
}

/** Wikitext → plain text, keeping line breaks from <br> and <poem>. */
function clean(raw: string): string {
  let s = raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
  s = stripTemplates(s);
  s = s
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, "$1")
    .replace(/\[https?:\/\/\S+\]/g, "")
    .replace(/'''|''/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?poem[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  for (const [k, v] of Object.entries(ENTITIES)) s = s.split(k).join(v);
  return s
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Bold runs inside the raw wikitext — Wikiquote's way of marking the famous core. */
function boldRuns(raw: string): string[] {
  return [...raw.matchAll(/'''(.+?)'''/g)].map((m) => clean(m[1]));
}

function looksEnglish(text: string): boolean {
  const words = normalise(text).split(" ");
  const common = new Set(["the", "and", "to", "of", "a", "is", "you", "in", "that", "it", "we", "i", "be", "not", "for", "with", "are", "our", "your", "all", "will", "my", "but"]);
  const hits = words.filter((w) => common.has(w)).length;
  return words.length > 0 && hits / words.length >= 0.12;
}

/** Shape rules that keep a quote exact, self-contained and card-sized. */
function acceptable(text: string): "prose" | "verse" | null {
  if (/\.\.\.|…|\[|\]|\{|\}|\|/.test(text)) return null; // edited or leftover markup
  if (!/^[“"‘'A-Z0-9¿¡(]/.test(text)) return null; // starts mid-sentence
  if (!/[.!?”"’'—)]$/.test(text)) return null; // stops mid-sentence
  if (!looksEnglish(text)) return null;
  const lines = text.split("\n");
  if (lines.length === 1) {
    return text.length >= 25 && text.length <= 280 ? "prose" : null;
  }
  if (lines.length <= 8 && lines.every((l) => l.length <= 70) && text.length <= 400) return "verse";
  // Prose that Wikiquote split into paragraphs: only accept if short overall.
  const joined = lines.join(" ");
  return joined.length <= 280 ? "prose" : null;
}

type Block = { quote: string; subs: string[]; headings: string[]; rawHeadings: string[] };

function blocks(wikitext: string): Block[] {
  const out: Block[] = [];
  const headings: string[] = [];
  const raw: string[] = [];
  const lines = wikitext.replace(/<!--[\s\S]*?-->/g, "").split("\n");
  let cur: Block | null = null;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const h = line.match(/^(=+)\s*(.*?)\s*\1\s*$/);
    if (h) {
      const level = h[1].length;
      headings.length = Math.max(0, level - 2);
      headings[level - 2] = clean(h[2]);
      raw.length = Math.max(0, level - 2);
      raw[level - 2] = h[2];
      cur = null;
      continue;
    }
    if (/^\*[^*:]/.test(line)) {
      // A <poem> may run over several lines.
      if (/<poem/i.test(line) && !/<\/poem>/i.test(line)) {
        while (i + 1 < lines.length && !/<\/poem>/i.test(line)) line += "<br>" + lines[++i];
      }
      cur = { quote: line.slice(1), subs: [], headings: headings.filter(Boolean), rawHeadings: raw.filter(Boolean) };
      out.push(cur);
    } else if (/^\*\*[^*]/.test(line) && cur) {
      cur.subs.push(line.slice(2));
    } else if (!line.trim()) {
      continue;
    } else if (!/^[*:]/.test(line)) {
      cur = null;
    }
  }
  return out;
}

function citationOf(b: Block): string {
  const subs = b.subs.map(clean).filter((s) => s && looksCitation(s));
  const work = b.headings.filter((h) => !/^(quotes|sourced)$/i.test(h));
  return [...work, ...subs].join(" · ");
}

/** First italic title in the citation or the innermost work heading. */
function workOf(b: Block): string | null {
  for (const raw of [...b.subs, ...[...b.rawHeadings].reverse()]) {
    const m = raw.replace(/<!--[\s\S]*?-->/g, "").match(/''([^'].*?)''/);
    if (m) {
      const title = typeset(clean(m[1])).replace(/[\],.;:]+$/, "").trim();
      if (title.length >= 2 && title.length <= 48 && !/'/.test(m[1].slice(-1))) return title;
    }
  }
  return null;
}

function looksCitation(s: string): boolean {
  return /\d|chapter|ch\.|letter|speech|interview|poem|p\.|book|essay|lecture|address|journal|diary/i.test(s) || s.length < 120;
}

// Trailing notes that belong in the citation, not the quote text.
/** "(Hays translation)", "(Selected Poems, 1898)", "(p. 12)". */
const EDITORIAL_NOTE = /\s*\(([^()]*(?:\btrans(?:lat\w*|\.)|\b1[5-9]\d\d\b|\b20\d\d\b|\bp\.\s*\d)[^()]*)\)\s*\.?$/i;
/** Bare chapter/page/section cites: "(Ch 6)", "(p35)", "(28)". */
const BARE_CITE = /\s*\(\s*((?:ch(?:apter)?\.?|pp?\.?)\s*\d+|\d{1,3})\s*\)\s*\.?$/i;

/** Splits one trailing citation note off a quote's text. */
function splitTrailingNote(text: string): { text: string; note: string | null } {
  const m = text.match(EDITORIAL_NOTE) ?? text.match(BARE_CITE);
  return m ? { text: text.slice(0, m.index), note: m[1].trim() } : { text, note: null };
}

/**
 * Candidates from one quote block: the full text, plus bold cores of long passages.
 * `idName` builds the id (kept stable across harvests); `author` is the credited name.
 */
function fromBlock(b: Block, idName: string, author: string, title: string, citation: string): Candidate[] {
  const out: Candidate[] = [];
  const full = clean(b.quote);
  const options: { text: string; excerpt: boolean }[] = [{ text: full, excerpt: false }];
  // A long passage may have a bolded, self-contained core.
  if (full.length > 280) for (const run of boldRuns(b.quote)) options.push({ text: run, excerpt: true });

  for (const o of options) {
    const { text: stripped, note } = splitTrailingNote(o.text);
    let raw = stripped;
    // Wholly quoted text: often copied from a secondary list, so keep it
    // only when the citation pins it to a page or chapter; then unwrap it.
    const wrapped = raw.match(/^\s*["“]([^"“”]+)["”]\s*$/);
    if (wrapped) {
      if (!/\bp{1,2}\.\s*\d|\bpage\b|\bch(?:apter|\.)\s*\w/i.test(citation)) continue;
      raw = wrapped[1];
    }
    const text = typeset(raw);
    const form = acceptable(text);
    if (!form) continue;
    out.push({
      // Stable across re-harvests: author + hash of the wording.
      id: `${normalise(idName).replace(/ /g, "-")}-${createHash("sha1").update(normalise(text)).digest("hex").slice(0, 8)}`,
      author,
      page: title,
      text,
      form,
      citation: note ? `${citation} · ${note}` : citation,
      work: workOf(b),
      excerpt: o.excerpt,
    });
  }
  return out;
}

/** A page's wikitext, or null (with a warning) if it doesn't exist or was already harvested. */
const harvested = new Set<string>();
async function loadPage(page: string): Promise<{ title: string; wikitext: string } | null> {
  const found = await fetchWikitext(API, page);
  if (!found) console.warn(`  ! ${page}: page doesn't exist`);
  // Several names can redirect to one page ("Hurry" → "Haste"); read it once.
  if (!found || harvested.has(found.title)) return null;
  harvested.add(found.title);
  return found;
}

async function harvestAuthor(page: string, name: string): Promise<Candidate[]> {
  const found = await loadPage(page);
  if (!found) return [];
  const { title, wikitext } = found;
  const out: Candidate[] = [];
  for (const b of blocks(wikitext)) {
    if (b.headings.length === 0) continue; // lead section, before any heading
    if (b.headings.some((h) => EXCLUDED_HEADING.test(h))) continue;
    const citation = citationOf(b);
    if (!citation) continue;

    out.push(...fromBlock(b, name, name, title, citation));
  }
  return out;
}

// Wikiquote theme pages collect sourced quotes on one topic from many people.
// Each entry's citation must start with a link to the person who said it;
// that skips fictional characters, proverbs and anonymous lines. Scripture is
// skipped too (the app avoids proselytising).
const THEMES = [
  "Worry", "Anxiety", "Fear", "Courage", "Uncertainty", "Present", "Mindfulness", "Acceptance",
  "Rest", "Leisure", "Idleness", "Relaxation", "Sleep", "Fatigue", "Work", "Overwork", "Busyness",
  "Patience", "Calmness", "Serenity", "Tranquility", "Peace", "Equanimity", "Stillness", "Silence",
  "Solitude", "Simplicity", "Slowness", "Haste", "Balance", "Moderation", "Contentment",
  "Stress", "Pressure", "Perfection", "Perseverance", "Endurance", "Resilience", "Adversity",
  "Difficulty", "Self-compassion", "Gentleness", "Kindness", "Nature", "Walking", "Gardening",
  "Tomorrow", "Today", "Letting go", "Trust", "Breathing", "Meditation", "Play", "Holiday",
  "Failure", "Mistakes", "Imperfection", "Self-acceptance", "Time", "Hurry", "Beginning", "Change",
  "Future", "Past", "Thought", "Mind", "Weariness", "Vacation", "Effort", "Small things",
  "Laziness", "Recreation", "Health", "Comfort", "Ease", "Evening", "Morning", "Night", "Seasons",
  "Rain", "Trees", "Flowers", "Sea", "Garden", "Music", "Laughter", "Humor", "Help", "Limits",
  "Priorities", "Ambition", "Success", "Habit", "Routine", "Order", "Chaos", "Confusion",
  "Decision", "Choice", "Burden", "Strength", "Weakness", "Vulnerability", "Self-care", "Growth",
  "Progress", "Journey", "Process", "Steps", "Life", "Living", "Wonder", "Tea", "Books", "Reading",
];

const SCRIPTURE = /\b(Bible|Gospel|Psalms?|Proverbs|Matthew|Mark \d|Luke|John \d|Isaiah|Philippians|Corinthians|Romans|Hebrews|Ecclesiastes|Qur'?an|Koran|Torah)\b/;

/** Credited name for a linked person: the authors.ts name, else the page title. */
const nameByPage = new Map(authors.map((a) => [a.page, a.name ?? a.page]));
const creditFor = (target: string) => nameByPage.get(target) ?? target.replace(/\s*\([^)]*\)$/, "");

async function harvestTheme(page: string): Promise<Candidate[]> {
  const found = await loadPage(page);
  if (!found) return [];
  const { title, wikitext } = found;
  const out: Candidate[] = [];
  for (const b of blocks(wikitext)) {
    if (b.headings.some((h) => EXCLUDED_HEADING.test(h) || /proverb|saying|anonymous|folk/i.test(h))) continue;
    const first = (b.subs[0] ?? "").trim();
    const link = first.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
    if (!link || /^(w|wikipedia|s|wikisource):/i.test(link[1]) || link[1].startsWith(":")) continue;
    if (SCRIPTURE.test(first)) continue;
    // The label as written builds the id (stable for curated selections); the
    // linked page gives the credited name, so "Khalil Gibran" or "Nhat Hanh"
    // is credited the same way as the author's own page.
    const label = clean(link[2] ?? link[1].replace(/\s*\([^)]*\)$/, ""));
    if (!label || /anonymous|unknown|proverb/i.test(label)) continue;
    out.push(...fromBlock(b, label, creditFor(clean(link[1])), title, clean(first)));
  }
  return out;
}

const all: Candidate[] = [];
const ids = new Set<string>();
/** Keeps the first candidate per id (a quote can appear twice, or on several pages). */
function collect(label: string, found: Candidate[]) {
  const fresh = found.filter((c) => !ids.has(c.id) && ids.add(c.id));
  console.log(`${String(fresh.length).padStart(4)}  ${label}`);
  all.push(...fresh);
}
for (const a of authors) collect(a.name ?? a.page, await harvestAuthor(a.page, a.name ?? a.page));
for (const page of THEMES) collect(`[theme] ${page}`, await harvestTheme(page));
writeJson(join(CACHE, "candidates.json"), all);
console.log(`\n${all.length} candidates from ${authors.length} authors and ${THEMES.length} theme pages`);
