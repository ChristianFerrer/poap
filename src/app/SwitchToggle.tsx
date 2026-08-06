"use client";

import styles from "./SwitchToggle.module.css";

/**
 * The app's one on/off control — a track+thumb toggle, no label of its own
 * (callers own their own label/hint text, or in a table cell, the row's
 * name column already is the label). Used both as Settings' full switch
 * rows and as GatesPanel's per-gate visibility toggle, which used to be a
 * second, circular toggle metaphor with its own meaning to learn.
 */
export function SwitchToggle({
  checked,
  onChange,
  ariaLabel,
  size = "md",
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  ariaLabel: string;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={`${styles.track} ${size === "sm" ? styles.trackSm : ""} ${checked ? styles.trackOn : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.thumb} />
    </button>
  );
}
