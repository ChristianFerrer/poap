"use client";

import { useLayoutEffect, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker, type DateRange } from "react-day-picker";
import { es as rdpEs, enUS as rdpEnUS } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { MONTH_ABBR } from "@/lib/i18n";
import { useLanguage } from "./i18n/LanguageProvider";
import styles from "./DateRangeField.module.css";

const RDP_LOCALE = { es: rdpEs, en: rdpEnUS };

/** `<input type="date">`'s "yyyy-mm-dd" <-> a local-midnight Date, kept
 * entirely in local calendar terms (no UTC conversion either direction) so
 * the round trip can never shift a day at a timezone boundary. */
function parseISO(iso: string): Date | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatShort(date: Date, monthAbbr: string[]): string {
  return `${date.getDate()} ${monthAbbr[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`;
}

/**
 * Single-calendar start/end date picker — click a start day, then an end
 * day, same gesture as a hotel-booking site, instead of two separate native
 * `<input type="date">` fields that made it easy to end up with an end
 * before the start. Wraps react-day-picker's range mode (which already
 * implements exactly that click-click-highlight interaction) behind a
 * trigger button styled like the app's other form fields.
 *
 * onChange only fires once a *complete* range is picked (or on explicit
 * Clear) — an in-progress pick (start chosen, end not yet) stays local to
 * the open popover so it never half-commits a phase/activity to a missing
 * end date. That mirrors what the native two-input version already
 * required (its Add button stayed disabled until both fields had a value).
 *
 * The popover renders through a portal into document.body, positioned with
 * `position: fixed` off the trigger's own bounding rect, rather than as a
 * normal absolutely-positioned child — several call sites (the phase table,
 * the side panel body) sit inside an `overflow: auto`/`overflow-x: auto`
 * ancestor, which would otherwise clip a same-subtree popover the moment it
 * grew taller/wider than that ancestor's scroll box.
 */
export function DateRangeField({
  startValue,
  endValue,
  onChange,
  ariaLabel,
  disabled,
  className,
}: {
  startValue: string;
  endValue: string;
  onChange: (start: string, end: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}) {
  const { t, locale } = useLanguage();
  const monthAbbr = MONTH_ABBR[locale];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(() => ({
    from: parseISO(startValue),
    to: parseISO(endValue),
  }));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Re-sync the draft from props whenever the field is closed — an outside
  // click/Escape discards an in-progress pick, so the next open should
  // start from what's actually committed, not a stale abandoned draft.
  useEffect(() => {
    if (open) return;
    setDraft({ from: parseISO(startValue), to: parseISO(endValue) });
  }, [open, startValue, endValue]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Pins the portaled popover under the trigger and keeps it inside the
  // viewport — recomputed on open, and live on scroll/resize since a fixed
  // position otherwise drifts away from its trigger the moment any
  // scrollable ancestor (the panel body, the phase table) scrolls.
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const trigger = triggerRef.current;
      const pop = popoverRef.current;
      if (!trigger || !pop) return;
      const rect = trigger.getBoundingClientRect();
      const popRect = pop.getBoundingClientRect();
      let left = rect.left;
      let top = rect.bottom + 6;
      if (left + popRect.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - popRect.width - 8);
      if (top + popRect.height > window.innerHeight - 8) top = Math.max(8, rect.top - popRect.height - 6);
      pop.style.top = `${top}px`;
      pop.style.left = `${left}px`;
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  function handleSelect(next: DateRange | undefined) {
    setDraft(next);
    if (next?.from && next?.to) {
      onChange(toISO(next.from), toISO(next.to));
      setOpen(false);
    }
  }

  function clear() {
    setDraft(undefined);
    onChange("", "");
    setOpen(false);
  }

  const committedFrom = parseISO(startValue);
  const committedTo = parseISO(endValue);
  // While open with a start picked but no end yet, the trigger reflects
  // that in-progress pick rather than whatever was last committed — the
  // hotel-style flow is "start, then end", so the label should track
  // where the user currently is in that flow, not freeze on the old value.
  const label =
    open && draft?.from && !draft?.to
      ? `${formatShort(draft.from, monthAbbr)} – ${t.dateRange.selectEnd}`
      : committedFrom && committedTo
        ? `${formatShort(committedFrom, monthAbbr)} – ${formatShort(committedTo, monthAbbr)}`
        : t.dateRange.placeholder;

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={`${styles.trigger} ${className ?? ""}`}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        {label}
      </button>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className={styles.popover}
            role="dialog"
            aria-label={t.dateRange.dialogAria}
            data-date-range-popover
          >
            <DayPicker
              mode="range"
              resetOnSelect
              selected={draft}
              onSelect={handleSelect}
              defaultMonth={draft?.from ?? new Date()}
              locale={RDP_LOCALE[locale]}
              weekStartsOn={1}
              labels={{
                labelPrevious: () => t.dateRange.prevMonth,
                labelNext: () => t.dateRange.nextMonth,
              }}
            />
            <div className={styles.actions}>
              <button type="button" className={styles.clearButton} onClick={clear}>
                {t.dateRange.clear}
              </button>
              <button type="button" className={styles.doneButton} onClick={() => setOpen(false)}>
                {t.dateRange.done}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
