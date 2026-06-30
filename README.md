<div align="center">

# Reveille Ratings

Rate My Professors ratings and TAMU grade distributions, shown right where you browse Texas A&M courses in the Howdy class search.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-success.svg)](https://github.com/IvanKuria/reveille-ratings/releases)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Built with WXT](https://img.shields.io/badge/built%20with-WXT-67217A.svg)](https://wxt.dev)

</div>

## Overview

Reveille Ratings is a Chrome extension for Texas A&M students, named after [Reveille](https://en.wikipedia.org/wiki/Reveille_(dog)), the university's collie mascot. It pulls Rate My Professors ratings **and** TAMU grade distributions directly into the Howdy class search, so you can size up a class without leaving the page or juggling browser tabs.

It works on Texas A&M's public Howdy class search — no login required — so you can browse and compare instructors before you ever sign in to register.

## Features

- **Inline rating badges.** Every instructor cell in the class-search results gets a compact rating badge showing the professor's Rate My Professors score at a glance.
- **Professor profiles.** Click a badge to open a side panel with the full Rate My Professors profile: rating, difficulty, would-take-again, top tags, and recent reviews.
- **Grade distributions.** The same side panel shows the course's A–F grade distribution and average GPA, drawn from the Texas A&M Registrar's public grade reports.
- **Smart matching.** Fuzzy name matching resolves the instructor shown on the page against the right RMP professor at Texas A&M.
- **Privacy first.** Ratings come straight from the public Rate My Professors API and grades ship inside the extension. No analytics, no tracking, no data collection.

## How It Works

Open the Howdy [class search](https://howdy.tamu.edu/main/activate/23) and run a search. The class list renders as an ag-Grid table, and Reveille Ratings injects a compact rating badge into each instructor cell:

```
★ 4.4
```

Click the badge to open the side panel with:

- **Rate My Professors** — rating, difficulty, would-take-again, top tags, and recent reviews, fetched live from the Rate My Professors GraphQL API in the background service worker (no server of our own).
- **Grades** — the course's A–F grade distribution and average GPA, charted from a bundled snapshot of the Texas A&M Registrar's public grade-distribution data.

> The class search is publicly accessible at
> `howdyportal.tamu.edu/uPortal/p/public-class-search-ui.ctf1/max/render.uP`
> (reachable via `howdy.tamu.edu/main/activate/23`) without signing in, so
> Reveille Ratings works for prospective students and during open browsing — not
> just inside registration.

RMP professor matching uses the full instructor name. Grade matching is by **(last name, first initial)** — that's all the registrar's grade reports expose. Scope is the **College Station** campus only (no Galveston or Qatar), and there are no instructor photos.

## Install

> Not yet on the Chrome Web Store. Manual install for now:

1. Clone or download this repo.
2. Run `npm install && npm run build`.
3. Open `chrome://extensions/` and enable **Developer mode**.
4. Click **Load unpacked** and select the `.output/chrome-mv3` folder.

## Development

```bash
git clone https://github.com/IvanKuria/reveille-ratings.git
cd reveille-ratings
npm install
npm run dev
```

WXT loads the extension automatically while `npm run dev` is running. Other handy scripts:

```bash
npm run typecheck   # wxt prepare + tsc --noEmit
npm run test        # vitest
npm run format      # prettier --write .
```

## Refreshing Grade Data

Grades ship as a static snapshot at `public/data/grades.json` — there is **no runtime grade server**. The current bundle holds roughly **20,700 sections** across about **4,150 courses**.

The snapshot is generated offline by a maintainer-run build script that downloads the Texas A&M Registrar's public grade-distribution PDFs from `https://web-as.tamu.edu/gradereports/`, parses them, and writes `public/data/grades.json`:

```bash
npm run build:grades
```

Re-run it whenever a new term's grades are published, then commit the regenerated file. See [`scripts/build-grades/README.md`](scripts/build-grades/README.md) for the college codes, term codes, and other knobs.

> Note: the registrar suppresses (for FERPA reasons) any section with fewer than five students, so very small sections won't carry grade data.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [WXT](https://wxt.dev) 0.20 (Vite-based, Manifest V3) |
| UI | React 18, TypeScript, [Tailwind CSS](https://tailwindcss.com) v4 |
| Charts | [Recharts](https://recharts.org) (grade distributions) |
| Search | [Fuse.js](https://fusejs.io) (fuzzy instructor matching) |
| APIs | Rate My Professors GraphQL (school id `1003`) |
| Grades | Static snapshot built from TAMU Registrar PDFs |
| Extension | Chrome Manifest V3, Side Panel API |

## Architecture

Texas A&M's Howdy class search is a uPortal portlet that renders results into an [ag-Grid](https://www.ag-grid.com) table. Rather than intercept any network traffic, Reveille Ratings watches the page for the rendered grid and reads each row's instructor and course straight from the DOM.

```
Content script                         Background SW              Side Panel
--------------                         ------------              ----------
Observe the ag-Grid table          ->  Fetch RMP (GraphQL)   ->  Professor profile
Parse instructor + course per row      Match best professor      Grade distribution
Inject rating badge per cell           Look up bundled grades    Reviews + GPA
Open side panel on badge click
```

- **Content script** watches the class-search grid, parses each row to read the instructor and course, then injects a compact rating badge into the instructor cell.
- **Background service worker** handles Rate My Professors GraphQL calls (TAMU school id `1003`) and fuzzy name matching — no server of our own.
- **Side panel** displays the full professor profile plus the course's A–F grade distribution and average GPA, looked up from the bundled grade snapshot.

## Privacy

- Reveille Ratings only reads the public class-search page DOM and calls the public Rate My Professors API. Only an instructor's name is ever sent — never anything about you.
- Grade data ships inside the extension; no grade requests leave your browser at runtime.
- No analytics or telemetry.

## Credits

Reveille Ratings is part of a family of sibling extensions that inject Rate My Professors ratings into campus class-search tools:

- [Rate My Slugs](https://github.com/IvanKuria/rate-my-slugs) — UC Santa Cruz
- [AggieRatings](https://github.com/IvanKuria/aggie-ratings) — UC Davis
- [Buzz Ratings](https://github.com/IvanKuria/buzz-ratings) — Georgia Tech
- [Buckeye Ratings](https://github.com/IvanKuria/buckeye-ratings) — Ohio State

## License

MIT. See [LICENSE](LICENSE) for details.
