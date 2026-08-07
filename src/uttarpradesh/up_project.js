const cheerio = require('cheerio');

const STEP1_URLS = {
    AWW: 'https://upanganwadibharti.in/workernew/users/step-1.php', // Anganwadi Worker
    AWH: 'https://upanganwadibharti.in/helper-v2/users/step-1.php',   // Anganwadi Helper
};
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Fetches the step-1 page for a district session and parses
 * the district ID + available project list from the dropdowns.
 *
 * @param {Function} httpClient   - got-scraping instance
 * @param {object}   session      - Session object
 * @param {string}   session.districtName
 * @param {string}   session.cfClearanceToken
 * @param {string}   session.sessionId
 * @param {string}  [session.postCode='AWW'] - 'AWW' or 'AWH' to determine the correct URL.
 * @returns {{ district: { name, value } | null, projects: Array<{ value, name }> }}
 */
async function fetchProjectsForDistrict(httpClient, { districtName, cfClearanceToken, sessionId, postCode = 'AWW' }) {
    const step1Url = STEP1_URLS[postCode];
    if (!step1Url) throw new Error(`Invalid postCode "${postCode}" provided. Must be one of ${Object.keys(STEP1_URLS).join(', ')}`);

    try {
        const response = await httpClient.get(step1Url, {
            headers: {
                Cookie: `cf_clearance=${cfClearanceToken}; PHPSESSID=${sessionId}`,
                'User-Agent': UA,
            },
        });

        const $ = cheerio.load(response.body);

        const districtOpt = $('select#district option[value!=""]').first();
        const district = districtOpt.length
            ? { name: districtOpt.text().trim(), value: districtOpt.attr('value') }
            : null;

        if (!district) console.warn(`⚠️  No district found in dropdown for ${districtName}`);

        const projects = [];
        $('select#project option[value]').each((_, el) => {
            const value = $(el).attr('value');
            const name = $(el).text().trim().replace(/\s+/g, ' ');
            if (value) projects.push({ value, name });
        });

        if (!projects.length) console.warn(`⚠️  No projects found for ${districtName} — session may be expired`);

        return { district, projects };
    } catch (err) {
        console.error(`❌ fetchProjectsForDistrict(${districtName}): ${err.message}`);
        return { district: null, projects: [] };
    }
}

module.exports = { fetchProjectsForDistrict };