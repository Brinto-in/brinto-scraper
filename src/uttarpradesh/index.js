const { scrapeDistricts } = require('./dist_scrapper');

/**
 * Scrapes the districts from the source URL and returns them.
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
    }

    return allDistricts;
}

module.exports = {
    getDistricts,
};

// This block allows the script to be run directly from the command line
// using `node src/uttarpradesh/index.js`.
if (require.main === module) {
    console.log('--- Running Uttar Pradesh district scraper as a standalone script ---');
    getDistricts().catch(error => {
        console.error('An error occurred during the standalone run:', error);
    });
}