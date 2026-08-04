/**
 * This script fetches the HTML content of a specific page that is protected
 * by Cloudflare, using a provided cf_clearance token and a PHPSESSID.
 * It iterates through a list of district-specific sessions, fetches the
 * projects for each, and saves the combined data to a single file.
 */

const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const districtSessions = require('./up_sessions.js');

const OUTPUT_DIR = path.join(__dirname, 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'up_projects_by_district.json');
const REQUEST_DELAY_MS = 500; // Delay between requests to be polite

/**
 * Fetches the projects for a single district using its session tokens.
 * @param {import('got-scraping').GotScraping} httpClient - The got-scraping client.
 * @param {object} session - The session object for a district.
 * @param {string} session.districtName - The name of the district.
 * @param {string} session.cfClearanceToken - The Cloudflare clearance token.
 * @param {string} session.sessionId - The PHPSESSID token. 
 * @returns {Promise<{district: {name: string, value: string}|null, projects: Array<object>}>} A promise that resolves to an object containing the scraped district and its projects.
 */
async function fetchProjectsForDistrict(httpClient, { districtName, cfClearanceToken, sessionId }) {
    const url = 'https://upanganwadibharti.in/workernew/users/step-1.php';

    // Combine the tokens into a single 'Cookie' header string. 
    const cookieHeader = `cf_clearance=${cfClearanceToken}; PHPSESSID=${sessionId}`;

    console.log(`\nFetching projects for district: ${districtName}`);
    console.log(`Using provided session and clearance tokens...`);

    try {
        const response = await httpClient.get(url, {
            headers: {
                'Cookie': cookieHeader,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });

        console.log('Successfully fetched HTML content.');

        // --- Parse the HTML to extract projects ---
        const $ = cheerio.load(response.body);

        // --- Extract district information from the page ---
        const districtOption = $('select#district option[value!=""]').first();
        let district = null;
        if (districtOption.length) {
            district = {
                name: districtOption.text().trim(),
                value: districtOption.attr('value'),
            };
            console.log(`Scraped district from page: ${district.name} (ID: ${district.value})`);
        } else {
            console.warn(`Warning: Could not find a valid district in the dropdown for session: ${districtName}.`);
        }

        const projects = [];
        // Select the dropdown with id 'project' and iterate over its options
        $('select#project option').each((index, element) => {
            const value = $(element).attr('value');
            // Clean up the text by removing extra whitespace and newlines
            const name = $(element).text().trim().replace(/\s+/g, ' ');

            // Skip the placeholder option which has no value
            if (value) {
                projects.push({ value, name });
            }
        });

        if (projects.length > 0) {
            console.log(`Found ${projects.length} projects for ${districtName}.`);
        } else {
            console.warn(`Warning: No projects found for ${districtName}. The session might be invalid/expired or the page structure may have changed.`);
        }
        return { district, projects };

    } catch (error) {
        console.error(`Failed to fetch or process page for ${districtName}:`, error.message);
        return { district: null, projects: [] }; // Return empty object on failure
    }
}

async function main() {
    // Use dynamic import for got-scraping as it's an ESM-only package.
    const { gotScraping } = await import('got-scraping');
    const httpClient = gotScraping;

    if (!districtSessions || districtSessions.length === 0) {
        console.error('Error: The `up_sessions.js` file is empty or missing. Please add at least one district session.');
        return;
    }

    const allProjectsByDistrict = {};

    for (const session of districtSessions) {
        const { district, projects } = await fetchProjectsForDistrict(httpClient, session);
        if (district && district.name) {
            allProjectsByDistrict[district.name] = { districtValue: district.value, projects };
        }

        // Add a delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
    }

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(allProjectsByDistrict, null, 2), 'utf-8');
    console.log(`\n✅ All districts processed. Combined data saved to: ${OUTPUT_FILE}`);
}

main().catch(err => {
    console.error('A fatal error occurred:', err);
    process.exit(1);
});