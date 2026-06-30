/**
 * Campus-specific DOM knowledge for the TAMU public class-search portlet
 * (`howdyportal.tamu.edu/uPortal/p/public-class-search-ui.ctf1`).
 *
 * The portlet renders an ag-Grid (theme `ag-theme-balham`) table. ag-Grid
 * VIRTUALIZES rows: only visible rows exist in the DOM and the same `.ag-row`
 * node is recycled for a different section as you scroll. So every selector
 * lives here, and row identity is keyed on the section's CRN (read from the
 * cell), never on a DOM marker or the `row-id` attribute (which is just the
 * row index and recycles).
 *
 * All values below were confirmed by live inspection of the rendered grid.
 */

export const AG_GRID = {
  /** Scroll viewport we attach the MutationObserver to + gate presence on. */
  viewportSelector: '.ag-body-viewport',
  /** Container holding the (virtualized) data rows. */
  rowContainerSelector: '.ag-center-cols-container',
  /** A single data row. */
  rowSelector: '.ag-row',
  // Column `col-id`s on each cell.
  instructorColId: 'SWV_CLASS_SEARCH_INSTRCTR_JSON',
  subjectColId: 'SWV_CLASS_SEARCH_SUBJECT',
  numberColId: 'SWV_CLASS_SEARCH_COURSE',
  crnColId: 'SWV_CLASS_SEARCH_CRN',
} as const;

const PLACEHOLDER =
  /^(tba|staff|the staff|to be (announced|assigned|determined))$/i;

/**
 * Returns the primary instructor's full name, stripping the `(P)` primary
 * marker and dropping any secondary instructors. Null for empty / placeholder
 * ("Staff", "TBA") cells.
 *
 * The portlet tags the primary instructor with "(P)"; when several instructors
 * are present `extractRow` passes them comma-separated, so we pick the "(P)"
 * segment, falling back to the first.
 */
export function parseInstructorCell(raw: string): { primary: string | null } {
  const text = (raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return { primary: null };
  const segments = text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const tagged = segments.find((s) => /\(P\)/i.test(s));
  const primary = (tagged ?? segments[0] ?? '').replace(/\(P\)/gi, '').trim();
  if (!primary || PLACEHOLDER.test(primary)) return { primary: null };
  return { primary };
}

/** Extracts the numeric CRN from a CRN cell like "30104 Syllabus". */
export function parseCrn(raw: string): string | null {
  const m = (raw || '').match(/\d+/);
  return m ? m[0] : null;
}

function cellText(row: HTMLElement, colId: string): string {
  const cell = row.querySelector<HTMLElement>(`[col-id="${colId}"]`);
  return (cell?.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * Reads the identifying fields out of one grid row. The instructor cell renders
 * each instructor as its own `<a>`; we join those with commas so a multi-
 * instructor cell parses correctly (and a recycled row reports its *current*
 * occupants).
 */
export function extractRow(row: HTMLElement): {
  instructorName: string | null;
  subject: string | null;
  number: string | null;
  crn: string | null;
} {
  const instrCell = row.querySelector<HTMLElement>(
    `[col-id="${AG_GRID.instructorColId}"]`
  );
  const anchors = instrCell
    ? [...instrCell.querySelectorAll('a')].map((a) => a.textContent || '')
    : [];
  const rawInstructors = anchors.length
    ? anchors.join(', ')
    : instrCell?.textContent || '';
  const instructorName = parseInstructorCell(rawInstructors).primary;

  const subject = cellText(row, AG_GRID.subjectColId) || null;
  const number = cellText(row, AG_GRID.numberColId) || null;
  const crn = parseCrn(cellText(row, AG_GRID.crnColId));
  return { instructorName, subject, number, crn };
}
