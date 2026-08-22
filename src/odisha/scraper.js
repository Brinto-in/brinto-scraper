/**
 * Anganwadi Engagement Portal (Odisha) scraper
 * ------------------------------------------------
 * Reproduces the browser flow used by the site's own JS (`serverDatatable`
 * class in the page you gave me): a session-scoped CSRF token is embedded
 * in the page, and the results table is fetched via a POST form submit to
 *   https://engagement-awc.odisha.gov.in/modifyawwEventListForOutsider.htm
 * which returns the *whole page* re-rendered with the new table+CSRF token.
 *
 * This script:
 *   1. GETs a starting page to establish a session cookie + CSRF token.
 *   2. POSTs the search form for every (district, AWW/AWH, tab) combo.
 *   3. Parses table#dynamicTable1 rows with cheerio.
 *   4. Writes combined results to ./output/aww-events.json and .csv
 *
 * IMPORTANT: You must set AWW_LIST_URL below to the actual page that
 * *first* renders this form in your browser (Network tab -> the GET request
 * right before the POSTs start). I could not verify it since I don't have
 * network access to this domain, so it's left as a configurable constant.
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const axios = require("axios");
const { wrapper } = require("axios-cookiejar-support");
const { CookieJar } = require("tough-cookie");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const districts = require("./districts");

// ---------------------------------------------------------------------
// Config — adjust as needed
// ---------------------------------------------------------------------
const BASE_URL = "https://engagement-awc.odisha.gov.in";
const AWW_LIST_URL = `${BASE_URL}/awwEventListForOutsider.htm`;
const POST_URL = `${BASE_URL}/modifyawwEventListForOutsider.htm`;

const TABS = [
  { value: "pendingTabId", label: "Active" },
  // { value: "verifiedTabId", label: "OnHold" },
  // { value: "approvedTabId", label: "Cancelled" },
];
const FOR_VALUES = ["W", "H"]; // AWW / AWH
const PAGE_SIZE = 100; // large enough to grab everything in one page
const REQUEST_DELAY_MS = 400; // be polite to the server

// Switch between true (only include active records whose endDate is today or in the future)
// and false (keep all records without filtering by date)
const FILTER_FUTURE_END_DATE = true;

// API configuration for pushing records to DB
const API_URL = "https://outsource.brinto.in/api/anganwadi";
const API_SYNC_ENABLED = true;

const OUTPUT_DIR = path.join(__dirname, "output");

// Helper to convert DD/MM/YYYY or DD-MM-YYYY or Date strings to YYYY-MM-DD format
function formatDateToISO(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.trim().split(/[\/-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // Already YYYY-MM-DD
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else {
      // DD/MM/YYYY -> YYYY-MM-DD
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return dateStr;
}

// Helper to check if a record is active based on its endDate
function isRecordActive(endDateStr) {
  if (!endDateStr) return true;

  const parts = endDateStr.trim().split(/[\/-]/);
  let endDate;
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      endDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      // DD/MM/YYYY or DD-MM-YYYY
      endDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    }
  } else {
    endDate = new Date(endDateStr);
  }

  if (isNaN(endDate.getTime())) return true; // fallback if unparseable

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return endDate >= today;
}

// ---------------------------------------------------------------------
// HTTP client with cookie jar (auto-persists JSESSIONID across requests)
// ---------------------------------------------------------------------
const jar = new CookieJar();
const client = wrapper(
  axios.create({
    jar,
    withCredentials: true,
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    validateStatus: () => true, // handle non-2xx manually
  })
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------
// CSRF extraction — the page embeds it as:  csrf : '05b88ffb-...'
// ---------------------------------------------------------------------
function extractCsrf(html) {
  if (!html) return null;
  const $ = cheerio.load(html);

  // 1. Hidden input field
  const inputCsrf = $('input[name="_csrf"]').val();
  if (inputCsrf) return inputCsrf;

  // 2. Meta tag
  const metaCsrf = $('meta[name="_csrf"]').attr("content") || $('meta[name="csrf-token"]').attr("content");
  if (metaCsrf) return metaCsrf;

  // 3. JS variable pattern e.g. csrf : '05b88ffb-...' or _csrf = '...'
  const match = html.match(/(?:csrf|_csrf)\s*[:=]\s*['"]([0-9a-fA-F-]{36})['"]/i);
  if (match) return match[1];

  // 4. Any UUID-like token in input/JS
  const uuidMatch = html.match(/name=["']_csrf["']\s+value=["']([a-f0-9-]{36})["']/i) || html.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
  if (uuidMatch) return uuidMatch[1];

  return null;
}

async function resolveCsrfToken(html) {
  const extracted = extractCsrf(html);
  if (extracted) return extracted;
  const cookies = await jar.getCookies(BASE_URL);
  const xsrfCookie = cookies.find((c) => c.key === "XSRF-TOKEN");
  return xsrfCookie ? xsrfCookie.value : "";
}

async function initializeSession() {
  console.log(`[session] Initializing session by GET ${AWW_LIST_URL}`);
  const res = await client.get(AWW_LIST_URL);
  if (res.status >= 400) {
    throw new Error(
      `Bootstrap GET failed with status ${res.status}.`
    );
  }
  const csrf = await resolveCsrfToken(res.data);
  console.log(`[session] Initial CSRF token resolved: "${csrf}"`);
  return csrf;
}

// ---------------------------------------------------------------------
// Table parsing
// ---------------------------------------------------------------------
function parseEventIdFromHref(href) {
  if (!href) return null;
  const m = href.match(/awwEventId=(\d+)/);
  return m ? m[1] : null;
}

function parseResultsTable(html, meta) {
  const $ = cheerio.load(html);
  const rows = [];

  $("#dynamicTable1 tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 11) return; // skip malformed/empty rows

    const get = (i) => $(tds[i]).text().trim();

    const applyHref = $(tds[8]).find("a").attr("href");
    const viewDocHref = $(tds[10]).find("a").attr("href");

    const record = {
      state: "Odisha",
      slNo: get(0),
      anganwadiCenterName: get(1),
      district: get(2),
      ruralUrbanProject: get(3),
      area: get(4).replace(/\s+/g, " ").trim(),
      vacantPositions: get(5),
      startDate: formatDateToISO(get(6)),
      endDate: formatDateToISO(get(7)),
      canApply: !!applyHref,
      awwEventId: parseEventIdFromHref(applyHref) || parseEventIdFromHref(viewDocHref),
      applyUrl: applyHref ? new URL(applyHref, BASE_URL).toString() : null,
      viewDocumentsUrl: viewDocHref ? new URL(viewDocHref, BASE_URL).toString() : null,
      tab: meta.tabLabel,
      searchedDistrict: meta.districtName,
      forValue: meta.isAwwValue, // W = AWW, H = AWH
    };

    if (!FILTER_FUTURE_END_DATE || isRecordActive(record.endDate)) {
      rows.push(record);
    }
  });

  // "Showing page X of Y pages"
  const counterText = $("#dt-counter").first().text().trim();
  const pageMatch = counterText.match(/(\d+)\s*of\s*(\d+)/i);
  const totalPages = pageMatch ? parseInt(pageMatch[2], 10) : 1;

  return { rows, totalPages };
}

// ---------------------------------------------------------------------
// Single search request
// ---------------------------------------------------------------------
async function fetchResultsPage({ csrf, districtId, isAwwValue, tabValue, page, size, searchTerm = "" }) {
  const currentCsrf = csrf || (await resolveCsrfToken());

  const body = new URLSearchParams({
    _csrf: currentCsrf,
    searchTerm,
    page: String(page),
    size: String(size),
    tabValue,
    districtId: String(districtId),
    isAwwValue,
  });

  const res = await client.post(POST_URL, body.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": AWW_LIST_URL,
      "X-XSRF-TOKEN": currentCsrf,
      "X-CSRF-TOKEN": currentCsrf,
    },
  });

  if (res.status >= 400) {
    throw new Error(`POST failed (${res.status}) for district=${districtId} tab=${tabValue} for=${isAwwValue}`);
  }

  const newCsrf = (await resolveCsrfToken(res.data)) || currentCsrf;
  return { html: res.data, csrf: newCsrf };
}

// ---------------------------------------------------------------------
// CSV writer (no extra dependency)
// ---------------------------------------------------------------------
function toCsv(rows) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (val) => {
    const s = val === null || val === undefined ? "" : String(val);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------
// API Syncing Function
// ---------------------------------------------------------------------
async function syncRecordsToApi(rows) {
  if (!API_SYNC_ENABLED || rows.length === 0) return { successCount: 0, failCount: 0 };
  console.log(`\n[api-sync] Sending ${rows.length} records to ${API_URL}...`);
  let successCount = 0;
  let failCount = 0;

  for (const row of rows) {
    const payload = {
      state: row.state || "Odisha",
      anganwadiCenterName: row.anganwadiCenterName,
      district: row.district,
      ruralUrbanProject: row.ruralUrbanProject,
      area: row.area,
      vacantPositions: row.vacantPositions,
      startDate: row.startDate,
      endDate: row.endDate,
      canApply: row.canApply,
      awwEventId: row.awwEventId,
      applyUrl: row.applyUrl,
      viewDocumentsUrl: row.viewDocumentsUrl,
      tab: row.tab,
      forValue: row.forValue,
    };

    try {
      const res = await axios.post(API_URL, payload, {
        headers: { "Content-Type": "application/json" },
      });
      if (res.status >= 200 && res.status < 300) {
        successCount++;
      } else {
        failCount++;
        console.error(`[api-sync error] Status ${res.status} for awwEventId=${row.awwEventId}`);
      }
    } catch (err) {
      failCount++;
      console.error(`[api-sync error] ${err.message} for awwEventId=${row.awwEventId}`);
    }
  }

  console.log(`[api-sync] Done. Successfully synced: ${successCount}, Failed: ${failCount}`);
  return { successCount, failCount };
}

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------
async function main() {
  // fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let csrf = await initializeSession();
  const allRows = [];
  const errors = [];

  for (const district of districts) {
    for (const forValue of FOR_VALUES) {
      for (const tab of TABS) {
        try {
          console.log(`[fetch] district=${district.name} for=${forValue} tab=${tab.label}`);
          const { html, csrf: newCsrf } = await fetchResultsPage({
            csrf,
            districtId: district.id,
            isAwwValue: forValue,
            tabValue: tab.value,
            page: 0,
            size: PAGE_SIZE,
          });
          csrf = newCsrf;

          const { rows, totalPages } = parseResultsTable(html, {
            tabLabel: tab.label,
            districtName: district.name,
            isAwwValue: forValue,
          });
          allRows.push(...rows);

          if (totalPages > 1) {
            console.warn(
              `[warn] district=${district.name} for=${forValue} tab=${tab.label} has ${totalPages} pages ` +
              `at size=${PAGE_SIZE}; consider raising PAGE_SIZE or adding pagination handling.`
            );
          }
        } catch (err) {
          console.error(`[error] ${err.message}`);
          errors.push({ district: district.name, forValue, tab: tab.label, error: err.message });
        }
        await sleep(REQUEST_DELAY_MS);
      }
    }
  }

  console.log(`\nScraping complete. Found ${allRows.length} rows.`);

  if (errors.length) {
    console.log(`There were ${errors.length} requests that failed during the process.`);
    // const errPath = path.join(OUTPUT_DIR, "errors.json");
    // fs.writeFileSync(errPath, JSON.stringify(errors, null, 2), "utf8");
    // console.log(`  ${errors.length} requests failed — see ${errPath}`);
  }

  // Push synced records to API
  await syncRecordsToApi(allRows);
}

// main().catch((err) => {
//   console.error(err);
//   process.exit(1);
// });

module.exports = { main };
