/** Small flat/outline icon set shared across the app's panels — plain
 * inline SVG (currentColor stroke) so each one inherits its button's text
 * color and sizes with font-size, no icon font or asset loading needed. */

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
