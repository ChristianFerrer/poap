"use client";

import { IconClose, IconWarning } from "@/lib/icons";
import { useLanguage } from "./i18n/LanguageProvider";
import styles from "./NotificationsPopup.module.css";

/** One actionable "needs attention" item — the same linkage/plan issues
 * that used to render inline inside ExplorerPanel's own lanes/phases view
 * (see git history's LinkageBanner) now surface here instead, reachable
 * from anywhere via the notification bell rather than only once you've
 * already drilled into the right panel. message/actionLabel are pre-
 * formatted by the caller (Program vs Project page each have their own
 * locale strings + navigation target for the same issue shape). */
export interface NotificationAlert {
  id: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
}

export function NotificationsPopup({
  alerts,
  onClose,
  onAlertAction,
}: {
  alerts: NotificationAlert[];
  onClose: () => void;
  onAlertAction: (alert: NotificationAlert) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className={styles.popup} role="dialog" aria-label={t.linkage.bannerTitle}>
      <div className={styles.header}>
        <p className={styles.title}>
          {t.linkage.bannerTitle}
          {alerts.length > 0 && <span className={styles.count}>{alerts.length}</span>}
        </p>
        <button type="button" className={styles.close} onClick={onClose} aria-label={t.explorer.close} title={t.explorer.close}>
          <IconClose />
        </button>
      </div>
      {alerts.length === 0 ? (
        <p className={styles.empty}>{t.linkage.empty}</p>
      ) : (
        <ul className={styles.list}>
          {alerts.map((alert) => (
            <li key={alert.id} className={styles.item}>
              <div className={styles.itemHead}>
                <IconWarning />
                <span className={styles.message}>{alert.message}</span>
              </div>
              <button type="button" className={styles.fixButton} onClick={() => onAlertAction(alert)}>
                {alert.actionLabel}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
