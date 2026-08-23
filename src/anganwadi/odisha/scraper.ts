import axios, {
    AxiosInstance
} from "axios";

import {
    wrapper
} from "axios-cookiejar-support";

import {
    CookieJar
} from "tough-cookie";

import * as cheerio from "cheerio";
import districts from "./districts.js";
import { upsertAnganwadiCenter } from "../../database/repositories/anganwadi-center.repository.js";
import { insertAnganwadiVacancy } from "../../database/repositories/anganwadi-vacancy.repository.js";

// ---------------------------------------------------------------------
// SSL
// ---------------------------------------------------------------------

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface AwwRecord {
    state: string;
    slNo: string;
    anganwadiCenterName: string;
    district: string;
    ruralUrbanProject: string;
    area: string;
    vacantPositions: string;
    startDate: string;
    endDate: string;
    canApply: boolean;
    awwEventId: string | null;
    applyUrl: string | null;
    viewDocumentsUrl: string | null;
    tab: string;
    searchedDistrict: string;
    forValue: string;
}

interface Tab {
    value: string;
    label: string;
}

interface RecordMeta {
    tabLabel: string;
    districtName: string;
    isAwwValue: string;
}

interface FetchResultsParams {
    csrf: string;
    districtId: number;
    isAwwValue: string;
    tabValue: string;
    page: number;
    size: number;
    searchTerm?: string;
}

interface FetchResultsResponse {
    html: string;
    csrf: string;
}

interface ParsedResults {
    rows: AwwRecord[];
    totalPages: number;
}

interface ScrapeError {
    district: string;
    forValue: string;
    tab: string;
    error: string;
}

interface SyncResult {
    successCount: number;
    failCount: number;
}

// ---------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------

const BASE_URL =
    "https://engagement-awc.odisha.gov.in";

const AWW_LIST_URL =
    `${BASE_URL}/awwEventListForOutsider.htm`;

const POST_URL =
    `${BASE_URL}/modifyawwEventListForOutsider.htm`;

const TABS: Tab[] = [
    {
        value: "pendingTabId",
        label: "Active"
    }

    // Uncomment if required
    // {
    //     value: "verifiedTabId",
    //     label: "OnHold"
    // },
    // {
    //     value: "approvedTabId",
    //     label: "Cancelled"
    // }
];

const FOR_VALUES: string[] = [
    "W",
    "H"
];

const PAGE_SIZE = 100;

const REQUEST_DELAY_MS = 400;

const FILTER_FUTURE_END_DATE = true;

// ---------------------------------------------------------------------
// API
// ---------------------------------------------------------------------

const API_URL =
    "https://outsource.brinto.in/api/anganwadi";

const API_SYNC_ENABLED = true;

// ---------------------------------------------------------------------
// HTTP Client
// ---------------------------------------------------------------------

const jar = new CookieJar();

const client: AxiosInstance =
    wrapper(
        axios.create({
            jar,
            withCredentials: true,

            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
                    "AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/120.0.0.0 Safari/537.36",

                Accept:
                    "text/html,application/xhtml+xml,application/xml;q=0.9," +
                    "image/avif,image/webp,*/*;q=0.8",

                "Accept-Language":
                    "en-US,en;q=0.9"
            },

            validateStatus:
                () => true
        })
    );

// ---------------------------------------------------------------------
// Sleep
// ---------------------------------------------------------------------

function sleep(
    ms: number
): Promise<void> {
    return new Promise(
        resolve => setTimeout(resolve, ms)
    );
}

// ---------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------

function formatDateToISO(
    dateStr?: string
): string {

    if (!dateStr) {
        return "";
    }

    const parts: any =
        dateStr
            .trim()
            .split(/[\/-]/);

    if (parts.length === 3) {

        if (parts[0].length === 4) {

            // YYYY-MM-DD

            return (
                `${parts[0]}-` +
                `${parts[1].padStart(2, "0")}-` +
                `${parts[2].padStart(2, "0")}`
            );
        }

        // DD/MM/YYYY

        return (
            `${parts[2]}-` +
            `${parts[1].padStart(2, "0")}-` +
            `${parts[0].padStart(2, "0")}`
        );
    }

    return dateStr;
}

// ---------------------------------------------------------------------
// Check active record
// ---------------------------------------------------------------------

