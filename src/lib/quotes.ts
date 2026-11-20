import { supabase } from "./supabase";

export type Quote = {
  id: string;
  /** Exact wording; for verse, "\n" marks the poem's own line breaks. */
  text: string;
  /** Verse keeps its line breaks and is set without wrapping quote marks. */
  form: "prose" | "verse";
  /** Shown under the quote as "Author, Work"; a long work title truncates. */
  author: string;
  work?: string | null;
};

// Offline fallback, shown only if Supabase can't be reached. The full set
// lives in the `quotes` table (source of truth: data/quotes/quotes.json).
// Wording checked against the original work (or Wikiquote's sourced entry).
export const fallbackQuotes: Quote[] = [
  {
    // East of Eden (1952), Part 4, ch. 53, sec. 3.
    id: "burnt-out-1",
    text: "And now that you don’t have to be perfect, you can be good.",
    form: "prose",
    author: "John Steinbeck",
    work: "East of Eden",
  },
  {
    // First stanza, Franklin manuscript edition (Fr314 / J254), written c. 1861.
    id: "sad-1",
    text: "‘Hope’ is the thing with feathers\nThat perches in the soul\nAnd sings the tune without the words\nAnd never stops at all",
    form: "verse",
    author: "Emily Dickinson",
  },
  {
    // Little Women (1868), ch. 44 "My Lord and Lady", spoken by Amy.
    id: "anxious-1",
    text: "I’m not afraid of storms, for I’m learning how to sail my ship.",
    form: "prose",
    author: "Louisa May Alcott",
    work: "Little Women",
  },
  {
    // "Wild Geese", from Dream Work (1986) — the poem's closing sentence.
    id: "lonely-1",
    text: "Whoever you are, no matter how lonely,\nthe world offers itself to your imagination,\ncalls to you like the wild geese, harsh and exciting—\nover and over announcing your place\nin the family of things.",
    form: "verse",
    author: "Mary Oliver",
    work: "Wild Geese",
  },
  {
    // Facebook post, 8 April 2015; repeated in her 2017 TED talk.
    id: "tired-1",
    text: "Almost everything will work again if you unplug it for a few minutes, including you.",
    form: "prose",
    author: "Anne Lamott",
  },
  {
    // "A Servant to Servants", North of Boston (1914).
    id: "unmotivated-1",
    text: "The best way out is always through.",
    form: "prose",
    author: "Robert Frost",
    work: "A Servant to Servants",
  },
];

type QuoteRow = {
  id: number;
  text: string;
  form: "prose" | "verse";
  author: string;
  work: string | null;
};

const toQuote = (row: QuoteRow): Quote => ({
  id: String(row.id),
  text: row.text,
  form: row.form,
  author: row.author,
  work: row.work,
});

/** A random batch from the database, skipping ids the viewer has just seen. */
export async function fetchRandomQuotes(n: number, exclude: string[] = []): Promise<Quote[]> {
  const { data, error } = await supabase.rpc("random_quotes", {
    n,
    exclude: exclude.filter((id) => /^\d+$/.test(id)).map(Number),
  });
  if (error) throw error;
  return (data as QuoteRow[]).map(toQuote);
}

/** The fallback quotes in random order. */
export function shuffledFallback(): Quote[] {
  const copy = [...fallbackQuotes];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
