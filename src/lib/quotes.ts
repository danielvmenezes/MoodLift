export type Quote = {
  id: string;
  /** Exact wording; for verse, "\n" marks the poem's own line breaks. */
  text: string;
  /** Verse keeps its line breaks and is set without wrapping quote marks. */
  form: "prose" | "verse";
  /** Shown under the quote: author, then work. */
  credit: string;
};

// One quote per mood MoodLift targets. Wording checked against the original
// work (or Wikiquote's sourced entry) — see the note on each.
export const quotes: Quote[] = [
  {
    // East of Eden (1952), Part 4, ch. 53, sec. 3.
    id: "burnt-out-1",
    text: "And now that you don’t have to be perfect, you can be good.",
    form: "prose",
    credit: "John Steinbeck, East of Eden",
  },
  {
    // First stanza, Franklin manuscript edition (Fr314 / J254), written c. 1861.
    id: "sad-1",
    text: "‘Hope’ is the thing with feathers\nThat perches in the soul\nAnd sings the tune without the words\nAnd never stops at all",
    form: "verse",
    credit: "Emily Dickinson",
  },
  {
    // Little Women (1868), ch. 44 "My Lord and Lady", spoken by Amy.
    id: "anxious-1",
    text: "I’m not afraid of storms, for I’m learning how to sail my ship.",
    form: "prose",
    credit: "Louisa May Alcott, Little Women",
  },
  {
    // "Wild Geese", from Dream Work (1986) — the poem's closing sentence.
    id: "lonely-1",
    text: "Whoever you are, no matter how lonely,\nthe world offers itself to your imagination,\ncalls to you like the wild geese, harsh and exciting—\nover and over announcing your place\nin the family of things.",
    form: "verse",
    credit: "Mary Oliver, Wild Geese",
  },
  {
    // Facebook post, 8 April 2015; repeated in her 2017 TED talk.
    id: "tired-1",
    text: "Almost everything will work again if you unplug it for a few minutes, including you.",
    form: "prose",
    credit: "Anne Lamott",
  },
  {
    // "A Servant to Servants", North of Boston (1914).
    id: "unmotivated-1",
    text: "The best way out is always through.",
    form: "prose",
    credit: "Robert Frost, A Servant to Servants",
  },
];
