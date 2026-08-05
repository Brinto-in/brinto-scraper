const { scrapeDistricts } = require('./dist_scrapper');
const { loginWithoutChromium } = require('./login/awt_login');
const { fetchProjectsForDistrict } = require('./up_project');
const { getGramPanchayats, getAnganwadis } = require('./lib/scraper');
const upSessions = require('./up_sessions');
const fs = require('fs').promises;
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'districts.json');

const MAX_RETRIES = 3;

/**
 * Scrapes districts from the source URL, saves them to a file, and returns them.
 * This function now performs a live scrape on each call.
 *
 * @returns {Promise<Array<{value: string, name: string}>>} A promise that resolves to a list of districts.
 */
async function getDistricts() {
    console.log('Starting live scrape for districts...');

    // Directly call the scraping function from the other module
    const allDistricts = await scrapeDistricts();

    if (allDistricts.length > 0) {
        console.log(`Scrape complete. Found ${allDistricts.length} districts.`);
        // Logging each district as requested
        allDistricts.forEach(district => console.log(`- ${district.name} (Value: ${district.value})`));

        try {
            await fs.mkdir(OUTPUT_DIR, { recursive: true });
            await fs.writeFile(OUTPUT_FILE, JSON.stringify(allDistricts, null, 2), 'utf-8');
            console.log(`\nSuccessfully saved districts to: ${OUTPUT_FILE}`);
        } catch (error) {
            console.error('Error saving districts to file:', error);
        }
    }
    return allDistricts;
}

async function getProjectByDistricts() {
    console.log("---scraping project started----");
    console.log("---scraping project ended----");
}

/**
 * Refreshes sessions for all active UP sessions.
 * Filters sessions where end_date is not in the past, then logs in each one
 * to get fresh cookies (cfClearanceToken, sessionId).
 */
async function refreshSessions() {
    // Initialize got-scraping http client (ESM dynamic import)
    const { gotScraping } = await import('got-scraping');
    const httpClient = gotScraping;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Filter only active sessions whose end_date is today or in the future
    const activeSessions = upSessions.filter(session => {
        const endDate = new Date(session.end_date);
        endDate.setHours(0, 0, 0, 0);
        return endDate >= today;
    });

    console.log(`\n========================================`);
    console.log(`  UP Session Refresh`);
    console.log(`  Total sessions: ${upSessions.length}`);
    console.log(`  Active sessions: ${activeSessions.length}`);
    console.log(`  Skipped (expired): ${upSessions.length - activeSessions.length}`);
    console.log(`  Date: ${today.toISOString().split('T')[0]}`);
    console.log(`========================================\n`);

    // Print active district names
    console.log(`  Active Districts:`);
    activeSessions.forEach((s, idx) => console.log(`    ${idx + 1}. ${s.districtName} (${s.end_date})`));
    console.log('');

    if (activeSessions.length === 0) {
        console.log('No active sessions to process.');
        return;
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < activeSessions.length; i++) {
        const session = activeSessions[i];

        console.log(`--------------------------------------------------`);
        console.log(`[${i + 1}/${activeSessions.length}] District: ${session.districtName}`);
        console.log(`  Mobile: ${session.mobile}`);
        console.log(`  Active: ${session.start_date} → ${session.end_date}`);
        console.log(`--------------------------------------------------`);

        let success = false;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const result = await loginWithoutChromium(session.mobile, session.password);

                console.log(`  ✅ Login successful for ${session.districtName}`);
                console.log(`     cfClearanceToken: ${result.cfClearanceToken || 'Not found'}`);
                console.log(`     sessionId: ${result.sessionId || 'Not found'}`);

                // Update the session object with fresh tokens
                session.cfClearanceToken = result.cfClearanceToken || '';
                session.sessionId = result.sessionId || '';

                // Fetch projects for this district using fresh session
                try {
                    const { district, projects } = await fetchProjectsForDistrict(httpClient, session);
                    if (projects.length > 0) {
                        console.log(`  📋 Projects for ${session.districtName} (${projects.length}):`);
                        projects.forEach((p, idx) => console.log(`     ${idx + 1}. ${p.name} (ID: ${p.value})`));

                        // Fetch gram panchayats for each project
                        const distID = district ? district.value : null;
                        if (distID) {
                            for (const project of projects) {
                                try {
                                    const gps = await getGramPanchayats(project.value, distID);
                                    if (gps.length > 0) {
                                        console.log(`  🏘️  GPs for ${project.name} (${gps.length}):`);
                                        gps.forEach((gp, idx) => console.log(`       ${idx + 1}. ${gp.text} (ID: ${gp.value})`));

                                        // Fetch anganwadis for each gram panchayat
                                        for (const gp of gps) {
                                            try {
                                                const awcs = await getAnganwadis(gp.value, project.value, distID);
                                                if (awcs.length > 0) {
                                                    console.log(`       🏠 AWCs for ${gp.text} (${awcs.length}):`);
                                                    awcs.forEach((awc, idx) => console.log(`         ${idx + 1}. ${awc.text} (ID: ${awc.value}, UR: ${awc.UR})`));
                                                } else {
                                                    console.log(`       🏠 No AWCs found for ${gp.text}`);
                                                }
                                            } catch (awcError) {
                                                console.error(`       ⚠️ Failed to fetch AWCs for ${gp.text}: ${awcError.message}`);
                                            }
                                        }
                                    } else {
                                        console.log(`  🏘️  No GPs found for ${project.name}`);
                                    }
                                } catch (gpError) {
                                    console.error(`  ⚠️ Failed to fetch GPs for ${project.name}: ${gpError.message}`);
                                }
                            }
                        }
                    } else {
                        console.log(`  📋 No projects found for ${session.districtName}`);
                    }
                } catch (projError) {
                    console.error(`  ⚠️ Failed to fetch projects for ${session.districtName}: ${projError.message}`);
                }

                success = true;
                successCount++;
                break;
            } catch (error) {
                console.error(`  ❌ Attempt ${attempt}/${MAX_RETRIES} failed: ${error.message}`);
                if (attempt < MAX_RETRIES) {
                    console.log(`  🔄 Retrying...`);
                }
            }
        }

        if (!success) {
            failCount++;
            console.error(`  ⚠️ All ${MAX_RETRIES} attempts failed for ${session.districtName}\n`);
        }
    }

    console.log(`\n========================================`);
    console.log(`  Session Refresh Complete`);
    console.log(`  ✅ Success: ${successCount}`);
    console.log(`  ❌ Failed:  ${failCount}`);
    console.log(`========================================\n`);
}

module.exports = {
    getDistricts,
    getProjectByDistricts,
    refreshSessions
};

// This block allows the script to be run directly from the command line
// using `node src/uttarpradesh/index.js`.
if (require.main === module) {
    console.log('--- Running Uttar Pradesh district scraper as a standalone script ---');
    // getDistricts().catch(error => {
    //     console.error('An error occurred during the standalone run:', error);
    // });
    // getProjectByDistricts().catch(error => {
    //     console.error('An error occurred during the standalone run:', error);
    // });
    refreshSessions().catch(error => {
        console.error('An error occurred during session refresh:', error);
    });
}