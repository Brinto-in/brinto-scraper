const cheerio = require('cheerio');

// The URL of the page you want to scrape.
const URL_TO_SCRAPE = 'https://upanganwadibharti.in/workernew/users/registration.php';

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

// Export the core scraping function. The comparison and file-writing logic has been removed.
module.exports = {
    scrapeDistricts,
};