function isRecordActive(
    endDateStr?: string
): boolean {

    if (!endDateStr) {
        return true;
    }

    const parts: any =
        endDateStr
            .trim()
            .split(/[\/-]/);

    let endDate: Date;

    if (parts.length === 3) {

        if (parts[0].length === 4) {

            // YYYY-MM-DD

            endDate =
                new Date(
                    parseInt(parts[0], 10),
                    parseInt(parts[1], 10) - 1,
                    parseInt(parts[2], 10)
                );

        } else {

            // DD/MM/YYYY

            endDate =
                new Date(
                    parseInt(parts[2], 10),
                    parseInt(parts[1], 10) - 1,
                    parseInt(parts[0], 10)
                );
        }

    } else {

        endDate =
            new Date(endDateStr);
    }

    if (
        isNaN(
            endDate.getTime()
        )
    ) {
        return true;
    }

    const today =
        new Date();

    today.setHours(
        0,
        0,
        0,
        0
    );

    return endDate >= today;
}

// ---------------------------------------------------------------------
// CSRF extraction
// ---------------------------------------------------------------------

function extractCsrf(
    html: string
): string | null {

    if (!html) {
        return null;
    }

    const $ =
        cheerio.load(html);

    // 1. Hidden input

    const inputCsrf =
        $('input[name="_csrf"]').val();

    if (
        typeof inputCsrf === "string" &&
        inputCsrf
    ) {
        return inputCsrf;
    }

    // 2. Meta tag

    const metaCsrf =
        $('meta[name="_csrf"]')
            .attr("content") ||
        $('meta[name="csrf-token"]')
            .attr("content");

    if (metaCsrf) {
        return metaCsrf;
    }

    // 3. JavaScript variable

    const match: any =
        html.match(
            /(?:csrf|_csrf)\s*[:=]\s*['"]([0-9a-fA-F-]{36})['"]/i
        );

    if (match) {
        return match[1];
    }

    // 4. UUID-like token

    const uuidMatch: any =
        html.match(
            /name=["']_csrf["']\s+value=["']([a-f0-9-]{36})["']/i
        ) ||
        html.match(
            /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i
        );

    if (uuidMatch) {
        return uuidMatch[1];
    }

    return null;
}

// ---------------------------------------------------------------------
// Resolve CSRF token
// ---------------------------------------------------------------------

async function resolveCsrfToken(
    html?: string
): Promise<string> {

    const extracted =
        html
            ? extractCsrf(html)
            : null;

    if (extracted) {
        return extracted;
    }

    const cookies =
        await jar.getCookies(
            BASE_URL
        );

    const xsrfCookie =
        cookies.find(
            cookie =>
                cookie.key ===
                "XSRF-TOKEN"
        );

    return (
        xsrfCookie?.value ??
        ""
    );
}

// ---------------------------------------------------------------------
// Initialize session
// ---------------------------------------------------------------------

async function initializeSession(): Promise<string> {

    // console.log(
    //     `[session] GET ${AWW_LIST_URL}`
    // );

    const res =
        await client.get<string>(
            AWW_LIST_URL
        );

    if (res.status >= 400) {

        throw new Error(
            `Bootstrap GET failed with status ${res.status}`
        );
    }

    const csrf =
        await resolveCsrfToken(
            res.data
        );

    // console.log(
    //     `[session] CSRF token resolved: ${csrf}`
    // );

    return csrf;
}

// ---------------------------------------------------------------------
// Event ID
// ---------------------------------------------------------------------

function parseEventIdFromHref(
    href?: string
): string | null {

    if (!href) {
        return null;
    }

    const match: any =
        href.match(
            /awwEventId=(\d+)/
        );

    return match
        ? match[1]
        : null;
}

// ---------------------------------------------------------------------
// Parse HTML table
// ---------------------------------------------------------------------

function parseResultsTable(
    html: string,
    meta: RecordMeta
): ParsedResults {

    const $ =
        cheerio.load(html);

    const rows: AwwRecord[] = [];

    $("#dynamicTable1 tbody tr")
        .each((_, tr) => {

            const tds =
                $(tr).find("td");

            if (tds.length < 11) {
                return;
            }

            const get =
                (index: number): string =>
                    $(tds[index])
                        .text()
                        .trim();

            const applyHref =
                $(tds[8])
                    .find("a")
                    .attr("href");

            const viewDocHref =
                $(tds[10])
                    .find("a")
                    .attr("href");

            const record: AwwRecord = {

                state: "Odisha",

                slNo:
                    get(0),

                anganwadiCenterName:
                    get(1),

                district:
                    get(2),

                ruralUrbanProject:
                    get(3),

                area:
                    get(4)
                        .replace(/\s+/g, " ")
                        .trim(),

                vacantPositions:
                    get(5),

                startDate:
                    formatDateToISO(
                        get(6)
                    ),

                endDate:
                    formatDateToISO(
                        get(7)
                    ),

                canApply:
                    Boolean(
                        applyHref
                    ),

                awwEventId:
                    parseEventIdFromHref(
                        applyHref
                    ) ||
                    parseEventIdFromHref(
                        viewDocHref
                    ),

                applyUrl:
                    applyHref
                        ? new URL(
                            applyHref,
                            BASE_URL
                        ).toString()
                        : null,

                viewDocumentsUrl:
                    viewDocHref
                        ? new URL(
                            viewDocHref,
                            BASE_URL
                        ).toString()
                        : null,

                tab:
                    meta.tabLabel,

                searchedDistrict:
                    meta.districtName,

                forValue:
                    meta.isAwwValue
            };

            if (
                !FILTER_FUTURE_END_DATE ||
                isRecordActive(
                    record.endDate
                )
            ) {
                rows.push(record);
            }
        });

    // Find total pages

    const counterText =
        $("#dt-counter")
            .first()
            .text()
            .trim();

    const pageMatch: any =
        counterText.match(
            /(\d+)\s*of\s*(\d+)/i
        );

    const totalPages =
        pageMatch
            ? parseInt(
                pageMatch[2],
                10
            )
            : 1;

    return {
        rows,
        totalPages
    };
}

// ---------------------------------------------------------------------
// Fetch results
// ---------------------------------------------------------------------

async function fetchResultsPage(
    params: FetchResultsParams
): Promise<FetchResultsResponse> {

    const {
        csrf,
        districtId,
        isAwwValue,
        tabValue,
        page,
        size,
        searchTerm = ""
    } = params;

    const currentCsrf =
        csrf ||
        await resolveCsrfToken();

    const body =
        new URLSearchParams({

            _csrf:
                currentCsrf,

            searchTerm,

            page:
                String(page),

            size:
                String(size),

            tabValue,

            districtId:
                String(districtId),

            isAwwValue
        });

    const res =
        await client.post<string>(
            POST_URL,
            body.toString(),
            {
                headers: {

                    "Content-Type":
                        "application/x-www-form-urlencoded",

                    Referer:
                        AWW_LIST_URL,

                    "X-XSRF-TOKEN":
                        currentCsrf,

                    "X-CSRF-TOKEN":
                        currentCsrf
                }
            }
        );

    if (res.status >= 400) {

        throw new Error(
            `POST failed (${res.status}) ` +
            `district=${districtId} ` +
            `tab=${tabValue} ` +
            `for=${isAwwValue}`
        );
    }

    const newCsrf =
        await resolveCsrfToken(
            res.data
        ) ||
        currentCsrf;

    return {
        html:
            res.data,

        csrf:
            newCsrf
    };
}

// ---------------------------------------------------------------------
// API sync
// ---------------------------------------------------------------------

async function syncRecordsToApi(
    rows: AwwRecord[]
): Promise<SyncResult> {

    if (
        !API_SYNC_ENABLED ||
        rows.length === 0
    ) {
        return {
            successCount: 0,
            failCount: 0
        };
    }

    // console.log(
    //     `\n[api-sync] Sending ${rows.length} records`
    // );

    let successCount = 0;
    let failCount = 0;

    for (const row of rows) {

        const payload = {

            state:
                row.state || "Odisha",

            anganwadiCenterName:
                row.anganwadiCenterName,

            district:
                row.district,

            ruralUrbanProject:
                row.ruralUrbanProject,

            area:
                row.area,

            vacantPositions:
                row.vacantPositions,

            startDate:
                row.startDate,

            endDate:
                row.endDate,

            canApply:
                row.canApply,

            awwEventId:
                row.awwEventId,

            applyUrl:
                row.applyUrl,

            viewDocumentsUrl:
                row.viewDocumentsUrl,

            tab:
                row.tab,

            forValue:
                row.forValue
        };

        try {

            const res =
                await axios.post(
                    API_URL,
                    payload,
                    {
                        headers: {
                            "Content-Type":
                                "application/json"
                        }
                    }
                );

            if (
                res.status >= 200 &&
                res.status < 300
            ) {

                successCount++;

            } else {

                failCount++;

                console.error(
                    `[api-sync error] ` +
                    `Status ${res.status} ` +
                    `awwEventId=${row.awwEventId}`
                );
            }

        } catch (err: unknown) {

            failCount++;

            const message =
                err instanceof Error
                    ? err.message
                    : String(err);

            console.error(
                `[api-sync error] ${message} ` +
                `awwEventId=${row.awwEventId}`
            );
        }
    }

    // console.log(
    //     `[api-sync] Done. ` +
    //     `Successfully synced: ${successCount}, ` +
    //     `Failed: ${failCount}`
    // );

    return {
        successCount,
        failCount
    };
}

async function syncRecordsToDatabase(
    rows: AwwRecord[]
): Promise<SyncResult> {

    if (rows.length === 0) {
        return {
            successCount: 0,
            failCount: 0
        };
    }

    let successCount = 0;
    let failCount = 0;

    for (const row of rows) {

        try {

            // ========================================================
            // 1. INSERT / GET ANGANWADI CENTER
            // ========================================================

            const centerId =
                await upsertAnganwadiCenter({

                    stateName:
                        row.state || 'Odisha',

                    districtName:
                        row.district,

                    projectName:
                        row.ruralUrbanProject,

                    sectorName:
                        '',

                    gp:
                        '',

                    area:
                        row.area,

                    awcName:
                        row.anganwadiCenterName
                });

            // ========================================================
            // 2. INSERT / UPDATE VACANCY
            // ========================================================

            await insertAnganwadiVacancy({

                centerId,

                postCode:
                    row.forValue,

                postName:
                    row.forValue === 'W'
                        ? 'Anganwadi Worker'
                        : 'Anganwadi Helper',

                vacancyCount:
                    Number(row.vacantPositions) || 0,

                status:
                    row.canApply
                        ? 'open'
                        : 'closed',

                startDate:
                    row.startDate || null,

                endDate:
                    row.endDate || null
            });

            successCount++;

        } catch (err: unknown) {

            failCount++;

            const message =
                err instanceof Error
                    ? err.message
                    : String(err);

            console.error(
                `[db-sync error] ${message} ` +
                `awwEventId=${row.awwEventId}`
            );
        }
    }

    return {
        successCount,
        failCount
    };
}

// ---------------------------------------------------------------------
// MAIN EXPORTED SCRAPER FUNCTION
// ---------------------------------------------------------------------

export async function scrapeOdishaAnganwadi(): Promise<AwwRecord[]> {

    let csrf =
        await initializeSession();

    const allRows: AwwRecord[] = [];

    const errors: ScrapeError[] = [];

    for (
        const district of districts
    ) {

        for (
            const forValue of FOR_VALUES
        ) {

            for (
                const tab of TABS
            ) {

                try {

                    // console.log(
                    //     `[fetch] district=${district.name} ` +
                    //     `for=${forValue} ` +
                    //     `tab=${tab.label}`
                    // );

                    const {
                        html,
                        csrf: newCsrf
                    } =
                        await fetchResultsPage({

                            csrf,

                            districtId:
                                district.id,

                            isAwwValue:
                                forValue,

                            tabValue:
                                tab.value,

                            page: 0,

                            size:
                                PAGE_SIZE
                        });

                    csrf =
                        newCsrf;

                    const {
                        rows,
                        totalPages
                    } =
                        parseResultsTable(
                            html,
                            {
                                tabLabel:
                                    tab.label,

                                districtName:
                                    district.name,

                                isAwwValue:
                                    forValue
                            }
                        );

                    allRows.push(
                        ...rows
                    );

                    // console.log(
                    //     `[fetch] Found ${rows.length} records`
                    // );

                    if (
                        totalPages > 1
                    ) {

                        console.warn(
                            `[warn] ${district.name} ` +
                            `has ${totalPages} pages`
                        );
                    }

                } catch (
                err: unknown
                ) {

                    const message =
                        err instanceof Error
                            ? err.message
                            : String(err);

                    console.error(
                        `[error] ${message}`
                    );

                    errors.push({

                        district:
                            district.name,

                        forValue,

                        tab:
                            tab.label,

                        error:
                            message
                    });
                }

                await sleep(
                    REQUEST_DELAY_MS
                );
            }
        }
    }

    console.log(
        `\nScraping complete. ` +
        `Found ${allRows.length} rows.`
    );

    if (
        errors.length > 0
    ) {

        console.log(
            `Failed requests: ${errors.length}`
        );
    }

    // Sync to API

    await syncRecordsToDatabase(
        allRows
    );

    // IMPORTANT:
    // Return the records to index.ts

    return allRows;
}