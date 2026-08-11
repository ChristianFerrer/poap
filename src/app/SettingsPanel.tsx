"use client";

import { forwardRef, useState } from "react";
import { useLanguage } from "./i18n/LanguageProvider";
import type { ProgramRow } from "@/lib/db";
import type { Theme } from "./useAppSettings";
import { IconClose } from "@/lib/icons";
import { SwitchToggle } from "./SwitchToggle";
import styles from "./SettingsPanel.module.css";
import explorerStyles from "./ExplorerPanel.module.css";

// The calendar's own duration cap — every renderer loop (month/day columns,
// zoom-level scaling) already handles this fine structurally, but nothing
// stops someone from typing an enormous number of months by hand. Keeping
// the timeline to a bounded, human-scale range (five years) is the actual
// requirement, not a rendering limitation.
const MAX_CALENDAR_MONTHS = 60;

/**
 * App-level display preferences — theme, calendar range, program name —
 * shared by every page, same as weekends/today above.
 */
export const SettingsPanel = forwardRef<HTMLDivElement, {
  theme: Theme;
  onThemeChange: (value: Theme) => void;
  showWeekends: boolean;
  onShowWeekendsChange: (value: boolean) => void;
  showToday: boolean;
  onShowTodayChange: (value: boolean) => void;
  program: ProgramRow;
  onUpdateProgram: (patch: Partial<Pick<ProgramRow, "name" | "startMonth" | "months">>) => void;
  onClose: () => void;
}>(function SettingsPanel(
  {
    theme,
    onThemeChange,
    showWeekends,
    onShowWeekendsChange,
    showToday,
    onShowTodayChange,
    program,
    onUpdateProgram,
    onClose,
  },
  ref,
) {
  const { t, locale, setLocale } = useLanguage();
  const [tab, setTab] = useState<SettingsTab>("appearance");

  return (
    <section ref={ref} className={styles.panel}>
      <button className={styles.close} onClick={onClose} aria-label={t.settings.close}><IconClose /></button>
      <p className={styles.eyebrow}>{t.settings.eyebrow}</p>
      <h2 className={styles.title}>{t.settings.title}</h2>

      <div className={styles.tabsRow}>
        <OptionGroup
          value={tab}
          onChange={setTab}
          options={[
            { value: "appearance", label: t.settings.tabAppearance },
            { value: "calendar", label: t.settings.tabCalendar },
            { value: "data", label: t.settings.tabData },
          ]}
          ariaLabel={t.settings.tabsAria}
        />
      </div>

      {tab === "appearance" && (
        <>
          <div className={styles.group}>
            <p className={styles.sectionTitle}>{t.settings.languageSection}</p>
            <div className={styles.optionRow}>
              <span className={styles.optionLabel}>{t.settings.languageLabel}</span>
              <OptionGroup
                value={locale}
                onChange={setLocale}
                options={[
                  { value: "es", label: "ES" },
                  { value: "en", label: "EN" },
                ]}
                ariaLabel={t.header.languageAria}
              />
            </div>
          </div>

          <div className={styles.group}>
            <p className={styles.sectionTitle}>{t.settings.themeSection}</p>
            <div className={styles.optionRow}>
              <span className={styles.optionLabel}>{t.settings.themeLabel}</span>
              <OptionGroup
                value={theme}
                onChange={onThemeChange}
                options={[
                  { value: "dark", label: t.settings.themeDark },
                  { value: "light", label: t.settings.themeLight },
                  { value: "rainbow", label: t.settings.themeRainbow },
                ]}
                ariaLabel={t.settings.themeLabel}
              />
            </div>
          </div>

        </>
      )}

      {tab === "calendar" && (
        <>
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
            <p className={styles.sectionTitle}>{t.settings.calendarRangeSection}</p>
            <p className={styles.optionHint}>{t.settings.calendarRangeHint}</p>
            <div className={explorerStyles.addRow}>
              <input
                type="month"
                className={explorerStyles.statusSelect}
                value={program.startMonth}
                onChange={(e) => e.target.value && onUpdateProgram({ startMonth: e.target.value })}
                aria-label={t.settings.programStartAria}
              />
              <input
                type="number"
                min={1}
                max={MAX_CALENDAR_MONTHS}
                className={explorerStyles.statusSelect}
                value={program.months}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value));
                  if (Number.isFinite(n) && n >= 1) onUpdateProgram({ months: Math.min(n, MAX_CALENDAR_MONTHS) });
                }}
                aria-label={t.settings.programMonthsAria}
              />
            </div>
            <p className={styles.optionHint}>{t.settings.calendarRangeYears(program.months)}</p>
          </div>
        </>
      )}

      {tab === "data" && (
        <>
          <div className={styles.group}>
            <p className={styles.sectionTitle}>{t.settings.programSection}</p>
            <p className={styles.optionHint}>{t.settings.programHint}</p>
            <div className={explorerStyles.addRow}>
              <input
                className={explorerStyles.textInput}
                value={program.name}
                onChange={(e) => onUpdateProgram({ name: e.target.value })}
                aria-label={t.settings.programNameAria}
              />
            </div>
          </div>

        </>
      )}
    </section>
  );
});

type SettingsTab = "appearance" | "calendar" | "data";

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
      <SwitchToggle checked={checked} onChange={onChange} ariaLabel={label} />
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
