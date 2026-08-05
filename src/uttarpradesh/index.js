const { loginWithoutChromium }    = require('./login/awt_login');
const { fetchProjectsForDistrict } = require('./up_project');
const { getGramPanchayats, getAnganwadis } = require('./lib/scraper');
const upSessions = require('./up_sessions');

const MAX_LOGIN_RETRIES = 3;

/** Returns only sessions whose end_date is today or in the future */
function getActiveSessions() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return upSessions.filter(s => {
        const end = new Date(s.end_date);
        end.setHours(0, 0, 0, 0);
        return end >= today;
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
    session.sessionId        = loginResult.sessionId        || '';
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

            console.log(`       🏠 ${gp.text} (${awcs.length} AWCs):`);
            awcs.forEach((awc, i) =>
                console.log(`         ${i + 1}. ${awc.text} (ID: ${awc.value}, UR: ${awc.UR})`)
            );
        }
    }
}

/**
 * Entry point — filters active sessions, runs them sequentially,
 * and prints a concise summary at the end.
 */
async function refreshSessions() {
    const { gotScraping } = await import('got-scraping');

    const activeSessions = getActiveSessions();
    const today = new Date().toISOString().split('T')[0];

    console.log(`\n[UP] ${activeSessions.length} active / ${upSessions.length - activeSessions.length} expired — ${today}\n`);

    if (!activeSessions.length) return;

    let success = 0;
    let failed  = 0;

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