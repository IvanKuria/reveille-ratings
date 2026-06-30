# reveille-ratings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Chrome extension that injects Rate My Professors ratings and TAMU grade distributions into Texas A&M's public Howdy class-search portlet.

**Architecture:** Clone the `aggie-ratings` RMP-only sibling as the base (it already strips the UID/campus-directory machinery to a clean RMP core), then (a) rewrite the content-script injection layer for the portlet's virtualized ag-Grid table, and (b) add a grades layer fed by a maintainer-run build script that parses the TAMU Registrar's public grade PDFs into a bundled JSON.

**Tech Stack:** WXT 0.20 (MV3), React 18, TypeScript, Tailwind v4, fuse.js, recharts, Node build script with `pdf-parse`.

## Global Constraints

- Extension/repo name: `reveille-ratings`; display name: **Reveille Ratings**. Copied verbatim into manifest + package.json.
- RMP school ID: **`1003`** (Texas A&M University at College Station).
- Target host (runtime): `https://howdyportal.tamu.edu/*` only. Content-script match: `https://howdyportal.tamu.edu/uPortal/*`.
- RMP matching uses the **full instructor name**; grade matching uses **(last name, first initial)** lowercased.
- Grades are a **bundled snapshot** (`public/data/grades.json`); there is **no runtime grade server**. `web-as.tamu.edu` is used only by the offline build script, never as a host permission.
- Scope: **College Station campus only** (Banner term codes ending in `1`). No photos. No Galveston/Qatar.
- Accent color: Aggie maroon `#500000`.
- Verification commands: `npm run typecheck` and `npm run format:check` must pass; `npm run build` must succeed.
- No new heavyweight runtime dependencies beyond what `aggie-ratings` already ships; `pdf-parse` is a **devDependency** (build-time only).

---

### Task 1: Scaffold from aggie-ratings, rebrand, point at TAMU + RMP 1003

**Files:**
- Create (copy from `~/Documents/aggie-ratings/`): entire `src/`, `wxt.config.ts`, `package.json`, `tsconfig.json`, `.prettierrc*`, `public/` (icons), `.gitignore` (already exists — keep ours).
- Delete after copy: `src/lib/photo.ts`, `src/lib/hooks/useProfessorPhoto.ts`.
- Modify: `package.json`, `wxt.config.ts`, `src/lib/constants.ts`, and any file importing the deleted photo modules.

**Interfaces:**
- Produces: a building WXT extension whose background `fetchProfessorBundle` searches RMP school `1003`; `TAMU_SCHOOL_ID` constant; manifest matched to `howdyportal.tamu.edu`.

- [ ] **Step 1: Copy the base template**

```bash
cd ~/Documents/reveille-ratings
# Copy source tree, config, public assets from the aggie-ratings sibling.
rsync -a --exclude node_modules --exclude .output --exclude .wxt --exclude .git \
  ~/Documents/aggie-ratings/ ./
# Restore our own gitignore + docs (rsync may have overwritten gitignore).
git checkout -- .gitignore docs 2>/dev/null || true
```

- [ ] **Step 2: Remove the photo layer (out of scope)**

```bash
rm -f src/lib/photo.ts src/lib/hooks/useProfessorPhoto.ts
# Find any remaining importers to clean up in the next step.
grep -rn "photo\|Photo" src/ || true
```

Remove every import/usage of `photo`/`useProfessorPhoto`/`ContactInfo` photo props found above. In `src/components/professor/ProfessorHeader.tsx` and `ProfessorPanel.tsx`, delete the avatar/photo `<img>` block and any `photoUrl` prop threading. Keep initials-avatar fallback if present.

- [ ] **Step 3: Rebrand package.json**

Set in `package.json`:
```json
{
  "name": "reveille-ratings",
  "version": "1.0.0",
  "description": "View Rate My Professors ratings and TAMU grade distributions while browsing Texas A&M's public class search."
}
```
Keep all existing `scripts`, `dependencies`, `devDependencies`.

- [ ] **Step 4: Rewrite wxt.config.ts manifest**

Replace the `manifest` block in `wxt.config.ts` with:
```ts
  manifest: {
    name: 'Reveille Ratings',
    version: '1.0.0',
    description:
      "View Rate My Professors ratings and grade distributions while browsing Texas A&M's public class search.",
    permissions: ['storage', 'sidePanel'],
    action: {},
    host_permissions: [
      'https://howdyportal.tamu.edu/*',
      'https://www.ratemyprofessors.com/*',
    ],
    web_accessible_resources: [
      {
        resources: ['icons/app/*.png', 'images/*', 'data/*.json'],
        matches: ['https://howdyportal.tamu.edu/*'],
      },
    ],
    icons: {
      '16': 'icons/app/icon-16.png',
      '48': 'icons/app/icon-48.png',
      '128': 'icons/app/icon-128.png',
    },
  },
```

- [ ] **Step 5: Set the RMP school ID constant**

