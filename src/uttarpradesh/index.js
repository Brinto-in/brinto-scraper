const { scrapeDistricts } = require('./dist_scrapper');
const fs = require('fs').promises;
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'districts.json');

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

module.exports = {
    getDistricts,
    getProjectByDistricts
};

// This block allows the script to be run directly from the command line
// using `node src/uttarpradesh/index.js`.
if (require.main === module) {
    console.log('--- Running Uttar Pradesh district scraper as a standalone script ---');
    // getDistricts().catch(error => {
    //     console.error('An error occurred during the standalone run:', error);
    // });
    getProjectByDistricts().catch(error => {
        console.error('An error occurred during the standalone run:', error);
    });
}