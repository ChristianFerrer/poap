/** Flat/outline icon set shared across the whole app, including
 * poap-renderer/ — plain inline SVG (currentColor stroke) so each one
 * inherits its button's text color and sizes with font-size, no icon font
 * or asset loading needed. Lives in src/lib (not src/app) for the same
 * reason MONTH_ABBR/STATUS_LABELS do: it's pure, stateless, presentational
 * data that poap-renderer is allowed to depend on without breaking its
 * data-in/callback-out contract, unlike anything stateful in src/app. */

const base = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function IconClose() {
  return (
    <svg {...base}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function IconTrash() {
  return (
    <svg {...base}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  );
}

export function IconPlus() {
  return (
    <svg {...base}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconMinus() {
  return (
    <svg {...base}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function IconUpload() {
  return (
    <svg {...base}>
      <path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

export function IconChevronRight() {
  return (
    <svg {...base}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function IconChevronDown() {
  return (
    <svg {...base}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconCheck() {
  return (
    <svg {...base}>
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

export function IconSearch() {
  return (
    <svg {...base}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

export function IconSort() {
  return (
    <svg {...base}>
      <path d="M7 6v14M7 20l-3-3M7 20l3-3M17 18V4M17 4l-3 3M17 4l3 3" />
    </svg>
  );
}

export function IconHome() {
  return (
    <svg {...base}>
      <path d="M4 11 12 4l8 7M6 9.5V20h12V9.5" />
    </svg>
  );
}

export function IconGateDiamond() {
  return (
    <svg {...base}>
      <path d="M12 4 20 12 12 20 4 12Z" />
    </svg>
  );
}

export function IconLanes() {
  return (
    <svg {...base}>
      <path d="M4 7h16M4 12h10M4 17h13" />
    </svg>
  );
}

export function IconSettings() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M4.9 4.9l1.55 1.55M17.55 17.55 19.1 19.1M3 12h2.2M18.8 12H21M4.9 19.1l1.55-1.55M17.55 6.45 19.1 4.9" />
    </svg>
  );
}
