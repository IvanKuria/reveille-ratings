# reveille-ratings — Design Spec

**Date:** 2026-06-29
**Status:** Approved design, pre-implementation
**Author:** Ivan Kuria (with Claude)

## Summary

`reveille-ratings` is a Chrome extension (WXT + React + TypeScript, MV3) that
injects Rate My Professors ratings — and TAMU grade distributions — into Texas
A&M University's **public, no-login class search**. It is the fourth sibling in
the RMP-injection extension family (`rate-my-slugs`/UCSC,
`buzz-ratings`/Georgia Tech, `aggie-ratings`/UC Davis, `buckeye-ratings`/Ohio
State).

The name is `reveille-ratings`, after Reveille, TAMU's mascot collie. "Aggie"
was unavailable — UC Davis is also "the Aggies" and owns `aggie-ratings`.

## Target portal (researched & verified live)

TAMU's student-facing Banner SSB UI (`compassxe-ssb.tamu.edu/StudentRegistrationSsb/...`)
is gated behind Howdy SSO and is **not** scrapeable. The **public** search is a
bespoke Apereo **uPortal portlet**:

- **URL:** `https://howdyportal.tamu.edu/uPortal/p/public-class-search-ui.ctf1/max/render.uP`
  (entry point `https://howdy.tamu.edu/main/activate/23`, no auth guard)
- **Rendering:** an **ag-Grid** table fed by a public JSON REST API
  (`POST /api/course-sections`, `GET /api/all-terms`). No token required.
- **Underlying SIS:** Banner 9 ("Compass XE") — but only as the data source;
  the public front-end is custom, so `buzz-ratings`' Banner-SSB DOM selectors do
  **not** transfer.
- **Instructor format:** full `"First M. Last (P)"`, where `(P)` marks the
  primary instructor. Full first names — favorable for RMP matching.
- **No Cloudflare** on `howdyportal.tamu.edu` (plain requests get HTTP 200), so
  the in-extension fetch works without a real-browser workaround.
- **Term codes:** Banner `YYYYC1` for College Station (the trailing `1` = CS
  campus): Fall 2026 = `202631`, Spring 2026 = `202611`, Summer 2026 = `202621`.

### ag-Grid virtualization — the central injection challenge

ag-Grid only keeps **visible** rows in the DOM and **destroys/recreates** row
nodes as the user scrolls. The other ports inject into static result tables and
mark each row processed; that approach fails here because a recycled row loses
any DOM marker or mounted node. Idempotency must therefore key on a stable **row
identity (CRN)** held in a `Set`, and re-injection must be cheap and repeatable
as rows recycle.

## RMP data

- **RMP school ID: `1003`** (`ratemyprofessors.com/school/1003`,
  "Texas A&M University at College Station").
- Matching uses the **full instructor name** — `rmpCache.ts`'s
  `generateSearchVariants` + first-initial pre-filter already handle
  `"First M. Last"`. No new matcher logic needed; only the school ID changes.

## Grade-distribution data

- **Source:** the TAMU Registrar's official public reports (Texas open-records),
  current and free:
  `https://web-as.tamu.edu/gradereports/Report?year=YYYY&term=FALL|SPRING|SUMMER&college=XX`
  — one **PDF** per college per term. Fall 2025 is already posted; the year
  dropdown covers a rolling 5 years. College codes come from the page's dropdown
  (EN, BA, AG, AT, AR, GB, NU, PH, GV, …; some `_PROF` variants).
- **PDF row shape:** grouped College → Department; each section row is
  `SUBJ-NUM-SEC | A B C D F | A–F total | GPA | I S U Q X | TOTAL | INSTRUCTOR`,
  e.g. `AERO-201-200  12 8 5 4 0  29  2.965  0 0 0 0 0  29  BHARGAVA D`.
  Sections with <5 students are FERPA-suppressed (simply absent).
- **Instructor format in grade data:** **last name + first initial only**
  (`BHARGAVA D`) — true of *every* public TAMU grade source. So grade matching
  is initials-only, the same constraint UC Davis taught us (see
  `aggie-ratings-portal` memory) — but here it is scoped to the grades layer;
  RMP still matches on the full name.

### Pipeline (chosen: bundle parsed official PDFs)

A repo **build/refresh script** (run by the maintainer, not at extension
runtime) downloads the registrar PDFs, parses them, and emits a compact bundled
JSON:

```
{ "<SUBJECT> <NUMBER>": [
    { "last": "bhargava", "initial": "d",
      "A": 12, "B": 8, "C": 5, "D": 4, "F": 0,
      "gpa": 2.965, "term": "202531" },
    ...
] }
```

Keyed by `(subject, number)`; each entry carries the instructor's
`(last, initial)`, A–F counts, GPA, and term. The script lives in the repo
(e.g. `scripts/build-grades/`) with a documented one-command refresh. Bundled
JSON ships under `public/data/`, mirroring how `rate-my-slugs` bundles
`prof_*.json`.

Rationale vs. alternatives: freshest data (Fall 2025 live), no third-party
runtime dependency, works offline. `anex.us`'s JSON API lags ~1 year, is
one-call-per-course, and discourages scraping; the ready-made GitHub datasets
(`SaltyQuetzals`, `grades.adibarra.com`/`TAMU-GradeDistribution`) are
archived/stale (2020 / Oct 2024).

### Grade matching & aggregation

For each portal instructor (full name) + course (`SUBJECT NUMBER`):
1. Reduce the portal name to `(last, first-initial)`, lowercased.
2. Look up `"<SUBJECT> <NUMBER>"` in the bundle; filter entries to the matching
   `(last, initial)`.
