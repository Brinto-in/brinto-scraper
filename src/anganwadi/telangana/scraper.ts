import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';
import { URLSearchParams } from 'url';
import { upsertAnganwadiCenter } from '../../database/repositories/anganwadi-center.repository.js';
import { insertAnganwadiVacancy } from '../../database/repositories/anganwadi-vacancy.repository.js';
import { scrapeTelanganaDistricts, TelanganaDistrict } from './district_scraper.js';

const BASE_URL = 'https://mis.tgwdcw.in';
const PAGE_URL = `${BASE_URL}/Recruit_Inter.aspx`;
const STATE_NAME = 'Telangana';

// Maps the site's post dropdown text -> normalized post codes
const POST_TEXT_TO_CODE: Record<string, string> = {
    'Anganwadi Teacher': 'AWW',
    'Anganwadi Helper': 'AWH'
};

const jar = new CookieJar();
const client = wrapper(axios.create({ jar, withCredentials: true }));

const COMMON_HEADERS = {
    accept: '*/*',
    'accept-language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
    'cache-control': 'no-cache',
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    origin: BASE_URL,
    referer: PAGE_URL,
    'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    'x-microsoftajax': 'Delta=true',
    'x-requested-with': 'XMLHttpRequest'
};

export interface OptionItem {
    value: string;
    text: string;
}

function formatToISODate(dateStr?: string | null): string | null {
    if (!dateStr) return null;
    const trimmed = dateStr.trim();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        return null;
    }
    const [day, month, year] = trimmed.split('/');
    return `${year}-${month}-${day}`;
}

function getHiddenFields($: cheerio.CheerioAPI): Record<string, string> {
    const hiddenFields: Record<string, string> = {};
    $('input[type="hidden"]').each((_, el) => {
        const name = $(el).attr('name');
        if (name) hiddenFields[name] = $(el).attr('value') || '';
    });
    return hiddenFields;
}

function extractOptions($: cheerio.CheerioAPI, selector: string): OptionItem[] {
    const results: OptionItem[] = [];
    $(selector).each((_, el) => {
        const value = $(el).attr('value');
        const text = $(el).text().trim();
        if (value && value !== '0' && text && !text.toLowerCase().startsWith('--select')) {
            results.push({ value, text });
        }
    });
    return results;
}

function parseDelta(raw: string): {
    hiddenFields: Record<string, string>;
    panelHtml: string;
    errorMsg: string | null;
} {
    const parts = raw.split('|');
    const hiddenFields: Record<string, string> = {};
    let panelHtml = '';
    let errorMsg: string | null = null;

    let i = 0;
    while (i < parts.length - 3) {
        const type = parts[i + 1];
        const id = parts[i + 2];
        const content = parts[i + 3] ?? '';

        if (type === 'hiddenField' && id) {
            hiddenFields[id] = content;
        } else if (type === 'updatePanel') {
            panelHtml += content;
        } else if (type === 'error') {
            errorMsg = content || null;
        }
        i += 4;
    }

    return { hiddenFields, panelHtml, errorMsg };
}

async function fetchFreshPageState(): Promise<{
    $: cheerio.CheerioAPI;
    hiddenFields: Record<string, string>;
    posts: OptionItem[];
}> {
    const { data: html } = await client.get(PAGE_URL, {
        headers: {
            'user-agent': COMMON_HEADERS['user-agent'],
            'accept-language': COMMON_HEADERS['accept-language']
        }
    });
    const $ = cheerio.load(html);
    return {
        $,
        hiddenFields: getHiddenFields($),
        posts: extractOptions($, '#ddlPostApplied option')
    };
}

async function doAsyncPostback({
    eventTarget,
    currentFields,
    extraFields = {}
}: {
    eventTarget: string;
    currentFields: Record<string, string>;
    extraFields?: Record<string, string>;
}): Promise<{
    $: cheerio.CheerioAPI;
    updatedHiddenFields: Record<string, string>;
}> {
    const payload = new URLSearchParams();
    payload.append('ToolkitScriptManager1', `Up1|${eventTarget}`);
    payload.append('ToolkitScriptManager1_HiddenField', '');
    payload.append('__EVENTTARGET', eventTarget);
    payload.append('__EVENTARGUMENT', '');
    payload.append('__LASTFOCUS', '');

    for (const [k, v] of Object.entries(currentFields)) payload.append(k, v);
    for (const [k, v] of Object.entries(extraFields)) payload.append(k, v);

    payload.append('__ASYNCPOST', 'true');

    const { data: raw, status } = await client.post(PAGE_URL, payload.toString(), {
        headers: COMMON_HEADERS,
        validateStatus: () => true
    });

    if (status !== 200) throw new Error(`HTTP ${status} on postback for ${eventTarget}`);

    const { hiddenFields, panelHtml, errorMsg } = parseDelta(typeof raw === 'string' ? raw : String(raw));
    if (errorMsg) throw new Error(`ASP.NET AJAX error on ${eventTarget}: ${errorMsg}`);

    const $ = cheerio.load(panelHtml);
    return { $, updatedHiddenFields: hiddenFields };
}

