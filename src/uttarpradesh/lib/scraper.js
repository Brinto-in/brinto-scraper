const { postForm, sleep } = require('./httpClient');
const { parseOptions }    = require('./parseOptions');
const { REQUEST_DELAY_MS, UR_VALUES } = require('./config');

/** Level 1 — district ID → project list */
async function getProjects(distID) {
    const body = await postForm({ project_name: String(distID) });
    await sleep(REQUEST_DELAY_MS);
    return parseOptions(body);
}

/** Level 2 — projectID + distID → gram panchayat list */
async function getGramPanchayats(projectID, distID) {
    const body = await postForm({
        gramp: '',
        projectID: String(projectID),
        distID:    String(distID),
    });
    await sleep(REQUEST_DELAY_MS);
    return parseOptions(body);
}

/** Level 3 — single UR pass → anganwadi list */
async function getAnganwadisForUR(grampanchayatID, pid, distID, UR) {
    const body = await postForm({
        grampanchayatID,
        pid:    String(pid),
        distID: String(distID),
        UR:     String(UR),
    });
    await sleep(REQUEST_DELAY_MS);
    return parseOptions(body);
}

/**
 * Fetches anganwadis for all configured UR values and de-duplicates by ID.
 */
async function getAnganwadis(grampanchayatID, pid, distID) {
    const seen = new Map();
    for (const UR of UR_VALUES) {
        const results = await getAnganwadisForUR(grampanchayatID, pid, distID, UR);
        for (const r of results) {
            if (!seen.has(r.value)) seen.set(r.value, { ...r, UR });
        }
    }
    return Array.from(seen.values());
}

module.exports = { getProjects, getGramPanchayats, getAnganwadis };
