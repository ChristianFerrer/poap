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

- **Buttons are square** (no rounded corners) everywhere in the app —
  `border-radius: 0` on every button class in `src/app/buttons.module.css`
  and any component-local button style. Panels/cards/pills are a separate
  question and keep whatever radius they already have unless told otherwise.
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

Before calling any UI change done, launch the dev server and check it with
Playwright against a mocked Supabase fixture (the sandbox has no route to
the real database) — this session has repeatedly caught real bugs (wrong
z-index, clipped overlays, a feature only wired on one page) that were
invisible from reading the code alone. Screenshot both the change itself and
at least one adjacent/mobile viewport before reporting success.
