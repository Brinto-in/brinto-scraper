// npm install axios axios-cookiejar-support tough-cookie cheerio @libsql/client dotenv

const axios = require('axios').default;
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');
const { URLSearchParams } = require('url');

const { setupAnganwadiCentersTable, upsertCenter } = require('../db-configs/anganwadi_centers.js');
const { setupAnganwadiVacanciesTable, upsertVacancies } = require('../db-configs/anganwadi_vacancies.js');

const BASE_URL = 'https://mis.tgwdcw.in';
const PAGE_URL = `${BASE_URL}/Recruit_Inter.aspx`;
const STATE_NAME = 'Telangana';

// Maps the site's post dropdown text -> normalized post codes
// (normalized so different state portals can map to the same codes)
const POST_TEXT_TO_CODE = {
    'Anganwadi Teacher': 'AWW',
    'Anganwadi Helper': 'AWH',
};

const jar = new CookieJar();
const client = wrapper(axios.create({ jar, withCredentials: true }));

const COMMON_HEADERS = {
    'accept': '*/*',
    'accept-language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
    'cache-control': 'no-cache',
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'origin': BASE_URL,
    'referer': PAGE_URL,
    'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    'x-microsoftajax': 'Delta=true',
    'x-requested-with': 'XMLHttpRequest',
};

// ---------- HTML / delta parsing helpers ----------

function getHiddenFields($) {
    const hiddenFields = {};
    $('input[type="hidden"]').each((_, el) => {
        const name = $(el).attr('name');
        if (name) hiddenFields[name] = $(el).attr('value') || '';
    });
    return hiddenFields;
}

function extractOptions($, selector) {
    const results = [];
    $(selector).each((_, el) => {
        const value = $(el).attr('value');
        const text = $(el).text().trim();
        if (value && value !== '0') results.push({ value, text });
    });
    return results;
}

function parseDelta(raw) {
    const parts = raw.split('|');
    const hiddenFields = {};
    let panelHtml = '';
    let errorMsg = null;

    let i = 0;
    while (i < parts.length - 3) {
        const type = parts[i + 1];
        const id = parts[i + 2];
        const content = parts[i + 3];

        if (type === 'hiddenField') {
            hiddenFields[id] = content;
        } else if (type === 'updatePanel') {
            panelHtml += content;
        } else if (type === 'error') {
            errorMsg = content;
        }
        i += 4;
    }

    return { hiddenFields, panelHtml, errorMsg };
}

// ---------- Core request helpers ----------

async function fetchFreshPageState() {
    const { data: html } = await client.get(PAGE_URL, {
        headers: {
            'user-agent': COMMON_HEADERS['user-agent'],
            'accept-language': COMMON_HEADERS['accept-language'],
        },
    });
    const $ = cheerio.load(html);
    return {
        $,
        hiddenFields: getHiddenFields($),
        posts: extractOptions($, '#ddlPostApplied option'),
    };
}

async function doAsyncPostback({ eventTarget, currentFields, extraFields = {} }) {
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
        validateStatus: () => true,
    });

    if (status !== 200) throw new Error(`HTTP ${status} on postback for ${eventTarget}`);

    const { hiddenFields, panelHtml, errorMsg } = parseDelta(raw);
    if (errorMsg) throw new Error(`ASP.NET AJAX error on ${eventTarget}: ${errorMsg}`);

    const $ = cheerio.load(panelHtml);
    return { $, updatedHiddenFields: hiddenFields };
}

async function withFreshStateRetry(fn, retries = 2) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const fresh = await fetchFreshPageState();
            return await fn(fresh);
        } catch (err) {
            lastErr = err;
            console.warn(`  Retry ${attempt + 1}/${retries} after error: ${err.message}`);
            await new Promise(r => setTimeout(r, 500));
        }
    }
    throw lastErr;
}

async function chainPostbacks(hiddenFields, steps) {
    let fields = { ...hiddenFields };
    let $last = null;

    for (const step of steps) {
        const { $, updatedHiddenFields } = await doAsyncPostback({
            eventTarget: step.eventTarget,
            currentFields: fields,
            extraFields: step.extraFields,
        });
        fields = { ...fields, ...updatedHiddenFields };
        $last = $;
    }

    return { $: $last, fields };
}

function baseSelections(overrides = {}) {
    return {
        ddlPostApplied: '0',
        ddlDistrict: '0',
        ddlProject: '0',
        ddlSector: '0',
        ddlAWC: '0',
        ...overrides,
    };
}

// ---------- Dropdown-chain fetchers ----------

async function getDistrictsForPost(postValue) {
    return withFreshStateRetry(async ({ hiddenFields }) => {
        const { $ } = await chainPostbacks(hiddenFields, [
            { eventTarget: 'ddlPostApplied', extraFields: baseSelections({ ddlPostApplied: postValue }) },
        ]);
        return { districts: extractOptions($, '#ddlDistrict option') };
    });
}

async function getProjectsForDistrict(postValue, districtValue) {
    return withFreshStateRetry(async ({ hiddenFields }) => {
        const { $ } = await chainPostbacks(hiddenFields, [
            { eventTarget: 'ddlPostApplied', extraFields: baseSelections({ ddlPostApplied: postValue }) },
            { eventTarget: 'ddlDistrict', extraFields: baseSelections({ ddlPostApplied: postValue, ddlDistrict: districtValue }) },
        ]);
        return { projects: extractOptions($, '#ddlProject option') };
    });
}

