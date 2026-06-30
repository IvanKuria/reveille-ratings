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