async function withFreshStateRetry<T>(
    fn: (state: { $: cheerio.CheerioAPI; hiddenFields: Record<string, string>; posts: OptionItem[] }) => Promise<T>,
    retries = 2
): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const fresh = await fetchFreshPageState();
            return await fn(fresh);
        } catch (err) {
            lastErr = err;
            console.warn(`  Retry ${attempt + 1}/${retries} after error: ${err instanceof Error ? err.message : err}`);
            await new Promise((r) => setTimeout(r, 500));
        }
    }
    throw lastErr;
}

async function chainPostbacks(
    hiddenFields: Record<string, string>,
    steps: Array<{ eventTarget: string; extraFields?: Record<string, string> }>
): Promise<{ $: cheerio.CheerioAPI | null; fields: Record<string, string> }> {
    let fields = { ...hiddenFields };
    let $last: cheerio.CheerioAPI | null = null;

    for (const step of steps) {
        const { $, updatedHiddenFields } = await doAsyncPostback({
            eventTarget: step.eventTarget,
            currentFields: fields,
            extraFields: step.extraFields ?? {}
        });
        fields = { ...fields, ...updatedHiddenFields };
        $last = $;
    }

    return { $: $last, fields };
}

function baseSelections(overrides: Record<string, string> = {}): Record<string, string> {
    return {
        ddlPostApplied: '0',
        ddlDistrict: '0',
        ddlProject: '0',
        ddlSector: '0',
        ddlAWC: '0',
        ...overrides
    };
}

export async function getDistrictsForPost(postValue: string): Promise<{ districts: OptionItem[] }> {
    return withFreshStateRetry(async ({ hiddenFields }) => {
        const { $ } = await chainPostbacks(hiddenFields, [
            { eventTarget: 'ddlPostApplied', extraFields: baseSelections({ ddlPostApplied: postValue }) }
        ]);
        return { districts: $ ? extractOptions($, '#ddlDistrict option') : [] };
    });
}

export async function getProjectsForDistrict(
    postValue: string,
    districtValue: string
): Promise<{ projects: OptionItem[] }> {
    return withFreshStateRetry(async ({ hiddenFields }) => {
        const { $ } = await chainPostbacks(hiddenFields, [
            { eventTarget: 'ddlPostApplied', extraFields: baseSelections({ ddlPostApplied: postValue }) },
            {
                eventTarget: 'ddlDistrict',
                extraFields: baseSelections({ ddlPostApplied: postValue, ddlDistrict: districtValue })
            }
        ]);
        return { projects: $ ? extractOptions($, '#ddlProject option') : [] };
    });
}

export async function getSectorsForProject(
    postValue: string,
    districtValue: string,
    projectValue: string
): Promise<{ sectors: OptionItem[] }> {
    return withFreshStateRetry(async ({ hiddenFields }) => {
        const { $ } = await chainPostbacks(hiddenFields, [
            { eventTarget: 'ddlPostApplied', extraFields: baseSelections({ ddlPostApplied: postValue }) },
            {
                eventTarget: 'ddlDistrict',
                extraFields: baseSelections({ ddlPostApplied: postValue, ddlDistrict: districtValue })
            },
            {
                eventTarget: 'ddlProject',
                extraFields: baseSelections({
                    ddlPostApplied: postValue,
                    ddlDistrict: districtValue,
                    ddlProject: projectValue
                })
            }
        ]);
        return { sectors: $ ? extractOptions($, '#ddlSector option') : [] };
    });
}

