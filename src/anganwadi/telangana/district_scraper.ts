import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';

export interface TelanganaDistrict {
    stateName: string;
    districtName: string;
    startDate: string | null;
    endDate: string | null;
}

const TARGET_URL = 'https://mis.tgwdcw.in/';

export async function scrapeTelanganaDistricts(
    targetUrl: string = TARGET_URL
): Promise<TelanganaDistrict[]> {

    console.log('\n' + '='.repeat(70));
    console.log('TELANGANA ANGANWADI - DISTRICT SCRAPER');
    console.log('URL:', targetUrl);
    console.log('='.repeat(70));

    try {
        console.log('\n[1/3] Sending request...');

        const response = await gotScraping({
            url: targetUrl,
            timeout: {
                request: 15000
            },
            https: {
                rejectUnauthorized: false
            },
            retry: {
                limit: 0
            }
        });

        console.log(
            `[2/3] Status: ${response.statusCode} (${(
                response.body.length / 1024
            ).toFixed(2)} KB)`
        );

        const $ = cheerio.load(response.body);

        const districts: TelanganaDistrict[] = [];

        // Find table containing "District Wise Notification Issue Status"
        $('table').each((_, table) => {

            const tableText = $(table).text();

            if (
                !tableText.includes('District') ||
                !tableText.includes('Start Date') ||
                !tableText.includes('Closing Date')
            ) {
                return;
            }

            $(table)
                .find('tbody tr')
                .each((_, row) => {

                    const columns = $(row)
                        .find('td')
                        .map((_, td) => $(td).text().trim())
                        .get();

                    // Expected:
                    // [S.No, District, Notification, Start Date, Closing Date, ...]
                    if (columns.length < 5) {
                        return;
                    }

                    const districtName = columns[1]?.trim() || '';
                    const startDate = columns[3]?.trim() || '';
                    const endDate = columns[4]?.trim() || '';

                    if (!districtName) {
                        return;
                    }

                    districts.push({
                        stateName: 'Telangana',
                        districtName,
                        startDate: startDate || null,
                        endDate: endDate || null
                    });
                });

            // We found the required table.
            return false;
        });

        console.log(
            `[3/3] Found ${districts.length} Telangana districts`
        );

        console.table(districts);

        return districts;

    } catch (error) {

        console.error(
            `Failed to scrape Telangana districts:`,
            error instanceof Error
                ? error.message
                : error
        );

        return [];
    }
}