In `src/lib/constants.ts`, replace the `UCD_SCHOOL_ID` export (lines ~30-31) with:
```ts
// Rate My Professors
/** Base64 of "School-1003" (Texas A&M University at College Station). */
export const TAMU_SCHOOL_ID = btoa('School-1003');
```
Then update `src/lib/background/rmpCache.ts`: replace every `UCD_SCHOOL_ID` import/usage with `TAMU_SCHOOL_ID` (it is the default `schoolId` param in `selectBestRmpMatch`, `fetchRmpSearchResults`, `searchWithFallback`, `fetchCachedRateMyProfessorData`).

- [ ] **Step 6: Verify it builds and typechecks**

Run:
```bash
npm install
npm run typecheck
npm run build
```
Expected: typecheck clean (no references to deleted photo modules), build succeeds. Fix any dangling photo imports until both pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold reveille-ratings from aggie-ratings, target TAMU + RMP 1003"
```

---

### Task 2: ag-Grid injection layer

Rewrite the content script to inject rating badges into the portlet's virtualized ag-Grid, surviving row recycling.

**Files:**
- Create: `src/lib/content/agGrid.ts` (DOM constants + row parsing — the only campus-specific selectors live here)
- Create: `src/lib/content/agGrid.test.ts` (unit test for `parseInstructorCell`)
- Rewrite: `src/entrypoints/content.ts`
- Reference (do not modify): `src/lib/content/shared/mountHelper.tsx`, `~/Documents/aggie-ratings/src/entrypoints/content.ts` (the skeleton being adapted)

**Interfaces:**
- Produces:
  - `parseInstructorCell(raw: string): { primary: string | null }` — strips `(P)` and secondary instructors, returns the primary instructor's full name.
  - `AG_GRID` constants: `{ viewportSelector, rowSelector, instructorColId, subjectColId, numberColId, crnColId }` (exact values filled in Step 1 from live inspection).
  - `extractRow(rowEl: HTMLElement): { instructorName: string | null; subject: string | null; number: string | null; crn: string | null }`.

- [ ] **Step 1: Discover the live ag-Grid DOM (no code yet)**

Load the public portlet in Playwright and inspect the rendered grid. Run, via the Playwright MCP browser tools:
1. Navigate to `https://howdy.tamu.edu/main/activate/23` (redirects to the public search), wait for the grid.
2. Snapshot the DOM of one rendered data row. Record exactly:
   - the scroll **viewport** container selector (ag-Grid uses `.ag-body-viewport` / `.ag-center-cols-viewport`),
   - the **row** element selector and where the **CRN / row id** lives (`[row-id]` attr vs. a cell with `col-id="crn"`),
   - the `col-id` (or column header text) for **instructor**, **subject**, and **course number** cells,
   - a real sample of the instructor cell's text content (to confirm the `(P)` format).
3. Write the confirmed values into the `AG_GRID` constants in Step 2. **Do not guess** — if a column is combined (e.g. "CSCE 121" in one cell), adjust `extractRow` accordingly and note it.

- [ ] **Step 2: Write the failing parse test**

Create `src/lib/content/agGrid.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseInstructorCell } from './agGrid';

describe('parseInstructorCell', () => {
  it('strips the (P) primary marker', () => {
    expect(parseInstructorCell('Courtney E. Foster (P)').primary).toBe(
      'Courtney E. Foster'
    );
  });
  it('returns the primary when multiple instructors are listed', () => {
    expect(
      parseInstructorCell('Karen C. Farmer (P), Ryan Larkin').primary
    ).toBe('Karen C. Farmer');
  });
  it('handles a single instructor with no marker', () => {
    expect(parseInstructorCell('Ryan Larkin').primary).toBe('Ryan Larkin');
  });
  it('returns null for empty / TBA cells', () => {
    expect(parseInstructorCell('').primary).toBeNull();
    expect(parseInstructorCell('TBA').primary).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `npx vitest run src/lib/content/agGrid.test.ts`
Expected: FAIL — `parseInstructorCell` is not defined. (If vitest isn't configured, add it: `npm i -D vitest` and a `"test": "vitest run"` script.)

- [ ] **Step 4: Implement agGrid.ts**

Create `src/lib/content/agGrid.ts` (fill the `AG_GRID` values from Step 1):
```ts
/**
 * Campus-specific DOM knowledge for the TAMU public class-search portlet.
 * The portlet renders an ag-Grid table; ag-Grid virtualizes rows (only visible
 * rows exist in the DOM and recycle on scroll), so all selectors live here and
 * row identity is keyed on CRN, never on a DOM marker.
 */

// Values confirmed by live inspection in Step 1.
export const AG_GRID = {
  viewportSelector: '.ag-body-viewport',
  rowSelector: '.ag-row',
  // If subject+number share one cell, leave numberColId null and split in extractRow.
  instructorColId: 'instructor',
  subjectColId: 'subject',
  numberColId: 'courseNumber',
  crnColId: 'crn',
} as const;

