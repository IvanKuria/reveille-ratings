import { describe, it, expect } from 'vitest';
import { parseGradeLines } from './parse';

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
    expect(recs[0]).toMatchObject({
      subject: 'AERO',
      number: '201',
      section: '200',
    });
  });
  it('captures A-F counts and gpa', () => {
    expect(recs[0]).toMatchObject({
      A: 12,
      B: 8,
      C: 5,
      D: 4,
      F: 0,
      gpa: 2.965,
    });
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
