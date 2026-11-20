"use client";

import { BookOpen, Undo2 } from "lucide-react";
import { useEffect, useLayoutEffect, useReducer, useRef, type PointerEvent } from "react";
import { fetchRandomQuotes, shuffledFallback, type Quote } from "@/lib/quotes";
import styles from "./QuoteView.module.css";

type State = {
  current: Quote | null;
  /** Every quote shown before `current`, so undo can walk back without limit. */
  history: Quote[];
  /** Quotes fetched ahead of time so a tap never waits on the network. */
  queue: Quote[];
};
type Action = { type: "next" } | { type: "undo" } | { type: "enqueue"; quotes: Quote[] };

// Refill the queue when it runs this low, and remember this many recent ids
// so a refill doesn't bring back a quote the viewer just saw.
const REFILL_AT = 5;
const BATCH = 20;
const RECENT = 200;

function init(initial: Quote[]): State {
  return { current: initial[0] ?? null, history: [], queue: initial.slice(1) };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "next": {
      const [next, ...queue] = state.queue;
      if (!next) return state;
      if (!state.current) return { ...state, current: next, queue };
      return { current: next, history: [...state.history, state.current], queue };
    }
    case "undo": {
      if (state.history.length === 0) return state;
      return {
        current: state.history[state.history.length - 1],
        history: state.history.slice(0, -1),
        queue: state.current ? [state.current, ...state.queue] : state.queue,
      };
    }
    case "enqueue": {
      const taken = new Set([state.current, ...state.queue].map((q) => q?.id));
      const fresh = action.quotes.filter((q) => !taken.has(q.id));
      if (fresh.length === 0) return state;
      if (!state.current) return { ...state, current: fresh[0], queue: [...state.queue, ...fresh.slice(1)] };
      return { ...state, queue: [...state.queue, ...fresh] };
    }
  }
}

/** Keeps the queue topped up from Supabase; falls back to bundled quotes offline. */
function useQuoteQueue(state: State, dispatch: (a: Action) => void, enabled: boolean) {
  const loading = useRef(false);
  const queued = state.queue.length;

  useEffect(() => {
    if (!enabled || queued >= REFILL_AT || loading.current) return;
    loading.current = true;
    const recent = [...state.history, state.current, ...state.queue]
      .slice(-RECENT)
      .flatMap((q) => (q ? [q.id] : []));
    fetchRandomQuotes(BATCH, recent)
      .then((quotes) => dispatch({ type: "enqueue", quotes: quotes.length ? quotes : shuffledFallback() }))
      .catch(() => dispatch({ type: "enqueue", quotes: shuffledFallback() }))
      .finally(() => {
        loading.current = false;
      });
    // Re-check only when the queue shrinks or grows, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, queued]);
}

// Liquid glass "lights up" where the finger or pointer is.
function trackLight(event: PointerEvent<HTMLElement>) {
  const el = event.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty("--lx", `${event.clientX - rect.left}px`);
  el.style.setProperty("--ly", `${event.clientY - rect.top}px`);
}

// Smallest the quote may shrink to while fitting the card.
const MIN_FONT_PX = 12;

/**
 * The card has a fixed size and the credit is pinned at its foot. The quote
 * gets the space above; short quotes keep the CSS font size, long ones shrink
 * just enough to fit, so nothing on the page moves.
 */
function useFitQuote(change: unknown) {
  const cardRef = useRef<HTMLElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const quoteRef = useRef<HTMLQuoteElement>(null);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const fit = () => {
      const quote = quoteRef.current;
      const area = areaRef.current;
      if (!quote || !area) return;
      quote.style.fontSize = "";
      const max = parseFloat(getComputedStyle(quote).fontSize);
      const fits = () => quote.offsetHeight <= area.clientHeight + 1;
      if (fits()) return;

      let lo = MIN_FONT_PX;
      let hi = max;
      for (let i = 0; i < 10 && hi - lo > 0.25; i++) {
        const mid = (lo + hi) / 2;
        quote.style.fontSize = `${mid}px`;
        if (fits()) lo = mid;
        else hi = mid;
      }
      quote.style.fontSize = `${lo}px`;
    };

    fit();
    // The card's size comes from the layout, not the text, so this can't loop.
    const observer = new ResizeObserver(fit);
    observer.observe(card);
    if (document.fonts && document.fonts.status !== "loaded") document.fonts.ready.then(fit);
    return () => observer.disconnect();
  }, [change]);

  return { cardRef, areaRef, quoteRef };
}

/**
 * `initial` is a server-fetched batch: the first is shown, the rest queued.
 * `placeholder` renders the empty card while that batch streams in.
 */
export default function QuoteView({ initial, placeholder = false }: { initial: Quote[]; placeholder?: boolean }) {
  const [state, dispatch] = useReducer(reducer, initial, init);
  const { current: quote, history } = state;
  useQuoteQueue(state, dispatch, !placeholder);
  const verse = quote?.form === "verse";
  const testId = (id: string) => (placeholder ? undefined : id);
  // Every next/undo changes the history length, so it identifies each change.
  const change = history.length;
  const { cardRef, areaRef, quoteRef } = useFitQuote(change);

  return (
    // The placeholder is briefly in the DOM next to the real card while it
    // streams in, so it's inert and carries no test ids.
    <div className={styles.moment} inert={placeholder} aria-hidden={placeholder || undefined}>
      <figure ref={cardRef} className={styles.card} data-testid={testId("quote-card")}>
        <div key={change} className={styles.content}>
          <div ref={areaRef} className={styles.quoteArea}>
            <blockquote
              ref={quoteRef}
              className={verse ? `${styles.quote} ${styles.verse}` : styles.quote}
              aria-live={placeholder ? undefined : "polite"}
              data-testid={testId("quote-text")}
            >
              {!quote
                ? null
                : verse
                  ? quote.text.split("\n").map((line, i) => (
                      <span key={i} className={styles.line}>
                        {line}
                      </span>
                    ))
                  : `“${quote.text}”`}
            </blockquote>
          </div>
          <figcaption className={styles.credit} data-testid={testId("quote-credit")}>
            {quote && <span className={styles.author}>{quote.author}</span>}
            {quote?.work && <span className={styles.work}>, {quote.work}</span>}
          </figcaption>
        </div>
      </figure>

      <button
        type="button"
        className={styles.journal}
        data-testid={testId("journal-button")}
        onPointerMove={trackLight}
        onPointerDown={trackLight}
      >
        <BookOpen size={18} strokeWidth={2} aria-hidden="true" />
        Journal
      </button>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.undo}
          aria-label="Undo, show previous quote"
          data-testid={testId("undo-button")}
          disabled={history.length === 0}
          onPointerMove={trackLight}
          onPointerDown={trackLight}
          onClick={() => dispatch({ type: "undo" })}
        >
          <Undo2 size={22} strokeWidth={2} aria-hidden="true" />
        </button>

        <button
          type="button"
          className={styles.next}
          aria-label="Show another quote"
          data-testid={testId("next-quote-button")}
          onPointerMove={trackLight}
          onPointerDown={trackLight}
          onClick={() => dispatch({ type: "next" })}
        >
          <span className={styles.halo} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
