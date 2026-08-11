"use client";

import { IconBell } from "@/lib/icons";
import { useLanguage } from "./i18n/LanguageProvider";
import styles from "./NotificationBell.module.css";

/**
 * A permanent, viewport-fixed control (not part of any one page's own
 * header flow) — top-right on every page, above even an open side panel,
 * so it's never the one thing a Project-page panel session hides. The
 * badge count is real data the caller already computes for its own
 * purposes elsewhere (linkage/plan issues — see Sidebar's own
 * `issuesCount`), not a mock number; this is just a second, more
 * globally-visible place to surface the same figure.
 */
export function NotificationBell({ count, onClick }: { count: number; onClick?: () => void }) {
  const { t } = useLanguage();
  const label = count > 0 ? t.notifications.bellAriaWithCount(count) : t.notifications.bellAria;
  return (
    <button type="button" className={styles.bell} onClick={onClick} aria-label={label} title={label}>
      <IconBell />
      {count > 0 && <span className={styles.badge}>{count > 99 ? "99+" : count}</span>}
    </button>
  );
}
