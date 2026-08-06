"use client";

import { useProjects } from "./ProjectsProvider";
import { useLanguage } from "./i18n/LanguageProvider";
import { IconClose } from "@/lib/icons";
import styles from "./UndoToast.module.css";

/**
 * The single, app-wide undo affordance every delete announces itself
 * through (see ProjectsProvider.announceUndo) — rendered once here rather
 * than inside each page, since it needs to survive whichever page is
 * mounted and there's only ever one pending delete at a time anyway.
 */
export function UndoToast() {
  const { pendingUndo, consumeUndo, dismissUndo } = useProjects();
  const { t } = useLanguage();

  if (!pendingUndo) return null;

  return (
    <div className={styles.toast} role="status" aria-live="polite" data-undo-toast>
      <span className={styles.message}>{pendingUndo.message}</span>
      <button type="button" className={styles.undoButton} onClick={consumeUndo}>
        {t.undo.undoButton}
      </button>
      <button type="button" className={styles.dismiss} onClick={dismissUndo} aria-label={t.undo.dismissAria}>
        <IconClose />
      </button>
    </div>
  );
}
