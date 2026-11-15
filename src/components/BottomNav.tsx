import { BookOpen, Heart, Quote, type LucideIcon } from "lucide-react";
import styles from "./BottomNav.module.css";

type NavItem = { label: string; icon: LucideIcon };

// Draft navigation from the Figma "Bottom navigation" component.
// Not wired up yet: Quotes is shown as the current page.
const ITEMS: NavItem[] = [
  { label: "Mood", icon: Heart },
  { label: "Quotes", icon: Quote },
  { label: "Journal", icon: BookOpen },
];

const ACTIVE = "Quotes";

export default function BottomNav() {
  return (
    <nav className={styles.nav} aria-label="Main" data-testid="bottom-nav">
      {ITEMS.map(({ label, icon: Icon }) => {
        const active = label === ACTIVE;
        return (
          <button
            key={label}
            type="button"
            className={styles.item}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={20} strokeWidth={active ? 2.25 : 2} aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
