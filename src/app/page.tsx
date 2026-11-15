import QuoteView from "@/components/QuoteView";
import WaveBackground from "@/components/WaveBackground";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <WaveBackground />

      <header className={styles.header}>
        <span className={styles.brand}>moodlift.</span>
      </header>

      <main className={styles.main}>
        <h1 className={styles.srOnly}>MoodLift quotes</h1>
        <QuoteView />
      </main>
    </div>
  );
}
