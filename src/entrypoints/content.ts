/**
 * @file content.ts
 * WXT content script entrypoint (isolated world).
 *
 * Injects RMP rating badges into TAMU's public Howdy class-search portlet
 * (howdyportal.tamu.edu/uPortal/p/public-class-search-ui.ctf1). The portlet
 * renders an ag-Grid (`ag-theme-balham`) table that VIRTUALIZES rows: only
 * visible rows exist in the DOM, and ag-Grid recycles a given `.ag-row` node
 * for a different section as you scroll. So we:
 *   (1) watch the grid viewport with a debounced MutationObserver,
 *   (2) inject the badge INSIDE each instructor cell (rows are absolutely
 *       positioned, so the UC Davis sibling-row trick doesn't apply), and
 *   (3) make injection recycle-safe by stamping each mount with its section's
 *       CRN (`dataset.crn`): on every scan we compare the stamp to the row's
 *       current CRN — equal means the badge already belongs to this section
 *       (skip), different means the row was recycled (tear down + re-render).
 *
 * RMP results are cached by name in the background worker, so re-injecting a
 * recycled or returning row is effectively free. Sections with no RMP match
 * keep an empty stamped marker so they aren't re-fetched on every tick.
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

/**
 * Asks the background worker for RMP data by name. There is no campus-directory
 * source for TAMU, so the UID is null and the worker keys the RMP cache by name.
 */
function fetchProfessorData(
  name: string,
  course: string | null
): Promise<FetchProfessorDataResponse> {
  // Bail if the extension was reloaded while this page stayed open (stale
  // context). The caller treats a rejection as "no data".
  if (!chrome.runtime?.id) {
    return Promise.reject(new Error('Extension context invalidated'));
  }
  return chrome.runtime.sendMessage({
    action: 'fetchProfessorData',
    ID: null,
    name,
    course,
  });
}

/**
 * Processes one grid row: parses its instructor + CRN, then injects (or
 * refreshes) the rating badge inside the instructor cell. Recycle-safe via the
 * CRN stamp on the mount.
 */
async function processRow(row: HTMLElement): Promise<void> {
  const instrCell = row.querySelector<HTMLElement>(
    `[col-id="${AG_GRID.instructorColId}"]`
  );
  if (!instrCell) return;

  const { instructorName, subject, number, crn } = extractRow(row);
  const stamp = crn ?? '';

  // If a badge already exists for THIS section, leave it; otherwise the row was
  // recycled to a different section, so tear the stale badge down.
  const existing = instrCell.querySelector<HTMLElement>(`.${BADGE_CLASS}`);
  if (existing) {
    if (existing.dataset.crn === stamp) return;
    unmountComponent(existing);
    existing.remove();
  }

  // "Staff" / "TBA" and other placeholders have nothing to look up.
  if (!instructorName || isPlaceholderName(instructorName)) return;

  const courseName = subject && number ? `${subject} ${number}` : null;

  // Inject INTO the cell-value span (right after the instructor name), not the
  // cell itself: ag-Grid's `.ag-cell-wrapper` fills the full (auto-height) cell,
  // so a sibling appended after it lands below the cell's bottom edge and is
  // clipped by the cell's `overflow: hidden`. The value span sits at the top.
  const valueEl =
    instrCell.querySelector<HTMLElement>('.ag-cell-value') || instrCell;
  const mount = createMountPoint(valueEl, BADGE_CLASS);
  mount.dataset.crn = stamp;
  // Render the badge on its own line under the instructor name (rows are tall
  // enough — auto-height from the meeting-times column).
  mount.style.display = 'block';
  renderComponent(mount, RatingBar, { professorData: null, loading: true });

  let bundle: ProfessorBundle | null = null;
  try {
    const resp = await fetchProfessorData(instructorName, courseName);
    bundle = resp && !('error' in resp) ? resp : null;
  } catch {
    bundle = null;
  }

  // No RMP match -> empty the mount but KEEP it as a stamped marker so we don't
  // re-fetch this section on every observer tick.
  if (!bundle || !bundle.rateMyProfessor) {
    unmountComponent(mount);
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
    course: courseName,
  };
  renderComponent(mount, RatingBar, { professorData, loading: false });
}

/** Scans all currently-rendered grid rows and processes them. Idempotent. */
function scan(): void {
  const rows = document.querySelectorAll<HTMLElement>(
    `${AG_GRID.rowContainerSelector} ${AG_GRID.rowSelector}`
  );
  rows.forEach((row) => void processRow(row));
}

export default defineContentScript({
  matches: ['https://howdyportal.tamu.edu/uPortal/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'manifest',

  main() {
    // ag-Grid mutates the viewport constantly (scroll, sort, filter, search), so
    // we re-scan on every mutation. processRow is idempotent per (cell, CRN), so
    // this never loops. Debounced because one scroll fires many mutations.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(scan, 150);
    };

    const start = () => {
      const container =
        document.querySelector(AG_GRID.viewportSelector) || document.body;
      const observer = new MutationObserver(schedule);
      observer.observe(container, { childList: true, subtree: true });
      scan();
    };

    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
  },
});
