"use client";

import { BookOpen, Undo2 } from "lucide-react";
import { useLayoutEffect, useReducer, useRef, type PointerEvent } from "react";
import { quotes } from "@/lib/quotes";
import styles from "./QuoteView.module.css";

type State = { index: number; history: number[] };
type Action = { type: "next" } | { type: "undo" };

function pickNextIndex(current: number, total: number) {
  if (total < 2) return current;
  const next = Math.floor(Math.random() * (total - 1));
  return next >= current ? next + 1 : next;
}

// Every quote shown is pushed onto history, so undo can walk back without limit.
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "next":
      return {
        index: pickNextIndex(state.index, quotes.length),
        history: [...state.history, state.index],
      };
    case "undo": {
      if (state.history.length === 0) return state;
      return { index: state.history[state.history.length - 1], history: state.history.slice(0, -1) };
    }
  }
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

export default function QuoteView() {
  const [{ index, history }, dispatch] = useReducer(reducer, { index: 0, history: [] });
  const quote = quotes[index];
  const verse = quote.form === "verse";
  // Every next/undo changes the history length, so it identifies each change.
  const change = history.length;
  const { cardRef, areaRef, quoteRef } = useFitQuote(change);

  return (
    <div className={styles.moment}>
      <figure ref={cardRef} className={styles.card} data-testid="quote-card">
        <div key={change} className={styles.content}>
          <div ref={areaRef} className={styles.quoteArea}>
            <blockquote
              ref={quoteRef}
              className={verse ? `${styles.quote} ${styles.verse}` : styles.quote}
              aria-live="polite"
              data-testid="quote-text"
            >
              {verse
                ? quote.text.split("\n").map((line, i) => (
                    <span key={i} className={styles.line}>
                      {line}
                    </span>
                  ))
                : `“${quote.text}”`}
            </blockquote>
          </div>
          <figcaption className={styles.credit} data-testid="quote-credit">
            {quote.credit}
          </figcaption>
        </div>
      </figure>

      <button
        type="button"
        className={styles.journal}
        data-testid="journal-button"
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
          data-testid="undo-button"
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
          data-testid="next-quote-button"
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
