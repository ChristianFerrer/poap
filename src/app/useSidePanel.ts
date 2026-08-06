"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { SidePanelMode } from "./SettingsPanel";

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
 * Project detail page — width/resize, the "fixed" dock's independent show/
 * hide state, and the click-outside-to-close behavior. What actually gets
 * rendered inside the panel (and which of the caller's own booleans track
 * "is something open") stays with the caller; this hook only owns the
 * panel-chrome behavior that's identical everywhere it appears.
 *
 * `isOpen` is the caller's own "is any of my panels open" (e.g.
 * explorer/gatesPanelOpen/importOpen/settingsOpen for a project page, or
 * just settingsOpen for the Program page). `onCloseAll` clears every one
 * of those — used both by the outside-click effect and by closePanel's
 * "overlay" branch.
 */
export function useSidePanel({
  sidePanelMode,
  isOpen,
  onCloseAll,
}: {
  sidePanelMode: SidePanelMode;
  isOpen: boolean;
  onCloseAll: () => void;
}) {
  const [panelWidth, setPanelWidth] = useState(panelWidthDefault);
  // "Fixed" mode only: whether the docked panel is actually shown.
  // Independent of the caller's own open-state, which tracks *what* it
  // would show — closing (X) in fixed mode hides the dock without
  // forgetting what was open, so reactivating it (the sidebar's panel
  // toggle) restores the same content instead of resetting to empty.
  const [fixedPanelVisible, setFixedPanelVisible] = useState(false);
  const sidePanelWrapperRef = useRef<HTMLDivElement>(null);
  // Whichever forwardRef panel component (ExplorerPanel/GatesPanel/
  // ImportPanel/SettingsPanel) is currently rendered gets this same ref —
  // scrollToPanel doesn't need to know which one it is.
  const panelRef = useRef<HTMLDivElement>(null);

  // On narrow viewports the panel stacks below the calendar instead of
  // sitting beside it — bring it into view there, since opening it can
  // otherwise happen off-screen with no indication anything happened.
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

  // Click-outside-to-close — only meaningful in "overlay" mode, since a
  // "fixed" panel is docked in the layout permanently and closing it on an
  // outside click would fight the whole point of pinning it. Attached only
  // while a panel is actually open, so it never intercepts the mousedown
  // that opens the very first panel.
  useEffect(() => {
    if (sidePanelMode !== "overlay") return;
    if (!isOpen) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      // The undo toast (see UndoToast.tsx) renders outside the panel
      // wrapper on purpose — it has to stay visible after a delete closes
      // whatever panel triggered it — so a click on "Deshacer"/"Undo"
      // itself must not read as "outside the panel" and close it too.
      if ((target as HTMLElement).closest?.("[data-undo-toast]")) return;
      if (sidePanelWrapperRef.current && !sidePanelWrapperRef.current.contains(target)) {
        onCloseAll();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidePanelMode, isOpen]);

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

  // Shared close ("X") handler for whichever panel is currently showing.
  // In "overlay" mode this clears the caller's content, which is enough to
  // make the whole floating panel disappear (it's only ever rendered while
  // something is open). In "fixed" mode the docked panel would otherwise
  // stay put forever — clearing content wouldn't remove it, it'd just show
  // the empty-state placeholder — so this hides the dock instead, without
  // forgetting what was open.
  function closePanel() {
    if (sidePanelMode === "fixed") {
      setFixedPanelVisible(false);
      return;
    }
    onCloseAll();
  }

  function revealFixedPanel() {
    setFixedPanelVisible(true);
  }

  // Unconditional, unlike closePanel — used by "Home", which always means
  // "just the calendar" regardless of side-panel mode, not just "close
  // whatever's open right now".
  function hideFixedPanel() {
    setFixedPanelVisible(false);
  }

  function toggleFixedPanel() {
    setFixedPanelVisible((v) => !v);
  }

  return {
    panelWidth,
    fixedPanelVisible,
    sidePanelWrapperRef,
    panelRef,
    scrollToPanel,
    startResize,
    closePanel,
    revealFixedPanel,
    hideFixedPanel,
    toggleFixedPanel,
  };
}
