# PoAP ("Plan on a Page") — project conventions

## Core principle: one behavior, every screen

This app has exactly one calendar component (`PoapRenderer`) reused everywhere
a Gantt-style grid of swimlines appears: the Program page (rows = projects),
a Project page's top level (rows = real team lanes + the project-plan anchor
lane), and every drilled-in level inside a project (Equipo → its Plans,
Plan → its Fases). **Any interactive capability added to a swimline row —
delete, reorder, add-a-new-one-below, rename, whatever comes next — must be
wired at every one of those levels, not just the one screen it was designed
against.** The row-level UI (which buttons render, where, in what state) stays
identical everywhere; only the mutation each button calls changes, since
"delete this row" means a different underlying call depending on whether the
row is a project, a team lane, a Plan, or a Fase.

Concretely: when you add a new prop to `PoapRendererProps`
(`src/components/poap-renderer/types.ts`) for a per-row action, grep every
`<PoapRenderer` call site (`src/app/page.tsx`, and every drill branch in
`src/app/project/[projectId]/page.tsx`) and wire it there too, mapped to
whatever that level's real mutation is. Leaving it wired on only one call
site is the single most common way this app has drifted into "the feature
works here but not there" — treat an unwired call site as a bug, not a
follow-up.

This is *the* thing to get right before anything else — the whole point of
the app is that Programa → Proyecto → Equipo → Plan → Fase → Actividad is one
recursive canvas, not six different screens that happen to look similar.

## Design system baseline

- **Buttons are squares or rectangles with rounded corners — never a full
  circle.** Every clickable button in the app picks one of `globals.css`'s
  radius tokens (`--radius-dot` through `--radius-3xl`) sized so the corner
  stays visibly a corner instead of rounding the whole shape into a pill —
  see that token block's own usage rule (pick the largest radius where
  2×radius stays under the control's shortest side). Never apply
  `--radius-full` or a 50% radius to a `<button>` itself, and never bring in
  a third-party component's default circular button styling unreviewed (the
  date-range picker's day-cell buttons needed an explicit override for
  exactly this). This does NOT apply to non-button decoration that
  conventionally reads as round — a toggle switch's track/thumb, a small
  notification-count badge, a status dot — those keep whatever shape suits
  their own role. Panels/cards/pills are a separate question and keep
  whatever radius they already have unless told otherwise.
- **Icons are never bold by default.** `strokeWidth` stays at the shared
  default (`src/lib/icons.tsx`'s `icon()` wrapper) for a resting icon; a
  heavier/filled treatment is reserved for genuinely *selected/active* state
  (e.g. the current zoom level, the active sidebar destination), never a
  static style choice.
- **Swimline labels share one font-family and one font-size** — no
  per-level or per-lane-type (anchor vs. team) divergence in the label
  column's typography.
- One consistent header pattern across every page: a small breadcrumb
  showing the full path (Programa › Proyecto › Equipo › Plan › Fase, however
  deep the current view is) sits above the page's own title, which is
  followed by its meta/stats subtext line.

## Verification standard

Every UI change gets checked live with Playwright against a mocked Supabase
fixture (the sandbox has no route to the real database) before being called
done — reading the code is not enough, this project has repeatedly shipped
bugs (wrong z-index, clipped overlays, a feature only wired on one page)
that were invisible until rendered. How much to check scales with the
change's blast radius, using the same shared-vs-isolated split as "one
behavior, every screen" above:

- **Tier 1 — Isolated.** CSS/copy/markup confined to a component that is
  *not* reused across drill levels (a single panel's own styling, one-off
  copy), with no logic or data-derivation change. Verify with one
  screenshot, cropped to the changed component, in one theme.
- **Tier 2 — Shared.** Anything touching `PoapRenderer`, `ExplorerPanel`,
  `portfolio.ts`, or any new/changed prop on `PoapRendererProps` — i.e.
  anything the "one behavior, every screen" rule already flags as needing
  to be wired everywhere. Verify with the full dark/light/mobile sweep, and
  capture at least two different drill levels or call sites (e.g. Program
  page + a drilled-in project view), not just the screen the change was
  designed against — this is what actually catches "works here, not there."
- **Before every push**, regardless of how the individual changes in the
  batch were tiered: run `npx vitest run` and `npm run build` once over the
  whole accumulated batch, and if the batch contains any Tier 2 change, run
  one final full dark/light/mobile sweep before shipping.
