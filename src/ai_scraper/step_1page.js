/**
 * This script fetches the HTML content of a specific page that is protected
 * by Cloudflare, using a provided cf_clearance token and a PHPSESSID.
 * It then parses the HTML to extract project data and saves it to a file.
 */

const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'step1_projects.json');

async function fetchProtectedPage() {
    // Use dynamic import for got-scraping as it's an ESM-only package.
    const { gotScraping } = await import('got-scraping');

    const url = 'https://upanganwadibharti.in/workernew/users/step-1.php';

    // --- Your provided tokens ---
    const cfClearanceToken = 'PhWFcuWwYc3PRMvkiZgVdPsgVbrZZoXOVuLCLCwtE5o-1785740418-1.2.1.1-.TPRG1UYb2WhK.3zf9T.sWsHc3.AitReSKb3ri.hXb5A0aG8Ug8hCqMMc8KfZLQQBoasWzxG.94j9.Q24.aN5OS9eX5fifcGB32SXXxGY06hGOWXdAOw6wSEZ1t73sAIOwiC8xnnmHqoMpfuCPUmJwXzbDE7MB_biJm7PVFbweUr1FkuscqRJEOPm92iu_LGfojekxbeVGBwntXT5_Zj44OL_narvW14.xENJsM7ktTQbMlG83tOzplRHcQFWHizg1g6.4GsY2xD5ghILD0TUkiRJxNqrCOUgmbauY1QuYAGawVddiTl1HEOoSE3k0GLl7ZMaO7vbERWFaRkAlropogG4.GTh4yr7h9MLQOIFICfhu2KtvmH2.A1NcVqK.eryMiViL0mUCPNzBSG7HJo2t830oeZLqTbNhsN3QbEvQWQ8KntDGAS9ceNC.bs6bLW';
    const sessionId = '39k827hp03fr3uk7tsq60tvkda';
    // --------------------------

    // Combine the tokens into a single 'Cookie' header string.
    const cookieHeader = `cf_clearance=${cfClearanceToken}; PHPSESSID=${sessionId}`;

    console.log(`Fetching HTML from: ${url}`);
    console.log(`Using provided session and clearance tokens...`);

    try {
        const response = await gotScraping({
            url: url,
            method: 'GET',
            headers: {
                'Cookie': cookieHeader,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });

        console.log('Successfully fetched HTML content.');

        // --- Parse the HTML to extract projects ---
        console.log('Parsing HTML for projects...');
        const $ = cheerio.load(response.body);

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
            console.log(`\nSuccessfully parsed ${projects.length} projects.`);
            await fs.mkdir(OUTPUT_DIR, { recursive: true });
            await fs.writeFile(OUTPUT_FILE, JSON.stringify(projects, null, 2), 'utf-8');
            console.log(`Data saved to: ${OUTPUT_FILE}`);
        } else {
            console.warn('\nWarning: No projects were found. The session might not have a district selected, or the page structure has changed.');
        }

    } catch (error) {
        console.error('\nFailed to fetch or process the page:', error.message);
    }
}

fetchProtectedPage();