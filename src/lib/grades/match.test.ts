import { describe, it, expect } from 'vitest';
import { reduceName, aggregate } from './match';
import type { GradeRecord } from '@/types';

const rec = (over: Partial<GradeRecord>): GradeRecord => ({
  subject: 'CSCE',
  number: '121',
  section: '500',
  last: 'keyser',
  initial: 'j',
  A: 0,
  B: 0,
  C: 0,
  D: 0,
  F: 0,
  gpa: null,
  term: '202531',
  ...over,
});

describe('reduceName', () => {
  it('reduces "First M. Last" to last + initial', () => {
    expect(reduceName('Courtney E. Foster')).toEqual({
      last: 'foster',
      initial: 'c',
    });
  });
  it('keeps multi-word last names', () => {
    expect(reduceName('Bert Van Poppel')).toEqual({
      last: 'van poppel',
      initial: 'b',
    });
  });
  it('returns null for empty', () => {
    expect(reduceName('')).toBeNull();
  });
});

describe('aggregate', () => {
  it('sums A-F across sections and enrollment-weights GPA', () => {
    const s = aggregate([
      rec({ A: 10, B: 0, C: 0, D: 0, F: 0, gpa: 4.0 }),
      rec({ A: 0, B: 0, C: 0, D: 0, F: 10, gpa: 0.0 }),
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
