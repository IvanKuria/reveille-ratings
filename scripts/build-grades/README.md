# Grade distribution build script

Maintainer-run Node script that downloads Texas A&M's public grade-distribution
PDFs from the Registrar, parses them, and writes the bundled
`public/data/grades.json` consumed by the extension.

## Run it

```sh
npm run build:grades
```

(Wired in `package.json` to `tsx scripts/build-grades/build.ts`.) Requires
network access to `web-as.tamu.edu`. Re-run it whenever you want to refresh the
bundled data (e.g. after a new term's grades are published) and commit the
regenerated `public/data/grades.json`.

## The data source

The Registrar exposes a per-college grade-distribution PDF at:

```
https://web-as.tamu.edu/gradereports/Report?year=YYYY&term=FALL|SPRING|SUMMER&college=XX
```

Each PDF lists, for every section of every course in that college/term, the
A/B/C/D/F counts, the A-F total, the section GPA, the I/S/U/Q/X counts, the
overall total, and the instructor.

## Knobs (edit in `build.ts`)

- **`COLLEGES`** — the two-letter college codes to pull (`EN`, `AT`, `BA`, `AG`,
  `GB`, `NU`, `PH`, `AR`, ...). Add/remove codes to widen or narrow coverage.
  A college that has no report for a given term returns a non-PDF error page and
  is logged as `skip ... Invalid PDF structure` (non-fatal).
- **`TERMS`** — the `{ year, term, code }` tuples to fetch. The **term code** is
  `YYYY` + a semester digit + a campus digit:
  - semester digit: `FALL = 3`, `SUMMER = 2`, `SPRING = 1`
  - campus digit: `1` for College Station
  - e.g. Fall 2025 College Station = `2025` + `3` + `1` = `202531`;
    Spring 2024 = `202411`.

  The `code` is stored as the `term` field on every record so the extension can
  distinguish terms.

## Parsing notes

- `parse.ts` holds the pure `parseGradeLines(text, term)` function (unit-tested
  in `parse.test.ts`); `build.ts` only does the download + PDF-to-text I/O via
  `pdf-parse` v2 (`new PDFParse({ data }).getText()`).
- The extracted PDF text breaks a single logical section row across many lines
  (each grade count is followed by its own percentage line). The parser drops
  the percentage lines and buffers the remaining lines until a full row matches,
  so it handles both the real multi-line layout and a one-row-per-line fixture.
- **Instructor is reduced to last name + initial only** (lowercased), e.g.
  `BHARGAVA D` -> `{ last: "bhargava", initial: "d" }`. Multi-word last names are
  kept intact (`VAN POPPEL B` -> `{ last: "van poppel", initial: "b" }`). This is
  the matching constraint the extension relies on when joining grade rows to RMP
  professors.
- **FERPA suppression:** sections with fewer than 5 students are suppressed in
  the source PDF, so they simply do not appear in the output.

## Output shape

`public/data/grades.json` is a single object keyed by `"SUBJECT NUMBER"`
(e.g. `"CSCE 121"`), each value an array of section records:

```json
{
  "CSCE 121": [
    { "subject": "CSCE", "number": "121", "section": "500",
      "A": 13, "B": 2, "C": 0, "D": 1, "F": 2,
      "gpa": 3.277, "last": "huang", "initial": "q", "term": "202411" }
  ]
}
```
