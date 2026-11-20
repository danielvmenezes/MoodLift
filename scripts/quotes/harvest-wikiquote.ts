// Pull candidate quotes from the *sourced* parts of each author's Wikiquote
// page. Disputed, misattributed, attributed, unsourced and "quotes about"
// sections are skipped, and every candidate must carry a citation.
//
//   node scripts/quotes/harvest-wikiquote.ts
//   → .cache/quotes/candidates.json
import { join } from "node:path";
import { authors } from "./authors.ts";
import { createHash } from "node:crypto";
import { cachedFetch, CACHE, normalise, typeset, writeJson, type Candidate } from "./common.ts";

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

async function harvestAuthor(page: string, name: string): Promise<Candidate[]> {
  const url = `${API}?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&formatversion=2&redirects=1`;
  const json = JSON.parse(await cachedFetch(url));
  if (json.error) {
    console.warn(`  ! ${page}: ${json.error.info}`);
    return [];
  }
  const title: string = json.parse.title;
  const out: Candidate[] = [];
  for (const b of blocks(json.parse.wikitext)) {
    if (b.headings.length === 0) continue; // lead section, before any heading
    if (b.headings.some((h) => EXCLUDED_HEADING.test(h))) continue;
    const citation = citationOf(b);
    if (!citation) continue;

    const full = clean(b.quote);
    const options: { text: string; excerpt: boolean }[] = [{ text: full, excerpt: false }];
    // A long passage may have a bolded, self-contained core.
    if (full.length > 280) for (const run of boldRuns(b.quote)) options.push({ text: run, excerpt: true });

    for (const o of options) {
      // Editorial notes like "(Hays translation)" or a trailing
      // "(Selected Poems, 1898)" citation belong in the citation, not the text.
      const notes: string[] = [];
      let raw = o.text.replace(
        /\s*\(([^()]*(?:\btrans(?:lat\w*|\.)|\b1[5-9]\d\d\b|\b20\d\d\b|\bp\.\s*\d)[^()]*)\)\s*\.?$/i,
        (_, n) => (notes.push(n), ""),
      );
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
        id: `${normalise(name).replace(/ /g, "-")}-${createHash("sha1").update(normalise(text)).digest("hex").slice(0, 8)}`,
        author: name,
        page: title,
        text,
        form,
        citation: [citation, ...notes].join(" · "),
        work: workOf(b),
        excerpt: o.excerpt,
      });
    }
  }
  return out;
}

const all: Candidate[] = [];
const ids = new Set<string>();
for (const a of authors) {
  const name = a.name ?? a.page;
  // A page can list the same quote twice; keep the first.
  const found = (await harvestAuthor(a.page, name)).filter((c) => !ids.has(c.id) && ids.add(c.id));
  console.log(`${String(found.length).padStart(4)}  ${name}`);
  all.push(...found);
}
writeJson(join(CACHE, "candidates.json"), all);
console.log(`\n${all.length} candidates from ${authors.length} authors`);
