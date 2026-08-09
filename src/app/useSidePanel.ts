"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

const PANEL_WIDTH_DEFAULT = 400;
const PANEL_WIDTH_MIN = 320;

// The panel can grow up to half the viewport, never more — read live off
// window.innerWidth rather than a fixed px cap, since "half the screen" is
// relative to whatever device this loads on.
function panelWidthMax(): number {
  return typeof window === "undefined" ? PANEL_WIDTH_DEFAULT : Math.floor(window.innerWidth * 0.5);
}

// Opens at 30% of the viewport rather than the old "always maxed out"
// default — the drag handle still lets you grow it from there, up to
// panelWidthMax.
function panelWidthDefault(): number {
  return typeof window === "undefined" ? PANEL_WIDTH_DEFAULT : Math.floor(window.innerWidth * 0.3);
}

/**
 * Shared side-panel plumbing for both the Program portfolio page and every
 * Project detail page — width/resize and the click-outside-to-close
 * behavior for the floating overlay panel. What actually gets rendered
 * inside the panel (and which of the caller's own booleans track "is
 * something open") stays with the caller; this hook only owns the
 * panel-chrome behavior that's identical everywhere it appears.
 *
 * `isOpen` is the caller's own "is any of my panels open" (e.g.
 * explorer/gatesPanelOpen/importOpen/settingsOpen for a project page, or
 * just settingsOpen for the Program page). `onCloseAll` clears every one
 * of those — used both by the outside-click effect and by closePanel.
 */
export function useSidePanel({ isOpen, onCloseAll }: { isOpen: boolean; onCloseAll: () => void }) {
  const [panelWidth, setPanelWidth] = useState(panelWidthDefault);
  const sidePanelWrapperRef = useRef<HTMLDivElement>(null);
  // Whichever forwardRef panel component (ExplorerPanel/GatesPanel/
  // ImportPanel/SettingsPanel) is currently rendered gets this same ref —
  // scrollToPanel doesn't need to know which one it is.
  const panelRef = useRef<HTMLDivElement>(null);

  // Brings the panel into view the moment it opens — a no-op on desktop
  // (it's position:fixed, always on-screen already) but keeps a phone's
  // own scroll position from stranding it off the visible viewport.
  function scrollToPanel() {
    requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // If the window shrinks (e.g. rotating a tablet) below the panel's
  // current width, re-clamp it to the new 50% cap instead of leaving it
  // wider than half the screen until the next drag.
  useEffect(() => {
    function onResize() {
      setPanelWidth((w) => Math.min(w, panelWidthMax()));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Click-outside-to-close — attached only while a panel is actually open,
  // so it never intercepts the mousedown that opens the very first panel.
  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      // The undo toast (see UndoToast.tsx) renders outside the panel
      // wrapper on purpose — it has to stay visible after a delete closes
      // whatever panel triggered it — so a click on "Deshacer"/"Undo"
      // itself must not read as "outside the panel" and close it too.
      if ((target as HTMLElement).closest?.("[data-undo-toast]")) return;
      // Same reasoning for DateRangeField's calendar popover (see
      // DateRangeField.tsx) — it's portaled to document.body so it can
      // escape the panel body's own overflow clipping, which puts every
      // click inside it outside sidePanelWrapperRef's DOM subtree too.
      // Without this it would read as "outside the panel" and close the
      // whole panel on the very first day you click.
      if ((target as HTMLElement).closest?.("[data-date-range-popover]")) return;
      if (sidePanelWrapperRef.current && !sidePanelWrapperRef.current.contains(target)) {
        onCloseAll();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Drag-to-resize the side panel — the handle sits on the panel's left
  // edge, so dragging left (away from the right-anchored panel) grows it.
  // onMove/onUp are scoped to this one gesture and detached on mouseup
  // rather than living as a persistent listener.
  function startResize(e: ReactMouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelWidth;
    function onMove(ev: MouseEvent) {
      const next = startWidth + (startX - ev.clientX);
      setPanelWidth(Math.min(panelWidthMax(), Math.max(PANEL_WIDTH_MIN, next)));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return {
    panelWidth,
    sidePanelWrapperRef,
    panelRef,
    scrollToPanel,
    startResize,
    closePanel: onCloseAll,
  };
}
