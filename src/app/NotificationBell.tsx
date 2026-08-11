"use client";

import { useEffect, useRef, useState } from "react";
import { IconBell } from "@/lib/icons";
import { useLanguage } from "./i18n/LanguageProvider";
import { NotificationsPopup, type NotificationAlert } from "./NotificationsPopup";
import styles from "./NotificationBell.module.css";

export type { NotificationAlert };

/**
 * A permanent, viewport-fixed control (not part of any one page's own
 * header flow) — top-right on every page, above even an open side panel,
 * so it's never the one thing a Project-page panel session hides. Clicking
 * it opens its own popup listing every real pending-links alert (the same
 * data Sidebar's own `issuesCount` badge counts) rather than jumping
 * straight to the first one, so every alert is reachable from anywhere,
 * not just whichever page happens to have it in view.
 */
export function NotificationBell({ alerts }: { alerts: NotificationAlert[] }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const count = alerts.length;
  const label = count > 0 ? t.notifications.bellAriaWithCount(count) : t.notifications.bellAria;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.bell}
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        title={label}
        aria-expanded={open}
      >
        <IconBell />
        {count > 0 && <span className={styles.badge}>{count > 99 ? "99+" : count}</span>}
      </button>
      {open && (
        <NotificationsPopup
          alerts={alerts}
          onClose={() => setOpen(false)}
          onAlertAction={(alert) => {
            alert.onAction();
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
