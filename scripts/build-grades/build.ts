import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFParse } from 'pdf-parse';
import { parseGradeLines, type GradeRecord } from './parse';

const COLLEGES = ['EN', 'AT', 'BA', 'AG', 'GB', 'NU', 'PH', 'AR'];
const TERMS = [
  { year: 2025, term: 'FALL', code: '202531' },
  { year: 2024, term: 'FALL', code: '202431' },
  { year: 2024, term: 'SPRING', code: '202411' },
];

async function fetchPdfText(
  year: number,
  term: string,
  college: string
): Promise<string> {
  const url = `https://web-as.tamu.edu/gradereports/Report?year=${year}&term=${term}&college=${college}`;
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`${college} ${term} ${year}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // pdf-parse v2: instantiate PDFParse with the buffer, then getText().
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function main() {
  const all: GradeRecord[] = [];
  for (const t of TERMS) {
    for (const college of COLLEGES) {
      try {
        const text = await fetchPdfText(t.year, t.term, college);
        const recs = parseGradeLines(text, t.code);
        console.log(`${college} ${t.term} ${t.year}: ${recs.length} sections`);
        all.push(...recs);
      } catch (e) {
        console.warn(
          `skip ${college} ${t.term} ${t.year}:`,
          (e as Error).message
        );
      }
    }
  }
  const byCourse: Record<string, GradeRecord[]> = {};
  for (const r of all) {
    const key = `${r.subject} ${r.number}`;
    (byCourse[key] ??= []).push(r);
  }
  mkdirSync(resolve('public/data'), { recursive: true });
  writeFileSync(resolve('public/data/grades.json'), JSON.stringify(byCourse));
  console.log(
    `Wrote ${all.length} records across ${Object.keys(byCourse).length} courses.`
  );
}

main();
