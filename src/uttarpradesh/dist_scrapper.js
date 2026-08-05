const cheerio = require('cheerio');

const REGISTRATION_URL = 'https://upanganwadibharti.in/workernew/users/registration.php';

/**
 * Scrapes the district dropdown from the registration page.
 * @returns {Promise<Array<{ value: string, name: string }>>}
 */
async function scrapeDistricts() {
    try {
        const { gotScraping } = await import('got-scraping');
        const { body: html }  = await gotScraping({ url: REGISTRATION_URL });
        const $ = cheerio.load(html);

        const districts = [];
        $('select#district option').each((_, el) => {
            const value = $(el).attr('value');
            const name  = $(el).text().trim();
            if (value) districts.push({ value, name });
        });

        if (!districts.length) console.warn('⚠️  No districts found — page structure may have changed');
        return districts;
    } catch (err) {
        console.error(`❌ scrapeDistricts: ${err.message}`);
        return [];
    }
}

module.exports = { scrapeDistricts };