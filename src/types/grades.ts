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