async function getSectorsForProject(postValue, districtValue, projectValue) {
    return withFreshStateRetry(async ({ hiddenFields }) => {
        const { $ } = await chainPostbacks(hiddenFields, [
            { eventTarget: 'ddlPostApplied', extraFields: baseSelections({ ddlPostApplied: postValue }) },
            { eventTarget: 'ddlDistrict', extraFields: baseSelections({ ddlPostApplied: postValue, ddlDistrict: districtValue }) },
            { eventTarget: 'ddlProject', extraFields: baseSelections({ ddlPostApplied: postValue, ddlDistrict: districtValue, ddlProject: projectValue }) },
        ]);
        return { sectors: extractOptions($, '#ddlSector option') };
    });
}

async function getAWCsForSector(postValue, districtValue, projectValue, sectorValue) {
    return withFreshStateRetry(async ({ hiddenFields }) => {
        const { $ } = await chainPostbacks(hiddenFields, [
            { eventTarget: 'ddlPostApplied', extraFields: baseSelections({ ddlPostApplied: postValue }) },
            { eventTarget: 'ddlDistrict', extraFields: baseSelections({ ddlPostApplied: postValue, ddlDistrict: districtValue }) },
            { eventTarget: 'ddlProject', extraFields: baseSelections({ ddlPostApplied: postValue, ddlDistrict: districtValue, ddlProject: projectValue }) },
            { eventTarget: 'ddlSector', extraFields: baseSelections({ ddlPostApplied: postValue, ddlDistrict: districtValue, ddlProject: projectValue, ddlSector: sectorValue }) },
        ]);
        return { awcs: extractOptions($, '#ddlAWC option') };
    });
}

// ---------- Main ----------

async function main() {
    console.log('[0] Ensuring tables exist...');
    await setupAnganwadiCentersTable();
    await setupAnganwadiVacanciesTable();

    console.log(`[1] Loading initial page: ${PAGE_URL}`);
    const initial = await fetchFreshPageState();
    console.log(`[2] Found ${initial.posts.length} posts:`, initial.posts.map(p => p.text));

    let centersUpserted = 0;
    let vacanciesUpserted = 0;
    let failures = 0;

    const lastPost = initial.posts//.slice(-1);
    for (const post of lastPost) {
        const postCode = POST_TEXT_TO_CODE[post.text];
        if (!postCode) {
            console.warn(`  Skipping unknown post type: "${post.text}" (no code mapping)`);
            continue;
        }

        console.log(`\n--- Post: ${post.text} (${post.value}) -> code ${postCode} ---`);

        const { districts } = await getDistrictsForPost(post.value);
        console.log(`  Districts found: ${districts.length}`);

        const oneDistrict = districts//.slice(0, 1);
        // const secondDistrict = districts.slice(1, 2);
        // const thirdDistrict = districts.slice(2, 3);
        // const fourthDistrict = districts.slice(3, 4);
        for (const district of oneDistrict) {
            let projects = [];
            try {
                ({ projects } = await getProjectsForDistrict(post.value, district.value));
                console.log(`    District "${district.text}": ${projects.length} projects`);
            } catch (err) {
                console.error(`    District "${district.text}": FAILED (projects) - ${err.message}`);
                failures++;
                await new Promise(r => setTimeout(r, 300));
                continue;
            }

            for (const project of projects) {
                let sectors = [];
                try {
                    ({ sectors } = await getSectorsForProject(post.value, district.value, project.value));
                    console.log(`      Project "${project.text}": ${sectors.length} sectors`);
                } catch (err) {
                    console.error(`      Project "${project.text}": FAILED (sectors) - ${err.message}`);
                    failures++;
                    await new Promise(r => setTimeout(r, 300));
                    continue;
                }

                for (const sector of sectors) {
                    let awcs = [];
                    try {
                        ({ awcs } = await getAWCsForSector(post.value, district.value, project.value, sector.value));
                        console.log(`        Sector "${sector.text}": ${awcs.length} AWCs`);
                    } catch (err) {
                        console.error(`        Sector "${sector.text}": FAILED (AWCs) - ${err.message}`);
                        failures++;
                        await new Promise(r => setTimeout(r, 300));
                        continue;
                    }

                    for (const awc of awcs) {
                        try {
                            // 1. Upsert the center
                            const centerId = await upsertCenter({
                                state_name: STATE_NAME,
                                district_name: district.text,
                                project_name: project.text,
                                sector_name: sector.text,
                                awc_name: awc.text,
                            });

                            if (!centerId) {
                                throw new Error('upsertCenter returned no id');
                            }
                            centersUpserted++;

                            // 2. Upsert the vacancy row for this post at that center
                            await upsertVacancies([
                                {
                                    center_id: centerId,
                                    post_code: postCode,
                                    post_name: post.text,
                                    vacancy_count: 1,
                                    status: 'open',
                                    start_date: '2026-08-01',   // set this if the recruitment form/page exposes an application-open date
                                    end_date: '2026-08-15',     // set this if the recruitment form/page exposes an application-close date
                                },
                            ]);
                            vacanciesUpserted++;
                        } catch (err) {
                            console.error(`          AWC "${awc.text}": FAILED to save - ${err.message}`);
                            failures++;
                        }
                    }

                    await new Promise(r => setTimeout(r, 300));
                }
            }

            await new Promise(r => setTimeout(r, 300));
        }
    }

    console.log(`\nDone. Centers upserted: ${centersUpserted}, Vacancies upserted: ${vacanciesUpserted}, Failures: ${failures}`);
}

main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});