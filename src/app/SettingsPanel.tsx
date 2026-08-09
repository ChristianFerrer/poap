"use client";

import { forwardRef, useState } from "react";
import { useLanguage } from "./i18n/LanguageProvider";
import type { Project, StageCategoryDef } from "@/lib/portfolio";
import type { ProgramRow } from "@/lib/db";
import type { Theme } from "./useAppSettings";
import { IconClose, IconPlus, IconTrash } from "@/lib/icons";
import { SwitchToggle } from "./SwitchToggle";
import styles from "./SettingsPanel.module.css";
import explorerStyles from "./ExplorerPanel.module.css";

export type SidePanelMode = "overlay" | "fixed";
export type NavPosition = "left" | "right";

/**
 * App-level display preferences plus the two pieces of "app-wide"
 * management that don't belong to any one project — the stage lifecycle
 * taxonomy and the project list itself — since both are configuration a
 * user sets up once and expects everywhere, same as weekends/today or the
 * side-panel mode below.
 */
export const SettingsPanel = forwardRef<HTMLDivElement, {
  theme: Theme;
  onThemeChange: (value: Theme) => void;
  showWeekends: boolean;
  onShowWeekendsChange: (value: boolean) => void;
  showToday: boolean;
  onShowTodayChange: (value: boolean) => void;
  sidePanelMode: SidePanelMode;
  onSidePanelModeChange: (value: SidePanelMode) => void;
  navPosition: NavPosition;
  onNavPositionChange: (value: NavPosition) => void;
  stageCategories: StageCategoryDef[];
  onAddStageCategory: (label: string) => void;
  onRenameStageCategory: (id: string, label: string) => void;
  onDeleteStageCategory: (id: string) => void;
  program: ProgramRow;
  onUpdateProgram: (patch: Partial<Pick<ProgramRow, "name" | "startMonth" | "months">>) => void;
  projects: Project[];
  onDeleteProject: (id: string) => void;
  onClose: () => void;
}>(function SettingsPanel(
  {
    theme,
    onThemeChange,
    showWeekends,
    onShowWeekendsChange,
    showToday,
    onShowTodayChange,
    sidePanelMode,
    onSidePanelModeChange,
    navPosition,
    onNavPositionChange,
    stageCategories,
    onAddStageCategory,
    onRenameStageCategory,
    onDeleteStageCategory,
    program,
    onUpdateProgram,
    projects,
    onDeleteProject,
    onClose,
  },
  ref,
) {
  const { t, locale, setLocale } = useLanguage();
  const [newStage, setNewStage] = useState("");
  const [tab, setTab] = useState<SettingsTab>("appearance");

  function submitNewStage() {
    if (!newStage.trim()) return;
    onAddStageCategory(newStage.trim());
    setNewStage("");
  }

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
                ]}
                ariaLabel={t.settings.themeLabel}
              />
            </div>
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
                max={60}
                className={explorerStyles.statusSelect}
                value={program.months}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (n >= 1) onUpdateProgram({ months: n });
                }}
                aria-label={t.settings.programMonthsAria}
              />
            </div>
          </div>

          <div className={styles.group}>
            <p className={styles.sectionTitle}>{t.settings.stagesSection}</p>
            <p className={styles.optionHint}>{t.settings.stagesHint}</p>
            <div className={explorerStyles.addRow}>
              <input
                className={explorerStyles.textInput}
                placeholder={t.settings.newStagePlaceholder}
                value={newStage}
                onChange={(e) => setNewStage(e.target.value)}
              />
              <button type="button" className={explorerStyles.addButton} disabled={!newStage.trim()} onClick={submitNewStage}>
                <IconPlus /> {t.explorer.addButton}
              </button>
            </div>
            <div className={explorerStyles.listGroup}>
              {stageCategories.map((c) => (
                <div key={c.id} className={explorerStyles.addRow}>
                  <input
                    className={explorerStyles.textInput}
                    value={c.label}
                    onChange={(e) => onRenameStageCategory(c.id, e.target.value)}
                    aria-label={t.settings.stageNameAria}
                  />
                  <button
                    type="button"
                    className={explorerStyles.deleteButton}
                    onClick={() => onDeleteStageCategory(c.id)}
                    aria-label={t.settings.deleteStageAria(c.label)}
                  >
                    <IconTrash />
                  </button>
                </div>
              ))}
              {stageCategories.length === 0 && <p className={explorerStyles.emptyCell}>{t.settings.noStages}</p>}
            </div>
          </div>

          <div className={styles.group}>
            <p className={styles.sectionTitle}>{t.settings.projectsSection}</p>
            <div className={explorerStyles.listGroup}>
              {projects.map((p) => (
                <div key={p.id} className={explorerStyles.addRow}>
                  <span className={explorerStyles.tableNameCell}>{p.name}</span>
                  <button
                    type="button"
                    className={explorerStyles.deleteButton}
                    onClick={() => onDeleteProject(p.id)}
                    aria-label={t.settings.deleteProjectAria(p.name)}
                  >
                    <IconTrash />
                  </button>
                </div>
              ))}
              {projects.length === 0 && <p className={explorerStyles.emptyCell}>{t.settings.noProjects}</p>}
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