3. Aggregate all matching sections (across terms): sum A–F; compute an
   enrollment-weighted overall GPA.
4. Render via the existing `GradeDistribution` component (ported from
   `rate-my-slugs`).

Name-reduction watch-outs from the data: multi-word last names appear
undelimited (`VAN POPPEL B`) and compound names are ambiguous
(`TAKACHI TOMITA J` — surname vs. surname+middle). The reducer must take the
initial as the trailing single token and the last name as the remainder, and
tolerate misses (grades simply don't show rather than mis-attribute).

## Architecture & reuse map

Base template: **clone `aggie-ratings`** (the RMP-only bespoke-portal sibling),
which already stripped the UCSC UID/campus-directory machinery down to the
RMP-only core. Then rewrite the injection layer for ag-Grid and add the grades
layer.

| Layer | Source | Effort |
|---|---|---|
| RMP fetch + Fuse matcher (`lib/background/rmpCache.ts`) | `aggie-ratings` | swap `schoolId → 1003`; constants |
| React UI (`ProfessorPanel`, `RatingBar`, `StarRating`, settings, sidepanel) | `aggie-ratings` | ~verbatim; rebrand |
| `GradeDistribution` component + grade types | **port from `rate-my-slugs`** | adapt props to aggregated TAMU grades |
| Background messaging, settings, theme, hooks | `aggie-ratings` | verbatim |
| Photo layer (`lib/photo.ts`, `useProfessorPhoto`) | `aggie-ratings` | **drop** (out of scope) |
| **Injection** (`entrypoints/content.ts`) | **fresh rewrite** for ag-Grid | the bulk of the work |
| **Grades data + build script** | **new** | new |
| Branding (manifest, icons, colors, copy) | new | Reveille / maroon |

### Injection layer (rewrite of `aggie-ratings/content.ts`)

`aggie-ratings` already provides the right skeleton: a debounced
`MutationObserver` over the results container + an idempotent `scan()` +
per-row `processRow()` that injects a loading bar, asks the background worker for
RMP data, and removes the bar on no-match. Reveille reuses this control flow with
three deltas for ag-Grid:

1. **Cell injection, not sibling rows.** ag-Grid absolutely-positions rows, so we
   inject the badge **inside the instructor cell** rather than as a `<tr>`
   sibling. Click opens the sidepanel detail (unchanged pattern).
2. **CRN-keyed idempotency.** Replace the per-row `data-*-processed` attribute
   with a `Set<crn>` of rendered rows plus a check for an existing badge node in
   the cell, so recycled rows re-inject correctly and never double-inject.
   RMP/grade results are cached by name/course, so re-injection on a recycled row
   is instant.
3. **Parsing for ag-Grid + `null` UID.** Extract `instructorName` (strip `(P)`,
   take the primary; handle multi-instructor cells), `subject`, `number`, and
   `crn` from the ag-Grid row/cell DOM. Use the `null` UID convention (this
   family already replaced the legacy `'jdoe'` sentinel with `null`); the
   background keys the RMP cache by name.

**Open implementation detail (first task):** the exact ag-Grid DOM — viewport
container selector, per-cell `col-id`s for instructor/subject/number, and where
the CRN lives (row `row-id` vs. a cell) — was not pinned down by research.
Resolve it by loading the live portlet in Playwright and inspecting the rendered
grid before writing selectors.

### Manifest / permissions

- `host_permissions`: `https://howdyportal.tamu.edu/*`,
  `https://www.ratemyprofessors.com/*`. (`web-as.tamu.edu` is **not** needed at
  runtime — grades are bundled; it's only used by the offline build script.)
- `content_scripts` match: `https://howdyportal.tamu.edu/uPortal/*`.
- `permissions`: `storage`, `sidePanel`.
- `web_accessible_resources`: bundled `data/*.json`, Reveille icons, matched to
  the portlet host.

### Branding

- Name: `reveille-ratings`; display name "Reveille Ratings".
- Icon: Reveille (mascot collie) icon set (16/48/128).
- Accent: Aggie maroon `#500000`.
- Copy in options/sidepanel references TAMU / Howdy class search.

## Out of scope (v1)

- **Faculty photos** — no clean public TAMU source; the `aggie-ratings`
  SiteFarm photo layer is dropped.
- **Galveston / Qatar campuses** — College Station only (term codes `…1`).
- **Live grade API at runtime** — grades are a bundled snapshot refreshed by the
  maintainer script.

## Testing approach

- **Injection:** load the live public portlet in Playwright; verify badges
  appear on visible rows, survive scroll (virtualization recycle), survive
  re-search/re-sort, and never double-inject. Confirm CRN-keyed idempotency.
- **RMP matching:** spot-check known TAMU professors against
  `ratemyprofessors.com/school/1003`; confirm full-name matches and that
  no-match rows show nothing (no empty UI).
- **Grade matching:** unit-test the `(last, initial)` reducer against the tricky
  cases (`VAN POPPEL B`, `TAKACHI TOMITA J`); verify aggregation (summed A–F,
  enrollment-weighted GPA) for a professor teaching multiple sections/terms.
- **Build script:** verify it parses a current registrar PDF (e.g. Fall 2025
  Engineering) into the expected JSON shape.
- `pnpm/npm run typecheck` + `format:check` clean.

## Open questions deferred to planning

1. Exact ag-Grid DOM selectors (resolve via Playwright — first implementation
   task).
2. Grade-bundle scope: how many terms/colleges to include (size vs. coverage),
   and the exact refresh-script tooling (Node `pdf-parse` vs. `pdftotext`).
3. Whether to show per-term grade trend or a single aggregated distribution in
   v1 (lean: single aggregated distribution).
