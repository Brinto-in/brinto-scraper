const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

// The URL of the page you want to scrape.
// Please update this with the correct URL.
const URL_TO_SCRAPE = 'https://upanganwadibharti.in/workernew/users/registration.php';

const OUTPUT_DIR = path.join(__dirname, 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'districts.json');

/**
 * Fetches the webpage and extracts district information from a dropdown.
 * @returns {Promise<Array<{value: string, name: string}>>} A list of districts.
 */
async function scrapeDistricts() {
    try {
        const { gotScraping } = await import('got-scraping');
        console.log(`Fetching data from ${URL_TO_SCRAPE}...`);
        // Use got-scraping to avoid being blocked by basic bot protection.
        // It mimics browser headers more effectively than a default axios request.
        const { body: html } = await gotScraping({
            url: URL_TO_SCRAPE,
        });

        console.log('Successfully fetched HTML.');

        console.log('Parsing HTML...');
        const $ = cheerio.load(html);

        const districts = [];
        // Select the dropdown with id 'district' and iterate over its options
        $('select#district option').each((index, element) => {
            const value = $(element).attr('value');
            const name = $(element).text().trim();

            // Skip the placeholder option which has no value
            if (value) {
                districts.push({ value, name });
            }
        });

        if (districts.length === 0) {
            console.warn('Warning: No districts were found. The page structure may have changed, or the request was blocked.');
            console.log('Received HTML body:', html.substring(0, 500) + '...'); // Log the beginning of the HTML for debugging
        }

        return districts;
    } catch (error) {
        console.error(`Error during scraping: ${error.message}`);
        return [];
    }
}

async function main() {
    // 1. Load existing districts if the file exists
    let oldDistricts = [];
    try {
        const oldData = await fs.readFile(OUTPUT_FILE, 'utf-8');
        oldDistricts = JSON.parse(oldData);
        console.log(`Loaded ${oldDistricts.length} districts from previous run.`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('No previous district file found. This will be the first run.');
        } else {
            console.error('Error reading existing districts file:', error);
        }
    }

    // 2. Scrape the current list of districts
    const newDistricts = await scrapeDistricts();
    if (newDistricts.length === 0) {
        console.log('Scraping returned no districts. Halting update process.');
        return;
    }

    // 3. Compare and merge the lists
    const oldDistrictsMap = new Map(oldDistricts.map(d => [d.value, d]));
    const newDistrictsMap = new Map(newDistricts.map(d => [d.value, d]));

    const report = {
        added: [],
        disabled: [],
        reactivated: [],
    };

    const mergedDistricts = [];

    // Process old districts to check for disabled or reactivated ones
    oldDistrictsMap.forEach((oldDistrict, value) => {
        if (newDistrictsMap.has(value)) {
            // Still present, ensure it's active
            const updatedDistrict = { ...oldDistrict, ...newDistrictsMap.get(value), status: 'active' };
            mergedDistricts.push(updatedDistrict);
            if (oldDistrict.status === 'disabled') {
                report.reactivated.push(updatedDistrict.name);
            }
        } else {
            // No longer present, mark as disabled
            const disabledDistrict = { ...oldDistrict, status: 'disabled' };
            mergedDistricts.push(disabledDistrict);
            if (oldDistrict.status !== 'disabled') {
                report.disabled.push(oldDistrict.name);
            }
        }
    });

    // Process new districts to find additions
    newDistrictsMap.forEach((newDistrict, value) => {
        if (!oldDistrictsMap.has(value)) {
            const addedDistrict = { ...newDistrict, status: 'active' };
            mergedDistricts.push(addedDistrict);
            report.added.push(addedDistrict.name);
        }
    });

    // Sort for consistency
    mergedDistricts.sort((a, b) => a.name.localeCompare(b.name));

    // 4. Log the report of changes
    console.log('\n--- Update Report ---');
    console.log(`[+] Added: ${report.added.length} (${report.added.join(', ') || 'None'})`);
    console.log(`[-] Disabled: ${report.disabled.length} (${report.disabled.join(', ') || 'None'})`);
    console.log(`[*] Reactivated: ${report.reactivated.length} (${report.reactivated.join(', ') || 'None'})`);
    console.log('---------------------\n');

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(mergedDistricts, null, 2), 'utf-8');

    console.log(`Successfully updated and saved ${mergedDistricts.length} districts.`);
    console.log(`Data file located at: ${OUTPUT_FILE}`);
}

main();