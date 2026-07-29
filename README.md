# Anganwadi Engagement Portal Scraper

Extracts the "Active / On-Hold / Cancelled Engagement Ads" table from
`engagement-awc.odisha.gov.in` for every district and both `AWW`/`AWH`
categories, and saves everything to JSON + CSV.

## Why not just replay the curl command once?

Your curl call POSTs `districtId=2421` (ANGUL only) with a hardcoded
`_csrf` and a `Cookie: cookies.txt` placeholder. That token/cookie pair is
tied to one browser session and expires, so it can't just be hardcoded into
a script. This project instead:

1. Opens a session itself (`GET` the listing page) to get a fresh session
   cookie + CSRF token.
2. Reuses that session for every district / category / tab combination,
   rotating the CSRF token if the server issues a new one on each response
   (common with Spring Security's per-request CSRF tokens).

## Setup

```bash
cd aww-scraper
npm install
```

## Configure

Open `scraper.js` and check the `AWW_LIST_URL` constant:

```js
const AWW_LIST_URL = process.env.AWW_LIST_URL || `${BASE_URL}/awwEventListForOutsider.htm`;
```

This is my best guess at the page that first renders the search form (the
GET request your browser makes right before you click "Search"). I don't
have network access to this domain to verify it, so:

1. Open the real portal page in your browser (the one with the District /
   Search by Anganwadi Name / For dropdown you posted).
2. Open DevTools → Network tab, reload, and find the very first `GET`
   request that returns the HTML page (not a `.js`/`.css`/image asset).
3. Copy its URL and either edit the constant directly, or run with:

```bash
AWW_LIST_URL="https://engagement-awc.odisha.gov.in/<actual-path>.htm" npm start
```

## Run

```bash
npm start
```

Output goes to `output/aww-events.json` and `output/aww-events.csv`, with
one row per Anganwadi center vacancy, including:

- `anganwadiCenterName`, `district`, `ruralUrbanProject`, `area`
- `vacantPositions`, `startDate`, `endDate`
- `canApply` (true if the pencil/apply icon isn't disabled)
- `awwEventId`, `applyUrl`, `viewDocumentsUrl`
- `tab` (Active / OnHold / Cancelled), `forValue` (W = AWW, H = AWH)

## Notes / things to double-check

- **Pagination**: `PAGE_SIZE` is set to 1000, which should cover any single
  district/tab/category combo based on the sample data (Angul's "Active"
  tab alone had ~189 rows). If a district has more, the script logs a
  warning — bump `PAGE_SIZE` or add real pagination (increment `page` and
  loop until `page >= totalPages`).
- **Rate limiting**: there's a 400 ms delay between requests
  (`REQUEST_DELAY_MS`) to avoid hammering a government server across
  29 districts × 2 categories × 3 tabs = 174 requests. Increase it if you
  see errors or get throttled.
- **Selective runs**: to scrape only specific districts, edit
  `districts.js` or filter it in `scraper.js` before the loop, e.g.:
  ```js
  const districts = require("./districts").filter(d => d.name === "ANGUL");
  ```
- **Column layout assumption**: the parser assumes the exact 11-column
  layout from your sample (`Sl.No, Name, District, Project, Area, Vacant,
  Start, End, Apply, Action, View Documents`). If the site changes columns,
  update the indices in `parseTable()`.
