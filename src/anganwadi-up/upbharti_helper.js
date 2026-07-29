const cheerio = require('cheerio');
const cliProgress = require('cli-progress');
const fs = require('fs').promises;
const path = require('path');

/**
 * Scrapes recruitment notices from upanganwadibharti.in.
 *
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of notice objects.
 * Each object contains title, status, uploadedDate, lastDate, and link.
 */
async function scrapeNotices(httpClient) {
    const url = 'https://upanganwadibharti.in/';
    console.log(`Fetching data from ${url}...`);

    try {
        // Fetch HTML of the page
        const { body: html } = await httpClient.get(url);

        // Load HTML into cheerio
        const $ = cheerio.load(html);

        const notices = [];
        // Find the heading for "Worker Vacancies" and then select the notice cards
        // within its parent container. This ensures we only scrape from that section.
        const workerVacanciesContainer = $('h4:contains("Helper Vacancies")').parent();
        const noticeCards = workerVacanciesContainer.find('.notice-card');


        if (noticeCards.length === 0) {
            console.log('No notice cards found on the page.');
            return [];
        }

        console.log(`Found ${noticeCards.length} notice cards. Scraping details...`);

        // 1. Create a new progress bar instance and customize its appearance
        const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

        // 2. Start the progress bar with a total value of the number of cards
        progressBar.start(noticeCards.length, 0);

        noticeCards.each((index, element) => {
            const card = $(element);

            // Extract title
            let title = card.find('.notice-header > span:first-child').text().trim().replace(/^📄\s*/, '');
            // Extract only the district name from the title, e.g., "संत कबीर नगर" from "संत कबीर नगर – आंगनवाड़ी भर्ती विज्ञप्ति"
            const titleParts = title.split('–');
            if (titleParts.length > 1) {
                title = titleParts[0].trim();
            }

            // Extract status
            const status = card.find('.notice-badge').text().trim();

            // Extract dates
            const detailsText = card.find('.notice-details').text();
            const uploadedDateMatch = detailsText.match(/Uploaded:\s*(\d{2}-\d{2}-\d{4})/);
            const lastDateMatch = detailsText.match(/Last Date:\s*(\d{2}-\d{2}-\d{4})/);

            const uploadedDate = uploadedDateMatch ? uploadedDateMatch[1] : null;
            const lastDate = lastDateMatch ? lastDateMatch[1] : null;

            // Extract link
            const link = card.find('.notice-link').attr('href');

            let isStillActive = false;
            if (lastDate) {
                // Parse date from DD-MM-YYYY format
                const [day, month, year] = lastDate.split('-').map(Number);
                // Note: The month is 0-indexed in JavaScript's Date constructor (0=Jan, 11=Dec)
                const lastDateObj = new Date(year, month - 1, day);

                // Get today's date, with the time portion zeroed out for a clean date-only comparison
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                isStillActive = lastDateObj >= today;
            }

            // Only include notices where the last date is today or in the future.
            if (title && isStillActive) {
                notices.push({
                    title,
                    status,
                    uploadedDate,
                    lastDate,
                    link,
                });
            }
            // 3. Update the progress bar on each iteration
            progressBar.increment();
        });

        // 4. Stop the progress bar
        progressBar.stop();
        console.log(`\nSuccessfully scraped ${notices.length} notices.`);
        return notices;
    } catch (error) {
        console.error('Error during scraping:', error);
        return []; // Return an empty array in case of an error
    }
}

// Example of how to run the scraper and log the results
(async () => {
    // Use dynamic import for got-scraping as it's an ESM package
    const { gotScraping } = await import('got-scraping');

    /**
     * A pre-configured HTTP client for scraping, using got-scraping.
     * It mimics browser headers to avoid being blocked (e.g., 403 Forbidden errors).
     */
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

    const allNotices = await scrapeNotices(httpClient);
    if (allNotices.length > 0) {
        console.log('--- Scraped Data ---');
        console.log(allNotices);
        console.log('--------------------');
        console.log(`First notice:`, allNotices[0]);
        console.log(`Last notice:`, allNotices[allNotices.length - 1]);

        // Save the data to a JSON file
        try {
            const filePath = path.join(__dirname, 'up-bharti-helper-notices.json');
            await fs.writeFile(filePath, JSON.stringify(allNotices, null, 2));
            console.log(`\n✅ Successfully saved ${allNotices.length} active notices to ${filePath}`);
        } catch (error) {
            console.error('\n❌ Error saving data to JSON file:', error);
        }
    }
})();