const PLACEHOLDER = /^(tba|staff|the staff|to be (announced|assigned))$/i;

/** Returns the primary instructor's full name, stripping `(P)` and any
 * secondary instructors. Null for empty / placeholder cells. */
export function parseInstructorCell(raw: string): { primary: string | null } {
  const text = (raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return { primary: null };
  // Primary instructor is the segment tagged "(P)", else the first segment.
  const segments = text.split(',').map((s) => s.trim()).filter(Boolean);
  const tagged = segments.find((s) => /\(P\)/i.test(s));
  let primary = (tagged ?? segments[0] ?? '').replace(/\(P\)/gi, '').trim();
  if (!primary || PLACEHOLDER.test(primary)) return { primary: null };
  return { primary };
}

function cellText(row: HTMLElement, colId: string): string {
  const cell = row.querySelector<HTMLElement>(`[col-id="${colId}"]`);
  return (cell?.textContent || '').replace(/\s+/g, ' ').trim();
}

export function extractRow(row: HTMLElement): {
  instructorName: string | null;
  subject: string | null;
  number: string | null;
  crn: string | null;
} {
  const instructorName = parseInstructorCell(
    cellText(row, AG_GRID.instructorColId)
  ).primary;
  const subject = cellText(row, AG_GRID.subjectColId) || null;
  const number = cellText(row, AG_GRID.numberColId) || null;
  // CRN: prefer the row-id attribute, fall back to a CRN cell.
  const crn =
    row.getAttribute('row-id') || cellText(row, AG_GRID.crnColId) || null;
  return { instructorName, subject, number, crn };
}
```

- [ ] **Step 5: Run the parse test, verify it passes**

Run: `npx vitest run src/lib/content/agGrid.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Rewrite content.ts for the virtualized grid**

Replace `src/entrypoints/content.ts` with (adapts the aggie-ratings MutationObserver/scan skeleton):
```ts
/**
 * @file content.ts
 * Injects RMP rating badges into TAMU's public Howdy class-search portlet.
 *
 * The portlet renders an ag-Grid table that VIRTUALIZES rows: only visible
 * rows exist in the DOM and ag-Grid destroys/recreates them on scroll. So we
 * (1) watch the grid viewport with a debounced MutationObserver, (2) key
 * idempotency on the row's CRN (a Set) plus a check for an existing badge node,
 * and (3) inject the badge INSIDE the instructor cell rather than as a sibling
 * row. RMP results are cached by name in the background worker, so re-injecting
 * a recycled row is instant.
 */

import '@/assets/rating-bar.css';
import {
  createMountPoint,
  renderComponent,
  unmountComponent,
  isPlaceholderName,
} from '@/lib/content/shared/mountHelper';
import { AG_GRID, extractRow } from '@/lib/content/agGrid';
import RatingBar from '@/components/RatingBar';
import type {
  ProfessorData,
  ProfessorBundle,
  FetchProfessorDataResponse,
} from '@/types';

const BADGE_CLASS = 'rms-rating-bar-root';

/** Ask the background worker for RMP data by name (no UID — RMP-only). */
function fetchProfessorData(name: string): Promise<FetchProfessorDataResponse> {
  if (!chrome.runtime?.id) {
    return Promise.reject(new Error('Extension context invalidated'));
  }
  return chrome.runtime.sendMessage({
    action: 'fetchProfessorData',
    ID: null,
    name,
  });
}

async function processRow(row: HTMLElement): Promise<void> {
  const { instructorName, subject, number, crn } = extractRow(row);
  if (!instructorName || isPlaceholderName(instructorName)) return;

  const instrCell = row.querySelector<HTMLElement>(
    `[col-id="${AG_GRID.instructorColId}"]`
  );
  if (!instrCell) return;
  // Idempotent: skip if this cell already holds our badge (recycle-safe).
  if (instrCell.querySelector(`.${BADGE_CLASS}`)) return;

  const course = subject && number ? `${subject} ${number}` : null;
  const mount = createMountPoint(instrCell, BADGE_CLASS);
  renderComponent(mount, RatingBar, { professorData: null, loading: true });

  let bundle: ProfessorBundle | null = null;
  try {
    const resp = await fetchProfessorData(instructorName);
    bundle = resp && !('error' in resp) ? resp : null;
  } catch {
    bundle = null;
  }

  if (!bundle || !bundle.rateMyProfessor) {
    unmountComponent(mount);
    mount.remove();
    return;
  }

  const professorData: ProfessorData = {
    apiData: null,
    rateMyProfessor: bundle.rateMyProfessor,
    reviews: bundle.reviews || [],
    grades: bundle.grades ?? null,
    localResearchTopic: null,
    localClassesTaught: null,
    instructorName,
    instructorEmail: null,
    course,
  };
  renderComponent(mount, RatingBar, { professorData, loading: false });
}

function scan(): void {
  const rows = document.querySelectorAll<HTMLElement>(
    `${AG_GRID.viewportSelector} ${AG_GRID.rowSelector}`
  );
  rows.forEach((row) => void processRow(row));
}

export default defineContentScript({
  matches: ['https://howdyportal.tamu.edu/uPortal/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'manifest',

  main() {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(scan, 150);
    };
    const start = () => {
      const container =
        document.querySelector(AG_GRID.viewportSelector) || document.body;
      new MutationObserver(schedule).observe(container, {
        childList: true,
        subtree: true,
      });
      scan();
    };
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
  },
});
```
Note: `ProfessorData` gains a `grades` field in Task 5; until then, leave `grades: bundle.grades ?? null` and add the type field in Task 5 (typecheck will flag it — that is expected and resolved in Task 5, so run Step 7's commit only after the live check, and accept the known `grades` type gap until Task 5). If you prefer a green typecheck now, temporarily omit the `grades` line and re-add it in Task 5.

- [ ] **Step 7: Verify live in the browser**

Load the unpacked build (`npm run build`, then load `.output/chrome-mv3` in `chrome://extensions`). Open the public portlet, run a search. Confirm via Playwright/manual:
- Badges appear on visible instructor cells.
- Scrolling down and back does **not** duplicate badges and re-shows them on recycled rows.
- Re-searching / re-sorting re-injects correctly.
- A no-RMP-match row shows no badge (no empty UI).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: inject RMP badges into the TAMU ag-Grid class search"
```

---

### Task 3: Grade build script (registrar PDF → bundled JSON)

A maintainer-run Node script that downloads the Registrar grade PDFs, parses them, and writes `public/data/grades.json`. The pure parser is unit-tested; the download/extract I/O is verified against a real PDF.

**Files:**
- Create: `scripts/build-grades/parse.ts` (pure `parseGradeLines`)
- Create: `scripts/build-grades/parse.test.ts`
- Create: `scripts/build-grades/build.ts` (download + pdf-to-text + write JSON)
- Create: `scripts/build-grades/README.md` (how to refresh)
- Modify: `package.json` (add `pdf-parse` devDep + `"build:grades"` script)
- Output: `public/data/grades.json`

**Interfaces:**
- Produces:
  - `interface GradeRecord { subject: string; number: string; section: string; last: string; initial: string; A: number; B: number; C: number; D: number; F: number; gpa: number | null; term: string }`
  - `parseGradeLines(text: string, term: string): GradeRecord[]`
  - `public/data/grades.json` shape: `Record<"<SUBJECT> <NUMBER>", GradeRecord[]>` (the section field retained per record).

- [ ] **Step 1: Add tooling**

```bash
npm i -D pdf-parse tsx
```
Add to `package.json` scripts: `"build:grades": "tsx scripts/build-grades/build.ts"`.

- [ ] **Step 2: Write the failing parser test**

Create `scripts/build-grades/parse.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseGradeLines } from './parse';

// Two real-shape rows under a department header, plus a noise line.
const SAMPLE = [
  'AEROSPACE ENGINEERING',
  'AERO-201-200  12  8  5  4  0  29  2.965  0 0 0 0 0  29  BHARGAVA D',
  'AERO-201-500  20 10  2  1  0  33  3.394  0 0 0 0 0  33  VAN POPPEL B',
  'Page 1 of 242',
].join('\n');

describe('parseGradeLines', () => {
  const recs = parseGradeLines(SAMPLE, '202531');

  it('parses each section data row', () => {
    expect(recs).toHaveLength(2);
  });
  it('splits subject and number from the section code', () => {
    expect(recs[0]).toMatchObject({ subject: 'AERO', number: '201', section: '200' });
  });
  it('captures A-F counts and gpa', () => {
    expect(recs[0]).toMatchObject({ A: 12, B: 8, C: 5, D: 4, F: 0, gpa: 2.965 });
  });
  it('reduces instructor to last + initial, multi-word last names intact', () => {
    expect(recs[0]).toMatchObject({ last: 'bhargava', initial: 'd' });
    expect(recs[1]).toMatchObject({ last: 'van poppel', initial: 'b' });
  });
  it('tags the term', () => {
    expect(recs[0].term).toBe('202531');
  });
  it('ignores non-data lines', () => {
    expect(recs.some((r) => r.subject === 'Page')).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `npx vitest run scripts/build-grades/parse.test.ts`
Expected: FAIL — `parseGradeLines` not defined.

- [ ] **Step 4: Implement the pure parser**

Create `scripts/build-grades/parse.ts`:
```ts
export interface GradeRecord {
  subject: string;
  number: string;
  section: string;
  last: string;
  initial: string;
  A: number;
  B: number;
  C: number;
  D: number;
  F: number;
  gpa: number | null;
  term: string;
}

// Section code SUBJ-NUM-SEC, then A B C D F, A-F total, GPA, I S U Q X, TOTAL,
// then the instructor "LASTNAME I" (last name may contain spaces).
const ROW = new RegExp(
  '^([A-Z]{2,4})-(\\d{3,4}[A-Z]?)-(\\w+)\\s+' + // subject-number-section
    '(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+' + // A B C D F
    '\\d+\\s+' + // A-F total (ignored)
    '(\\d+\\.\\d+|N/?A)\\s+' + // GPA
    '\\d+\\s+\\d+\\s+\\d+\\s+\\d+\\s+\\d+\\s+' + // I S U Q X (ignored)
    '\\d+\\s+' + // TOTAL (ignored)
    '(.+?)\\s+([A-Z])\\s*$' // instructor last name + trailing initial
);

export function parseGradeLines(text: string, term: string): GradeRecord[] {
  const out: GradeRecord[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    const m = ROW.exec(line);
    if (!m) continue;
    const gpaRaw = m[9];
    out.push({
      subject: m[1],
      number: m[2],
      section: m[3],
      A: +m[4], B: +m[5], C: +m[6], D: +m[7], F: +m[8],
      gpa: /^\d/.test(gpaRaw) ? parseFloat(gpaRaw) : null,
      last: m[10].toLowerCase().trim(),
      initial: m[11].toLowerCase(),
      term,
    });
  }
  return out;
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npx vitest run scripts/build-grades/parse.test.ts`
Expected: PASS (6 tests). If the real PDF text (Step 6) reveals a different spacing/column layout, adjust the `ROW` regex and re-run until both the fixture test and a real PDF parse cleanly.

- [ ] **Step 6: Implement the download/build I/O**

Create `scripts/build-grades/build.ts`:
```ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error - pdf-parse ships no types
import pdf from 'pdf-parse';
import { parseGradeLines, type GradeRecord } from './parse';

// Maintainer-tunable: which terms/colleges to bundle. Term code = YYYY + sem + 1
// (sem: FALL=3, SUMMER=2, SPRING=1; trailing 1 = College Station).
const COLLEGES = ['EN', 'AT', 'BA', 'AG', 'GB', 'NU', 'PH', 'AR']; // extend as needed
const TERMS = [
  { year: 2025, term: 'FALL', code: '202531' },
  { year: 2024, term: 'FALL', code: '202431' },
  { year: 2024, term: 'SPRING', code: '202411' },
]; // last ~3 years by default; extend per coverage needs

async function fetchPdfText(year: number, term: string, college: string): Promise<string> {
  const url = `https://web-as.tamu.edu/gradereports/Report?year=${year}&term=${term}&college=${college}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${college} ${term} ${year}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const parsed = await pdf(buf);
  return parsed.text as string;
}

async function main() {
  const all: GradeRecord[] = [];
  for (const t of TERMS) {
    for (const college of COLLEGES) {
      try {
        const text = await fetchPdfText(t.year, t.term, college);
        const recs = parseGradeLines(text, t.code);
        console.log(`${college} ${t.term} ${t.year}: ${recs.length} sections`);
        all.push(...recs);
      } catch (e) {
        console.warn(`skip ${college} ${t.term} ${t.year}:`, (e as Error).message);
      }
    }
  }

  // Group by "<SUBJECT> <NUMBER>".
  const byCourse: Record<string, GradeRecord[]> = {};
  for (const r of all) {
    const key = `${r.subject} ${r.number}`;
    (byCourse[key] ??= []).push(r);
  }

  mkdirSync(resolve('public/data'), { recursive: true });
  writeFileSync(resolve('public/data/grades.json'), JSON.stringify(byCourse));
  console.log(`Wrote ${all.length} records across ${Object.keys(byCourse).length} courses.`);
}

main();
```

- [ ] **Step 7: Run the build against the real registrar PDFs**

Run: `npm run build:grades`
Expected: per-college section counts logged; `public/data/grades.json` written (non-trivial size). Open it and spot-check that a known course (e.g. `"CSCE 121"`) has records with sane A–F counts and GPA. If counts are 0, the `ROW` regex needs adjusting to the real text layout (re-run Step 5).

- [ ] **Step 8: Write the refresh README and commit**

Create `scripts/build-grades/README.md` documenting: the `Report?...` endpoint, the `COLLEGES`/`TERMS` knobs, and `npm run build:grades`. Then:
```bash
git add -A
git commit -m "feat: build script bundling TAMU registrar grade PDFs to JSON"
```

---

### Task 4: Grade lookup + aggregation library

Pure functions that load the bundle and produce an aggregated distribution for an instructor + course, matched on (last, first-initial).

**Files:**
- Create: `src/types/grades.ts` (port from `~/Documents/rate-my-slugs/src/types/grades.ts`, simplified to A–F)
- Create: `src/lib/grades/match.ts` (`reduceName`, `aggregate`)
- Create: `src/lib/grades/match.test.ts`
- Create: `src/lib/grades/load.ts` (load + cache the bundled JSON, then `lookupGrades`)
- Modify: `src/types/index.ts` (export `./grades`)

**Interfaces:**
- Consumes: `public/data/grades.json` (`Record<string, GradeRecord[]>`), `GradeRecord` from Task 3 (re-declared in `src/types/grades.ts`).
- Produces:
  - `reduceName(full: string): { last: string; initial: string } | null`
  - `interface GradeSummary { totalStudents: number; gpa: number | null; letterGrades: Record<'A'|'B'|'C'|'D'|'F', number>; sections: number }`
  - `aggregate(records: GradeRecord[]): GradeSummary`
  - `lookupGrades(instructorFullName: string, course: string | null): Promise<GradeSummary | null>`

- [ ] **Step 1: Create the grades types**

Create `src/types/grades.ts`:
```ts
/** One section's grade row, as bundled by scripts/build-grades. */
export interface GradeRecord {
  subject: string;
  number: string;
  section: string;
  last: string;
  initial: string;
  A: number;
  B: number;
  C: number;
  D: number;
  F: number;
  gpa: number | null;
  term: string;
}

export type Letter = 'A' | 'B' | 'C' | 'D' | 'F';

export interface GradeSummary {
  totalStudents: number;
  gpa: number | null;
  letterGrades: Record<Letter, number>;
  sections: number;
}
```
Add `export * from './grades';` to `src/types/index.ts`.

- [ ] **Step 2: Write the failing match/aggregate test**

Create `src/lib/grades/match.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { reduceName, aggregate } from './match';
import type { GradeRecord } from '@/types';

const rec = (over: Partial<GradeRecord>): GradeRecord => ({
  subject: 'CSCE', number: '121', section: '500', last: 'keyser', initial: 'j',
  A: 0, B: 0, C: 0, D: 0, F: 0, gpa: null, term: '202531', ...over,
});

describe('reduceName', () => {
  it('reduces "First M. Last" to last + initial', () => {
    expect(reduceName('Courtney E. Foster')).toEqual({ last: 'foster', initial: 'c' });
  });
  it('keeps multi-word last names', () => {
    expect(reduceName('Bert Van Poppel')).toEqual({ last: 'van poppel', initial: 'b' });
  });
  it('returns null for empty', () => {
    expect(reduceName('')).toBeNull();
  });
});

describe('aggregate', () => {
  it('sums A-F across sections and enrollment-weights GPA', () => {
    const s = aggregate([
      rec({ A: 10, B: 0, C: 0, D: 0, F: 0, gpa: 4.0 }), // 10 students @ 4.0
      rec({ A: 0, B: 0, C: 0, D: 0, F: 10, gpa: 0.0 }), // 10 students @ 0.0
    ]);
    expect(s.letterGrades).toEqual({ A: 10, B: 0, C: 0, D: 0, F: 10 });
    expect(s.totalStudents).toBe(20);
    expect(s.gpa).toBeCloseTo(2.0, 5);
    expect(s.sections).toBe(2);
  });
  it('returns null gpa when no sections carry one', () => {
    expect(aggregate([rec({ A: 3, gpa: null })]).gpa).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `npx vitest run src/lib/grades/match.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement match.ts**

Create `src/lib/grades/match.ts`:
```ts
import type { GradeRecord, GradeSummary, Letter } from '@/types';

const LETTERS: Letter[] = ['A', 'B', 'C', 'D', 'F'];

/** Reduce a full "First M. Last" name to lowercase (last name, first initial).
 * The last name is everything after the first token, minus a middle initial. */
export function reduceName(full: string): { last: string; initial: string } | null {
  const tokens = (full || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (tokens.length < 2) return null;
  const initial = tokens[0].charAt(0).toLowerCase();
  // Drop a middle initial like "E." between first and last.
  const rest = tokens.slice(1).filter((t) => !/^[A-Z]\.?$/.test(t));
  const lastTokens = rest.length ? rest : tokens.slice(1);
  return { last: lastTokens.join(' ').toLowerCase(), initial };
}

export function aggregate(records: GradeRecord[]): GradeSummary {
  const letterGrades: Record<Letter, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  let weightedPoints = 0;
  let gpaStudents = 0;
  for (const r of records) {
    for (const L of LETTERS) letterGrades[L] += r[L] || 0;
    if (r.gpa != null) {
      const n = r.A + r.B + r.C + r.D + r.F;
      weightedPoints += r.gpa * n;
      gpaStudents += n;
    }
  }
  const totalStudents = LETTERS.reduce((sum, L) => sum + letterGrades[L], 0);
  const gpa = gpaStudents > 0 ? Math.round((weightedPoints / gpaStudents) * 1000) / 1000 : null;
  return { totalStudents, gpa, letterGrades, sections: records.length };
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npx vitest run src/lib/grades/match.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Implement the bundle loader**

Create `src/lib/grades/load.ts`:
```ts
import type { GradeRecord, GradeSummary } from '@/types';
import { reduceName, aggregate } from './match';
import { logger } from '@/lib/logger';

let cache: Record<string, GradeRecord[]> | null = null;

async function loadBundle(): Promise<Record<string, GradeRecord[]>> {
  if (cache) return cache;
  try {
    const url = chrome.runtime.getURL('data/grades.json');
    const res = await fetch(url);
    cache = (await res.json()) as Record<string, GradeRecord[]>;
  } catch (e) {
    logger.error('Failed to load grades bundle', e);
    cache = {};
  }
  return cache;
}

/** Aggregated grade distribution for an instructor + course, or null. */
export async function lookupGrades(
  instructorFullName: string,
  course: string | null
): Promise<GradeSummary | null> {
  if (!course) return null;
  const id = reduceName(instructorFullName);
  if (!id) return null;
  const bundle = await loadBundle();
  const records = (bundle[course] || []).filter(
    (r) => r.last === id.last && r.initial === id.initial
  );
  if (records.length === 0) return null;
  return aggregate(records);
}
```

- [ ] **Step 7: Verify typecheck and commit**

Run: `npm run typecheck`
Expected: clean.
```bash
git add -A
git commit -m "feat: grade lookup + aggregation matched on last name + initial"
```

---

### Task 5: Wire grades into the bundle and the sidepanel UI

Attach grades to the professor bundle in the background, thread the field through `ProfessorData`, and render a presentational grade distribution in the sidepanel.

**Files:**
- Modify: `src/types/professor.ts` (add `grades` to `ProfessorBundle` and `ProfessorData`)
- Modify: `src/entrypoints/background.ts` (`fetchProfessorBundle` calls `lookupGrades`)
- Create: `src/components/GradeDistribution.tsx` (presentational; port the recharts shell from `~/Documents/rate-my-slugs/src/components/GradeDistribution.tsx`, drop the server fetch)
- Modify: `src/components/professor/ExpandedDetails.tsx` (render `<GradeDistribution>` when `grades` present)
- Modify: `src/assets/rating-bar.css` (copy the `.grade-dist-*` styles from rate-my-slugs)

**Interfaces:**
- Consumes: `lookupGrades` (Task 4), `GradeSummary` (Task 4).
- Produces: `ProfessorBundle.grades: GradeSummary | null`, `ProfessorData.grades: GradeSummary | null`.

- [ ] **Step 1: Extend the professor types**

In `src/types/professor.ts`, add `grades: GradeSummary | null;` to both `ProfessorBundle` and `ProfessorData` (import `GradeSummary` from `./grades`). This resolves the `grades` field referenced in Task 2's content.ts.

- [ ] **Step 2: Populate grades in the background bundle**

In `src/entrypoints/background.ts`, import `lookupGrades` and add a `course` argument to `fetchProfessorBundle` (thread `message.course` from the `fetchProfessorData` route). After resolving `rateMyProfessorNode`, add:
```ts
let grades: GradeSummary | null = null;
try {
  grades = await lookupGrades(name, course ?? null);
} catch (e) {
  logger.error('grade lookup failed', e);
}
```
Return `grades` in the bundle object. Update the `fetchProfessorData` message type (`src/types/messages.ts`) to carry an optional `course?: string | null`, and have `content.ts` pass `course` in its `sendMessage` (add `course` alongside `name`).

- [ ] **Step 3: Write the presentational GradeDistribution**

Create `src/components/GradeDistribution.tsx` (recharts shell ported from rate-my-slugs, but a pure presentational component — no fetch, no quarter/year filters, A–F only):
```tsx
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { GradeSummary, Letter } from '@/types';

const GRADE_COLORS: Record<Letter, string> = {
  A: '#22c55e', B: '#a3e635', C: '#fbbf24', D: '#f97316', F: '#ef4444',
};
const ORDER: Letter[] = ['A', 'B', 'C', 'D', 'F'];

export default function GradeDistribution({ grades }: { grades: GradeSummary }) {
  const chartData = ORDER.map((grade) => ({
    grade, count: grades.letterGrades[grade] || 0, color: GRADE_COLORS[grade],
  }));
  const total = grades.totalStudents;
  if (total === 0) return null;
  const ariaSummary = `Grade distribution: ${chartData
    .map((d) => `${d.grade}, ${d.count} student${d.count === 1 ? '' : 's'}`)
    .join('; ')}. Total ${total}.`;

  return (
    <div className="grade-dist-section">
      <h4 className="grade-dist-title">Grade Distribution</h4>
      <div className="grade-dist-chart" role="img" aria-label={ariaSummary}>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <XAxis dataKey="grade" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v) => [
                `${v as number} students (${(((v as number) / total) * 100).toFixed(1)}%)`,
                'Count',
              ]}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {chartData.map((e, i) => <Cell key={i} fill={e.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grade-dist-stats">
        <div className="grade-dist-stat">
          <span className="grade-dist-stat-label">Avg GPA</span>
          <span className="grade-dist-stat-value">{grades.gpa?.toFixed(2) || 'N/A'}</span>
        </div>
        <div className="grade-dist-stat">
          <span className="grade-dist-stat-label">Total</span>
          <span className="grade-dist-stat-value">{total} students</span>
        </div>
        <div className="grade-dist-stat">
          <span className="grade-dist-stat-label">Sections</span>
          <span className="grade-dist-stat-value">{grades.sections}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Render it in the sidepanel detail**

In `src/components/professor/ExpandedDetails.tsx`, import `GradeDistribution` and render `{professorData.grades && <GradeDistribution grades={professorData.grades} />}` in the detail body. Copy the `.grade-dist-*` rules from `~/Documents/rate-my-slugs/src/assets/rating-bar.css` into `src/assets/rating-bar.css` (search `grade-dist`), adjusting the accent to maroon `#500000` where the original uses UCSC blue.

- [ ] **Step 5: Verify typecheck + build, then live**

Run:
```bash
npm run typecheck && npm run build
```
Expected: clean. Reload the unpacked extension, open a professor's sidepanel for a course with known grades; confirm the A–F chart, GPA, total, and section count render. For an instructor with no grade match, the section is absent (no empty UI).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: show TAMU grade distributions in the professor sidepanel"
```

---

### Task 6: Branding, README, and final verification

**Files:**
- Replace: `public/icons/app/icon-16.png`, `icon-48.png`, `icon-128.png` (Reveille artwork)
- Modify: `src/lib/colors.ts` and/or theme tokens (maroon accent), options/sidepanel copy
- Create: `README.md`
- Reference: `~/Documents/aggie-ratings/README.md` for structure

**Interfaces:**
- Produces: a release-ready, branded extension.

- [ ] **Step 1: Swap in Reveille icons + maroon accent**

Replace the three `public/icons/app/icon-*.png` with Reveille (mascot) artwork at 16/48/128 px. In `src/lib/colors.ts` (and any Tailwind theme token), set the primary/accent to Aggie maroon `#500000`. Update user-facing copy in `src/components/settings/*` and the sidepanel header to reference "Texas A&M" / "Howdy class search".

- [ ] **Step 2: Write the README**

Create `README.md` covering: what it does (RMP + grade distributions on TAMU's public class search), the public portlet URL, install/dev (`npm run dev`, load unpacked), the grades refresh (`npm run build:grades`), RMP school 1003, and credits to the sibling extensions. Mirror the `aggie-ratings` README structure.

- [ ] **Step 3: Full verification**

Run:
```bash
npm run typecheck
npm run format:check
npm run build
npx vitest run
```
Expected: all clean/passing. Then a final live smoke test on the portlet: badges inject + survive scroll, sidepanel shows ratings + reviews + grades.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: Reveille branding, maroon accent, and README"
```

- [ ] **Step 5: (Optional, confirm first) Create the GitHub repo**

Only after the user confirms: `gh repo create IvanKuria/reveille-ratings --public --source=. --remote=origin --push`. Do not push without explicit go-ahead.

---

## Self-Review

**Spec coverage:**
- Public portlet target + ag-Grid + JSON API → Task 2 (selectors discovered live). ✓
- RMP school 1003, full-name matching → Task 1 (constant) + reused matcher. ✓
- ag-Grid virtualization / CRN-keyed idempotency → Task 2 Steps 4, 6. ✓
- Grades: bundle parsed official PDFs → Task 3. ✓
- Grade matching on (last, initial) + aggregation → Task 4. ✓
- Grade display via ported GradeDistribution → Task 5. ✓
- Drop photos, College-Station-only, no runtime grade server → Task 1 (photo delete, manifest), Task 3 (offline script). ✓
- Branding (reveille-ratings, maroon, Reveille icon) → Tasks 1 + 6. ✓
- Testing approach (parse/match unit tests, live injection check) → Tasks 2–5 tests + Task 6 Step 3. ✓

**Placeholder scan:** No TBD/TODO. The only deliberately deferred value is the exact `AG_GRID` selector strings, which Task 2 Step 1 resolves by live inspection before any dependent code runs — documented, not a placeholder.

**Type consistency:** `GradeRecord` is declared in Task 3 (`scripts/build-grades/parse.ts`) and re-declared identically in Task 4 (`src/types/grades.ts`) — intentional, since the script and extension don't share a module; field names/types match exactly. `GradeSummary`, `lookupGrades`, `reduceName`, `aggregate` signatures are consistent across Tasks 4–5. `ProfessorData.grades` / `ProfessorBundle.grades: GradeSummary | null` consistent between Task 2 (consumer), Task 4 (producer), Task 5 (type definition). The Task 2 note flags the temporary `grades`-field type gap resolved in Task 5.
