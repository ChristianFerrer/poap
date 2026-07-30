"use client";

import { forwardRef } from "react";
import { useLanguage } from "./i18n/LanguageProvider";
import { IconClose } from "@/lib/icons";
import styles from "./SettingsPanel.module.css";

export type SidePanelMode = "overlay" | "fixed";
export type NavPosition = "left" | "right";

/**
 * App-level display preferences — everything here is purely about how the
 * calendar/panels present themselves, not about the plan's data, so it
 * lives as plain lifted state in page.tsx (see AppSettings there) rather
 * than mixed in with lanes/gates/activities.
 */
export const SettingsPanel = forwardRef<HTMLDivElement, {
  showWeekends: boolean;
  onShowWeekendsChange: (value: boolean) => void;
  showToday: boolean;
  onShowTodayChange: (value: boolean) => void;
  sidePanelMode: SidePanelMode;
  onSidePanelModeChange: (value: SidePanelMode) => void;
  navPosition: NavPosition;
  onNavPositionChange: (value: NavPosition) => void;
  onClose: () => void;
}>(function SettingsPanel(
  {
    showWeekends,
    onShowWeekendsChange,
    showToday,
    onShowTodayChange,
    sidePanelMode,
    onSidePanelModeChange,
    navPosition,
    onNavPositionChange,
    onClose,
  },
  ref,
) {
  const { t } = useLanguage();

  return (
    <section ref={ref} className={styles.panel}>
      <button className={styles.close} onClick={onClose} aria-label={t.settings.close}><IconClose /></button>
      <p className={styles.eyebrow}>{t.settings.eyebrow}</p>
      <h2 className={styles.title}>{t.settings.title}</h2>

      <div className={styles.group}>
        <p className={styles.sectionTitle}>{t.settings.weekendsSection}</p>
        <Switch
          checked={showWeekends}
          onChange={onShowWeekendsChange}
          label={t.settings.weekendsToggleLabel}
          hint={t.settings.weekendsToggleHint}
        />
      </div>

      <div className={styles.group}>
        <p className={styles.sectionTitle}>{t.settings.todaySection}</p>
        <Switch
          checked={showToday}
          onChange={onShowTodayChange}
          label={t.settings.todayToggleLabel}
          hint={t.settings.todayToggleHint}
        />
      </div>

      <div className={styles.group}>
        <p className={styles.sectionTitle}>{t.settings.panelModeSection}</p>
        <div className={styles.optionRow}>
          <span className={styles.optionLabel}>{t.settings.panelModeLabel}</span>
          <OptionGroup
            value={sidePanelMode}
            onChange={onSidePanelModeChange}
            options={[
              { value: "overlay", label: t.settings.panelModeOverlay },
              { value: "fixed", label: t.settings.panelModeFixed },
            ]}
            ariaLabel={t.settings.panelModeLabel}
          />
        </div>
        <p className={styles.optionHint}>{t.settings.panelModeHint}</p>
      </div>

      <div className={styles.group}>
        <p className={styles.sectionTitle}>{t.settings.navSection}</p>
        <div className={styles.optionRow}>
          <span className={styles.optionLabel}>{t.settings.navPositionLabel}</span>
          <OptionGroup
            value={navPosition}
            onChange={onNavPositionChange}
            options={[
              { value: "left", label: t.settings.navLeft },
              { value: "right", label: t.settings.navRight },
            ]}
            ariaLabel={t.settings.navPositionLabel}
          />
        </div>
      </div>
    </section>
  );
});

function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <div className={styles.switchRow}>
      <span className={styles.switchText}>
        <span className={styles.switchLabel}>{label}</span>
        <span className={styles.switchHint}>{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`${styles.switchTrack} ${checked ? styles.switchTrackOn : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.switchThumb} />
      </button>
    </div>
  );
}

/** Two/three-way exclusive choice, same visual language as the ES/EN
 * switch in the header — a small pill group rather than a <select>, since
 * every option here is always visible at a glance. */
function OptionGroup<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
}) {
  return (
    <div className={styles.optionGroup} role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`${styles.optionButton} ${opt.value === value ? styles.optionButtonActive : ""}`}
          onClick={() => onChange(opt.value)}
          aria-pressed={opt.value === value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
