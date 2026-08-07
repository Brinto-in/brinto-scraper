const { loginWithoutChromium } = require('./login/awt_login');
const { fetchProjectsForDistrict } = require('./up_project');
const { getGramPanchayats, getAnganwadis } = require('./lib/scraper');
const { setupAnganwadiCentersTable, upsertCenter } = require('../db-configs/anganwadi_centers');
const { setupAnganwadiVacanciesTable, upsertVacancies } = require('../db-configs/anganwadi_vacancies');
const upSessions = require('./up_sessions');

const MAX_LOGIN_RETRIES = 3;

// Set to true to filter sessions starting strictly today
const ONLY_TODAY_START = true;

/** Returns sessions matching active date criteria */
function getActiveSessions() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return upSessions.filter(s => {
        const start = new Date(s.start_date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(s.end_date);
        end.setHours(0, 0, 0, 0);

        if (ONLY_TODAY_START) {
            return start.getTime() === today.getTime();
        }

        return start <= today && end >= today;
    });
}

/**
 * For a single district session:
 *   1. Login with retry
 *   2. Fetch projects
 *   3. For each project → fetch GPs → fetch AWCs (streamed immediately)
 */
async function processDistrict(httpClient, session) {
    // --- Login (with retry) ---
    let loginResult;
    for (let attempt = 1; attempt <= MAX_LOGIN_RETRIES; attempt++) {
        try {
            loginResult = await loginWithoutChromium(session.mobile, session.password);
            break;
        } catch (err) {
            console.error(`  ❌ Login attempt ${attempt}/${MAX_LOGIN_RETRIES}: ${err.message}`);
            if (attempt === MAX_LOGIN_RETRIES) throw err;
            console.log(`  🔄 Retrying...`);
        }
    }

    session.cfClearanceToken = loginResult.cfClearanceToken || '';
    session.sessionId = loginResult.sessionId || '';
    console.log(`  ✅ Logged in — session: ${session.sessionId}`);

    // --- Projects ---
    const { district, projects } = await fetchProjectsForDistrict(httpClient, session);
    if (!projects.length) return;

    const distID = district?.value;
    console.log(`  📋 ${projects.length} project(s) | distID: ${distID}`);

    if (!distID) return;

    // --- Gram Panchayats + AWCs (logs stream immediately as data arrives) ---
    for (const project of projects) {
        let gps;
        try {
            gps = await getGramPanchayats(project.value, distID);
        } catch (err) {
            console.error(`  ⚠️  GPs failed [${project.name}]: ${err.message}`);
            continue;
        }

        if (!gps.length) {
            console.log(`  🏘️  ${project.name} — no GPs`);
            continue;
        }

        console.log(`  🏘️  ${project.name} (${gps.length} GPs):`);

        for (const gp of gps) {
            let awcs;
            try {
                awcs = await getAnganwadis(gp.value, project.value, distID);
            } catch (err) {
                console.error(`       ⚠️  AWCs failed [${gp.text}]: ${err.message}`);
                continue;
            }

            if (!awcs.length) {
                console.log(`       🏠 ${gp.text} — no AWCs`);
                continue;
            }

            for (const awc of awcs) {
                const record = {
                    state_name: 'Uttar Pradesh',
                    district_name: session.districtName,
                    project_name: project.name,
                    sector_name: '',
                    gp: gp.text,
                    awc_name: awc.text,
                };
                try {
                    const id = await upsertCenter(record);
                    console.log(`       [DB ID: ${id}] ${JSON.stringify(record)}`);
                    await upsertVacancies([{
                        center_id: id,
                        post_code: 'AWW',
                        post_name: 'Anganwadi Teacher',
                        vacancy_count: 1,
                        start_date: session.start_date,
                        end_date: session.end_date,
                    }]);
                    console.log(`          💼 Vacancy upserted [AWW] center_id=${id} (${session.start_date} → ${session.end_date})`);

                } catch (dbErr) {
                    console.error(`       ❌ DB Error inserting [${awc.text}]: ${dbErr.message}`);
                }
            }
        }
    }
}

/**
 * Entry point — filters active sessions, runs them sequentially,
 * and prints a concise summary at the end.
 */
async function refreshSessions() {
    const { gotScraping } = await import('got-scraping');

    await setupAnganwadiCentersTable();
    await setupAnganwadiVacanciesTable();

    const activeSessions = getActiveSessions();
    const today = new Date().toISOString().split('T')[0];

    console.log(`\n[UP] ${activeSessions.length} active / ${upSessions.length - activeSessions.length} expired — ${today}\n`);

    if (!activeSessions.length) return;

    let success = 0;
    let failed = 0;

    for (let i = 0; i < activeSessions.length; i++) {
        const session = activeSessions[i];
        console.log(`──────────────────────────────────────────`);
        console.log(`[${i + 1}/${activeSessions.length}] ${session.districtName} (${session.mobile})`);

        try {
            await processDistrict(gotScraping, session);
            success++;
        } catch (err) {
            console.error(`  ❌ Failed: ${err.message}`);
            failed++;
        }
        console.log('');
    }

    console.log(`──────────────────────────────────────────`);
    console.log(`Done — ✅ ${success} ok  ❌ ${failed} failed`);
    console.log(`──────────────────────────────────────────\n`);
}

module.exports = { refreshSessions };

if (require.main === module) {
    refreshSessions().catch(err => {
        console.error('Fatal:', err.message);
        process.exit(1);
    });
}