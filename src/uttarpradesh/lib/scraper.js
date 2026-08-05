const { postForm, sleep } = require('./httpClient');
const { parseOptions } = require('./parseOptions');
const { REQUEST_DELAY_MS, UR_VALUES } = require('./config');

/**
 * Level 1: Given a district ID, get the list of projects (blocks).
 * @returns {Promise<Array<{value: string, text: string}>>}
 */
async function getProjects(distID) {
  const body = await postForm({ project_name: String(distID) });
  console.log(body);
  await sleep(REQUEST_DELAY_MS);
  console.log(parseOptions(body));

  return parseOptions(body);
}

/**
 * Level 2: Given a project ID + district ID, get the list of gram panchayats.
 * @returns {Promise<Array<{value: string, text: string}>>}
 */
async function getGramPanchayats(projectID, distID) {
  console.log(projectID, distID);

  const body = await postForm({
    gramp: '',
    projectID: String(projectID),
    distID: String(distID),
  });
  await sleep(REQUEST_DELAY_MS);
  return parseOptions(body);
}

/**
 * Level 3: Given a gram panchayat name + project ID + district ID (+ UR filter),
 * get the list of anganwadi centers.
 * @returns {Promise<Array<{value: string, text: string}>>}
 */
async function getAnganwadisForUR(grampanchayatID, pid, distID, UR) {
  const body = await postForm({
    grampanchayatID,
    pid: String(pid),
    distID: String(distID),
    UR: String(UR),
  });
  await sleep(REQUEST_DELAY_MS);
  return parseOptions(body);
}

/**
 * Fetches anganwadis across all configured UR values and de-duplicates
 * by the anganwadi's `value` (its ID).
 */
async function getAnganwadis(grampanchayatID, pid, distID) {
  const seen = new Map();
  for (const UR of UR_VALUES) {
    const results = await getAnganwadisForUR(grampanchayatID, pid, distID, UR);
    for (const r of results) {
      if (!seen.has(r.value)) {
        seen.set(r.value, { ...r, UR });
      }
    }
  }
  return Array.from(seen.values());
}

module.exports = { getProjects, getGramPanchayats, getAnganwadis };
