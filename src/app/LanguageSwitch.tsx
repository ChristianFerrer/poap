"use client";

import type { Locale } from "@/lib/i18n";
import styles from "./page.module.css";

/** ES/EN toggle — two buttons rather than a <select>, since there are only
 * ever two options and the current one should be visible at a glance
 * without opening anything. Shared by the Program and every Project page. */
export function LanguageSwitch({
  locale,
  onChange,
  ariaLabel,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
  ariaLabel: string;
}) {
  return (
    <div className={styles.languageSwitch} role="group" aria-label={ariaLabel}>
      {(["es", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          className={`${styles.languageButton} ${l === locale ? styles.languageButtonActive : ""}`}
          onClick={() => onChange(l)}
          aria-pressed={l === locale}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
