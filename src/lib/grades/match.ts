import type { GradeRecord, GradeSummary, Letter } from '@/types';

const LETTERS: Letter[] = ['A', 'B', 'C', 'D', 'F'];

/** Reduce a full "First M. Last" name to lowercase (last name, first initial).
 * The last name is everything after the first token, minus a middle initial. */
export function reduceName(
  full: string
): { last: string; initial: string } | null {
  const tokens = (full || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (tokens.length < 2) return null;
  const initial = tokens[0].charAt(0).toLowerCase();
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
  const gpa =
    gpaStudents > 0
      ? Math.round((weightedPoints / gpaStudents) * 1000) / 1000
      : null;
  return { totalStudents, gpa, letterGrades, sections: records.length };
}
