import { Suspense } from "react";
import QuoteView from "@/components/QuoteView";
import WaveBackground from "@/components/WaveBackground";
import { fetchRandomQuotes, shuffledFallback } from "@/lib/quotes";
import styles from "./page.module.css";

// Fresh random quotes per request, streamed in after the static shell.
async function Quotes() {
  const initial = await fetchRandomQuotes(20).catch(() => shuffledFallback());
  return <QuoteView initial={initial.length ? initial : shuffledFallback()} />;
}

export default function Home() {
  return (
    <div className={styles.page}>
      <WaveBackground />

      <header className={styles.header}>
        <span className={styles.brand}>moodlift.</span>
      </header>

      <main className={styles.main}>
        <h1 className={styles.srOnly}>MoodLift quotes</h1>
        <Suspense fallback={<QuoteView initial={[]} placeholder />}>
          <Quotes />
        </Suspense>
      </main>
    </div>
  );
}
