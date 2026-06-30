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
  '^([A-Z]{2,4})-(\\d{3,4}[A-Z]?)-(\\w+)\\s+' +
    '(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+' +
    '\\d+\\s+' +
    '(\\d+\\.\\d+|N/?A)\\s+' +
    '\\d+\\s+\\d+\\s+\\d+\\s+\\d+\\s+\\d+\\s+' +
    '\\d+\\s+' +
    '(.+?)\\s+([A-Z])\\s*$'
);

// A logical section row begins with the section code.
const SECTION_START = /^[A-Z]{2,4}-\d{3,4}[A-Z]?-\w+/;
// In the real registrar PDF every grade count is followed by its own
// percentage line (e.g. "41.38%"); these are noise we drop.
const PERCENT = /^-?\d+(\.\d+)?%$/;

function emit(buf: string, term: string, out: GradeRecord[]): boolean {
  const line = buf.replace(/\s+/g, ' ').trim();
  const m = ROW.exec(line);
  if (!m) return false;
  const gpaRaw = m[9];
  out.push({
    subject: m[1],
    number: m[2],
    section: m[3],
    A: +m[4],
    B: +m[5],
    C: +m[6],
    D: +m[7],
    F: +m[8],
    gpa: /^\d/.test(gpaRaw) ? parseFloat(gpaRaw) : null,
    last: m[10].toLowerCase().trim(),
    initial: m[11].toLowerCase(),
    term,
  });
  return true;
}

// The fixture keeps each section row on a single line, but the real PDF text
// layout breaks one row across many lines (section code + A count, then a
// percentage line, the B count, another percentage line, ... and finally a
// line carrying the A-F total, GPA, I/S/U/Q/X, total and instructor). We
// reconstruct each logical row by buffering lines (skipping percentage-only
// lines) until the buffer completes a ROW match. Single-line fixture rows
// match on the very first line, so the same code path serves both formats.
export function parseGradeLines(text: string, term: string): GradeRecord[] {
  const out: GradeRecord[] = [];
  let buf = '';
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || PERCENT.test(line)) continue;
    if (SECTION_START.test(line)) {
      // A new section code starts a fresh row; any prior unfinished buffer
      // (e.g. a FERPA-suppressed row that never completed) is discarded.
      buf = line;
    } else if (buf) {
      buf += ' ' + line;
    } else {
      continue;
    }
    if (emit(buf, term, out)) buf = '';
  }
  return out;
}
