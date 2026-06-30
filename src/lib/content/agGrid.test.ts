import { describe, it, expect } from 'vitest';
import { parseInstructorCell, parseCrn } from './agGrid';

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
  it('falls back to the first instructor when none is tagged (P)', () => {
    expect(parseInstructorCell('Ryan Larkin, Jane Doe').primary).toBe(
      'Ryan Larkin'
    );
  });
  it('handles a single instructor with no marker', () => {
    expect(parseInstructorCell('Ryan Larkin').primary).toBe('Ryan Larkin');
  });
  it('returns null for empty / TBA cells', () => {
    expect(parseInstructorCell('').primary).toBeNull();
    expect(parseInstructorCell('TBA').primary).toBeNull();
    expect(parseInstructorCell('Staff').primary).toBeNull();
  });
});

describe('parseCrn', () => {
  it('extracts the leading CRN digits, dropping the Syllabus link text', () => {
    expect(parseCrn('30104 Syllabus')).toBe('30104');
  });
  it('returns null when no digits are present', () => {
    expect(parseCrn('Syllabus')).toBeNull();
    expect(parseCrn('')).toBeNull();
  });
});
