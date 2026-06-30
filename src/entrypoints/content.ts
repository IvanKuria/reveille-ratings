/**
 * @file content.ts
 * WXT content script entrypoint (isolated world).
 *
 * Injects professor rating bars into UC Davis's Class Search Tool
 * (registrar-apps.ucdavis.edu/courses/search). The tool is a ColdFusion app
 * that AJAX-POSTs the search form to `course_search_results.cfm` and drops the
 * returned HTML fragment into `#courseResultsDiv`. Results live in a
 * `<table id="mc_win">`, one `<tr>` per section. Each data row carries:
 *   - cell 0: course code, e.g. "ECS 036A"
 *   - cell 3: instructor + units, e.g. "Porquet-Lupine, J" then <em>4.0</em>
 *   - a `viewCourse('<CRN>')` onclick that yields the CRN
 *
 * Instructor names are "Last, FirstInitial" only — the matcher in the
 * background worker is initial-aware and handles the ambiguity.
 *
 * We watch `#courseResultsDiv` with a MutationObserver (it is re-filled on every
 * search and re-sort) and inject a full-width sibling row beneath each section.
 */

import '@/assets/rating-bar.css';
import {
  createMountPoint,
  renderComponent,
  unmountComponent,
  isPlaceholderName,
} from '@/lib/content/shared/mountHelper';
import RatingBar from '@/components/RatingBar';
import type {
  ProfessorData,
  ProfessorBundle,
  FetchProfessorDataResponse,
} from '@/types';

const RESULTS_CONTAINER = '#courseResultsDiv';
const RESULTS_TABLE = '#mc_win';
const PROCESSED_ATTR = 'data-ar-processed';

/**
 * Asks the background worker for RMP data by name. We pass the 'jdoe' sentinel
 * as the UID so the background skips any campus-directory lookup and keys the
 * RMP cache by name (UC Davis has no campus-directory source).
 */
function fetchProfessorData(name: string): Promise<FetchProfessorDataResponse> {
  // Bail if the extension was reloaded while this page stayed open (stale
  // context). The caller treats a rejection as "no data" and removes the bar.
  if (!chrome.runtime?.id) {
    return Promise.reject(new Error('Extension context invalidated'));
  }
  return chrome.runtime.sendMessage({
    action: 'fetchProfessorData',
    ID: 'jdoe',
    name,
  });
}

/** A section parsed from one results-table row. */
interface ParsedRow {
  course: string;
  instructorName: string;
  crn: string | null;
}

/**
 * Reads course code, instructor name (stripping the trailing units `<em>`),
 * and CRN from a results-table `<tr>`. Returns null if the row isn't a section
 * data row (header rows, spacers).
 */
function parseRow(tr: HTMLTableRowElement): ParsedRow | null {
  const cells = tr.querySelectorAll<HTMLTableCellElement>('td');
  if (cells.length < 4) return null;

  const course = (cells[0].textContent || '').replace(/\s+/g, ' ').trim();

  // Instructor cell holds "Name <br> <em>units</em>" — clone and drop the <em>
  // so only the instructor name text remains.
  const instrCell = cells[3].cloneNode(true) as HTMLElement;
  instrCell.querySelectorAll('em').forEach((el) => el.remove());
  const instructorName = (instrCell.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();

  // CRN is embedded in the row's viewCourse('<crn>') onclick handler.
  const onclickEl = tr.querySelector('[onclick*="viewCourse"]');
  const crn =
    onclickEl?.getAttribute('onclick')?.match(/viewCourse\('(\d+)'/)?.[1] ??
    null;

  if (!course && !instructorName) return null;
  return { course, instructorName, crn };
}

/**
 * Builds a full-width sibling row that holds the rating bar, keyed to its
 * section row so we avoid duplicates and can clean up on re-render.
 */
function buildBarRow(key: string): {
  row: HTMLTableRowElement;
  mount: HTMLElement;
} {
  const row = document.createElement('tr');
  row.className = 'rms-bar-row';
  row.setAttribute('data-ar-for', key);
  const td = document.createElement('td');
  td.colSpan = 99; // clamps to the table's real column count
  td.className = 'rms-bar-cell';
  const mount = createMountPoint(td, 'rms-rating-bar-root');
  row.appendChild(td);
  return { row, mount };
}

/**
 * Processes a single results row: parses its instructor, injects a loading bar,
 * then fills it with RMP data (or removes it if there's no match).
 */
async function processRow(tr: HTMLTableRowElement): Promise<void> {
  // Mark processed up front so concurrent scans don't double-inject.
  tr.setAttribute(PROCESSED_ATTR, '1');

  const parsed = parseRow(tr);
  if (!parsed) return;

  const { course, instructorName, crn } = parsed;
  // "The Staff" and other placeholders have nothing to look up.
  if (!instructorName || isPlaceholderName(instructorName)) return;

  // Stable per-row key: CRN when present, else course+name.
  const key = crn || `${course}|${instructorName}`;

  // Guard against a stale bar row left by a previous pass.
  const existing = tr.parentElement?.querySelector(
    `tr.rms-bar-row[data-ar-for="${CSS.escape(key)}"]`
  );
  if (existing) return;

  const { row, mount } = buildBarRow(key);
  tr.parentElement?.insertBefore(row, tr.nextSibling);
  renderComponent(mount, RatingBar, { professorData: null, loading: true });

  let bundle: ProfessorBundle | null = null;
  try {
    const resp = await fetchProfessorData(instructorName);
    bundle = resp && !('error' in resp) ? resp : null;
  } catch {
    bundle = null;
  }

  // No RMP match -> remove the bar entirely (no empty UI).
  if (!bundle || !bundle.rateMyProfessor) {
    unmountComponent(mount);
    row.remove();
    return;
  }

  const professorData: ProfessorData = {
    apiData: null,
    rateMyProfessor: bundle.rateMyProfessor,
    reviews: bundle.reviews || [],
    localResearchTopic: null,
    localClassesTaught: null,
    instructorName,
    instructorEmail: null,
    course,
  };
  renderComponent(mount, RatingBar, { professorData, loading: false });
}

/** Scans all unprocessed result rows and processes them. Idempotent. */
function scan(): void {
  const rows = document.querySelectorAll<HTMLTableRowElement>(
    `${RESULTS_TABLE} tr`
  );
  rows.forEach((tr) => {
    // Skip our own injected bar rows and already-handled rows.
    if (tr.classList.contains('rms-bar-row')) return;
    if (tr.getAttribute(PROCESSED_ATTR)) return;
    void processRow(tr);
  });
}

export default defineContentScript({
  matches: ['https://registrar-apps.ucdavis.edu/courses/search/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'manifest',

  main() {
    // The results fragment is injected into #courseResultsDiv on every search
    // and rebuilt on sort/paginate, so we re-scan whenever it mutates. scan()
    // ignores our own injected rows, so this never loops. Debounced because a
    // single fragment swap fires many childList mutations.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(scan, 150);
    };

    const start = () => {
      const container =
        document.querySelector(RESULTS_CONTAINER) || document.body;
      const observer = new MutationObserver(schedule);
      observer.observe(container, { childList: true, subtree: true });
      scan();
    };

    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
  },
});
