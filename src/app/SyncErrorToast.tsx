"use client";

import { IconClose } from "@/lib/icons";
import { useLanguage } from "./i18n/LanguageProvider";
import styles from "./SyncErrorToast.module.css";

/**
 * Every background database write in this app is fire-and-forget (see
 * src/lib/db.ts) — local state already has what the user typed, so a
 * failed write doesn't need to interrupt anything. It still needs to be
 * *visible* though: silently losing a write is worse than a local-only
 * in-memory app, since here the UI implies "this is saved" and without
 * this banner the only trace of a failure is a console.error nobody but
 * a developer would ever open devtools to see.
 */
export function SyncErrorToast({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  const { t } = useLanguage();
  if (!message) return null;

  return (
    <div className={styles.toast} role="alert">
      <span className={styles.message}>{t.sync.saveFailed(message)}</span>
      <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label={t.undo.dismissAria}>
        <IconClose />
      </button>
    </div>
  );
}