export async function getAWCsForSector(
    postValue: string,
    districtValue: string,
    projectValue: string,
    sectorValue: string
): Promise<{ awcs: OptionItem[] }> {
    return withFreshStateRetry(async ({ hiddenFields }) => {
        const { $ } = await chainPostbacks(hiddenFields, [
            { eventTarget: 'ddlPostApplied', extraFields: baseSelections({ ddlPostApplied: postValue }) },
            {
                eventTarget: 'ddlDistrict',
                extraFields: baseSelections({ ddlPostApplied: postValue, ddlDistrict: districtValue })
            },
            {
                eventTarget: 'ddlProject',
                extraFields: baseSelections({
                    ddlPostApplied: postValue,
                    ddlDistrict: districtValue,
                    ddlProject: projectValue
                })
            },
            {
                eventTarget: 'ddlSector',
                extraFields: baseSelections({
                    ddlPostApplied: postValue,
                    ddlDistrict: districtValue,
                    ddlProject: projectValue,
                    ddlSector: sectorValue
                })
            }
        ]);
        return { awcs: $ ? extractOptions($, '#ddlAWC option') : [] };
    });
}

export async function scrapeTelanganaAnganwadi(): Promise<void> {
    console.log('[1] Fetching Telangana district notifications for start/end dates...');
    const districtsList: TelanganaDistrict[] = await scrapeTelanganaDistricts();
    const notificationMap = new Map(districtsList.map((d) => [d.districtName.toUpperCase().trim(), d]));
    console.log(`  Found ${notificationMap.size} district notifications.`);

    console.log(`[2] Loading initial recruitment page: ${PAGE_URL}`);
    const initial = await fetchFreshPageState();
    console.log(`  Found ${initial.posts.length} posts:`, initial.posts.map((p) => p.text));

    let centersUpserted = 0;
    let vacanciesUpserted = 0;
    let failures = 0;

    for (const post of initial.posts) {
        const postCode = POST_TEXT_TO_CODE[post.text] || post.text;
        console.log(`\n--- Post: ${post.text} (${post.value}) -> code ${postCode} ---`);

        const { districts } = await getDistrictsForPost(post.value);
        console.log(`  Districts found: ${districts.length}`);

        for (const district of districts) {
            const districtNotification = notificationMap.get(district.text.toUpperCase().trim());
            const startDate = formatToISODate(districtNotification?.startDate);
            const endDate = formatToISODate(districtNotification?.endDate);

            let projects: OptionItem[] = [];
            try {
                ({ projects } = await getProjectsForDistrict(post.value, district.value));
                console.log(`    District "${district.text}": ${projects.length} projects`);
            } catch (err) {
                console.error(`    District "${district.text}": FAILED (projects) -`, err instanceof Error ? err.message : err);
                failures++;
                await new Promise((r) => setTimeout(r, 300));
                continue;
            }

            for (const project of projects) {
                let sectors: OptionItem[] = [];
                try {
                    ({ sectors } = await getSectorsForProject(post.value, district.value, project.value));
                    console.log(`      Project "${project.text}": ${sectors.length} sectors`);
                } catch (err) {
                    console.error(`      Project "${project.text}": FAILED (sectors) -`, err instanceof Error ? err.message : err);
                    failures++;
                    await new Promise((r) => setTimeout(r, 300));
                    continue;
                }

                for (const sector of sectors) {
                    let awcs: OptionItem[] = [];
                    try {
                        ({ awcs } = await getAWCsForSector(post.value, district.value, project.value, sector.value));
                        console.log(`        Sector "${sector.text}": ${awcs.length} AWCs`);
                    } catch (err) {
                        console.error(`        Sector "${sector.text}": FAILED (AWCs) -`, err instanceof Error ? err.message : err);
                        failures++;
                        await new Promise((r) => setTimeout(r, 300));
                        continue;
                    }

                    for (const awc of awcs) {
                        try {
                            // 1. Upsert center
                            const centerId = await upsertAnganwadiCenter({
                                stateName: STATE_NAME,
                                districtName: district.text,
                                projectName: project.text,
                                sectorName: sector.text,
                                gp: '',
                                area: '',
                                awcName: awc.text
                            });

                            if (!centerId) {
                                throw new Error('upsertAnganwadiCenter returned no id');
                            }
                            centersUpserted++;

                            // 2. Insert/update vacancy
                            await insertAnganwadiVacancy({
                                centerId,
                                postCode,
                                postName: post.text,
                                vacancyCount: 1,
                                status: 'open',
                                startDate,
                                endDate
                            });
                            vacanciesUpserted++;
                        } catch (err) {
                            console.error(`          AWC "${awc.text}": FAILED to save -`, err instanceof Error ? err.message : err);
                            failures++;
                        }
                    }

                    await new Promise((r) => setTimeout(r, 300));
                }
            }

            await new Promise((r) => setTimeout(r, 300));
        }
    }

    console.log(`\n✓ Telangana Scraper finished! Centers: ${centersUpserted}, Vacancies: ${vacanciesUpserted}, Failures: ${failures}`);
}
