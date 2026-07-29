const cheerio = require('cheerio');
const cliProgress = require('cli-progress');
const fs = require('fs').promises;
const { NOTICES_OUTPUT_JSON } = require('./lib/config');
const { getDistrictsByState } = require('../db-configs/turso.db.js');
const path = require('path');

/**
 * Scrapes notices for a specific vacancy type (Worker or Helper).
 *
 * @param {cheerio.CheerioAPI} $ - The cheerio instance for the page.
 * @param {string} vacancyTitle - The title to search for, e.g., "Worker Vacancies".
 * @param {string} typeCode - The code to assign, e.g., "W" or "H".
 * @param {Map<string, {name: string, external_id: any}>} districtNameMap - A Map from lowercase Hindi district names to district info.
 * @returns {Array<Object>} An array of notice objects for this type.
 */
function scrapeVacancyType($, vacancyTitle, typeCode, districtNameMap) {
    const notices = [];
    const container = $(`h4:contains("${vacancyTitle}")`).parent();
    const noticeCards = container.find('.notice-card');

    if (noticeCards.length === 0) {
        console.log(`No notice cards found for "${vacancyTitle}".`);
        return [];
    }

    console.log(`Found ${noticeCards.length} notice cards for "${vacancyTitle}". Scraping details...`);

    noticeCards.each((index, element) => {
        const card = $(element);

        let scrapedTitle = card.find('.notice-header > span:first-child').text().trim().replace(/^📄\s*/, '');
        const titleParts = scrapedTitle.split('–');
        if (titleParts.length > 1) {
            scrapedTitle = titleParts[0].trim();
        }

        const status = card.find('.notice-badge').text().trim();

        const detailsText = card.find('.notice-details').text();
        const uploadedDateMatch = detailsText.match(/Uploaded:\s*(\d{2}-\d{2}-\d{4})/);
        const lastDateMatch = detailsText.match(/Last Date:\s*(\d{2}-\d{2}-\d{4})/);

        const uploadedDate = uploadedDateMatch ? uploadedDateMatch[1] : null;
        const lastDate = lastDateMatch ? lastDateMatch[1] : null;

        const link = card.find('.notice-link').attr('href');

        let isStillActive = false;
        if (lastDate) {
            const [day, month, year] = lastDate.split('-').map(Number);
            const lastDateObj = new Date(year, month - 1, day);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            isStillActive = lastDateObj >= today;
        }

        let finalTitle = scrapedTitle;
        let externalId = null;
        const districtInfo = districtNameMap.get(scrapedTitle.toLowerCase());

        if (districtInfo) {
            finalTitle = districtInfo.name;
            externalId = districtInfo.external_id;
        } else if (scrapedTitle) {
            console.warn(`\n[!] Warning: Scraped district "${scrapedTitle}" not found in the database. Keeping original title.`);
        }

        if (finalTitle && isStillActive) {
            const notice = {
                title: finalTitle,
                status,
                uploadedDate,
                lastDate,
                link,
                type: typeCode,
            };
            if (externalId) {
                notice.external_id = externalId;
            }
            notices.push(notice);
        }
    });

    console.log(`Successfully scraped ${notices.length} active notices for "${vacancyTitle}".`);
    return notices;
}

/**
 * Scrapes all recruitment notices (Worker and Helper) from upanganwadibharti.in.
 *
 * @param {import('got-scraping').GotScraping} httpClient The HTTP client to use for requests.
 * @param {Map<string, {name: string, external_id: any}>} districtNameMap - A Map from lowercase Hindi district names to district info.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of notice objects.
 * Each object contains title, status, uploadedDate, lastDate, and link.
 */
async function scrapeNotices(httpClient, districtNameMap) {
    const url = 'https://upanganwadibharti.in/';
    console.log(`Fetching data from ${url}...`);

    try {
        // Fetch HTML of the page
        const { body: html } = await httpClient.get(url);

        // Load HTML into cheerio
        const $ = cheerio.load(html);

        const vacancyTypes = [
            { title: 'Worker Vacancies', code: 'W' },
            { title: 'Helper Vacancies', code: 'H' },
        ];

        let allNotices = [];

        const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        progressBar.start(vacancyTypes.length, 0);

        for (const type of vacancyTypes) {
            const noticesForType = scrapeVacancyType($, type.title, type.code, districtNameMap);
            allNotices = allNotices.concat(noticesForType);
            progressBar.increment();
        }

        progressBar.stop();
        console.log(`\nTotal active notices scraped: ${allNotices.length}`);
        return allNotices;
    } catch (error) {
        console.error('Error during scraping notices:', error);
        return [];
    }
}

async function main() {
    // Use dynamic import for got-scraping as it's an ESM package.
    const { gotScraping } = await import('got-scraping');

    const httpClient = gotScraping.extend({
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'max-age=0',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
        },
    });

    // Fetch districts from the database for state_id = 26 (Uttar Pradesh)
    const districtsFromDb = await getDistrictsByState(26);
    // Create a map from hindi_name (lowercase) to an object with the english `name` and `external_id`.
    const districtNameMap = new Map(districtsFromDb.map(d => [
        d.hindi_name.toLowerCase(),
        { name: d.name, external_id: d.external_id }
    ]));

    const allNotices = await scrapeNotices(httpClient, districtNameMap);

    if (allNotices.length > 0) {
        try {
            await fs.mkdir(path.dirname(NOTICES_OUTPUT_JSON), { recursive: true });
            await fs.writeFile(NOTICES_OUTPUT_JSON, JSON.stringify(allNotices, null, 2));
            console.log(`\n✅ Successfully saved ${allNotices.length} active notices to ${NOTICES_OUTPUT_JSON}`);
        } catch (error) {
            console.error('\n❌ Error saving data to JSON file:', error);
        }
    } else {
        console.log('No active notices found to save.');
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}