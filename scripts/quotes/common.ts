// Shared helpers for the quote pipeline. Run scripts with plain `node`
// (Node 24 strips TypeScript types natively).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

export const ROOT = join(import.meta.dirname, "..", "..");
export const DATA = join(ROOT, "data", "quotes");
export const CACHE = join(ROOT, ".cache", "quotes");

const UA = "MoodLift-quote-harvester/0.1 (educational project; polite batch requests)";

export type Candidate = {
  id: string;
  author: string;
  page: string;
  text: string;
  form: "prose" | "verse";
  citation: string;
  /** Title of the work, when the page names one in italics. */
  work: string | null;
  /** Text was a bold highlight inside a longer sourced passage. */
  excerpt: boolean;
};

export type QuoteRecord = {
  slug: string;
  text: string;
  form: "prose" | "verse";
  author: string;
  work: string | null;
  translator: string | null;
  citation: string | null;
  source_name: string;
  source_url: string;
  verified_by: "primary_text" | "reference";
  rights: "public_domain" | "copyrighted";
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET with an on-disk cache so reruns don't hit the sources again. */
export async function cachedFetch(url: string, { retries = 6 } = {}): Promise<string> {
  const key = createHash("sha1").update(url).digest("hex");
  const file = join(CACHE, key.slice(0, 2), key);
  if (existsSync(file)) return readFileSync(file, "utf8");
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) {
      const body = await res.text();
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, body);
      await sleep(1000);
      return body;
    }
    if (attempt >= retries || (res.status < 500 && res.status !== 429)) {
      throw new Error(`${res.status} ${url}`);
    }
    const wait = Number(res.headers.get("retry-after")) || 15 * (attempt + 1);
    console.warn(`  … ${res.status}, waiting ${wait}s`);
    await sleep(wait * 1000);
  }
}

/** Text used to compare wordings: case, punctuation and spacing ignored. */
export function normalise(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Straight quotes/apostrophes → typographic, matching src/lib/quotes.ts. */
export function typeset(text: string): string {
  return text
    .replace(/(^|[\s(\[—–-])'/g, "$1‘")
    .replace(/'/g, "’")
    .replace(/(^|[\s(\[—–-])"/g, "$1“")
    .replace(/"/g, "”")
    .replace(/ -- /g, " — ")
    .replace(/\s+([,.;:!?])/g, "$1");
}

export function slugify(s: string): string {
  return normalise(s).replace(/ /g, "-").slice(0, 60);
}

export function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

export function writeJson(file: string, value: unknown) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}
