import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';

export interface District {
    index: number;
    id: string;
    english: string;
    hindi: string;
    rawText: string;
}

export async function scrapeAnganwadiDistricts(
    targetUrl: string
): Promise<District[]> {
    console.log('\n' + '='.repeat(70));
    console.log('UP ANGANWADI BHARTI - DISTRICT SCRAPER');
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
            headers: {
                'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8'
            }
        });

        console.log(
            `[2/3] Status: ${response.statusCode} (${(
                response.body.length / 1024
            ).toFixed(2)} KB)`
        );

        const $ = cheerio.load(response.body);

        let selectEl = $(
            'select[name*="district" i], ' +
            'select[id*="district" i], ' +
            'select[name*="jila" i]'
        );

        // Try to find district dropdown based on surrounding text
        if (selectEl.length === 0) {
            $('select').each((_, el) => {
                const parentText = $(el).parent().text();

                if (
                    parentText.includes('District') ||
                    parentText.includes('जिला') ||
                    parentText.includes('जिले')
                ) {
                    selectEl = $(el);
                    return false;
                }
            });
        }

        // Fallback: select with multiple options
        if (selectEl.length === 0) {
            $('select').each((_, el) => {
                if ($(el).find('option').length > 1) {
                    selectEl = $(el);
                    return false;
                }
            });
        }

        const districts: District[] = [];

        if (selectEl.length > 0) {
            selectEl.find('option').each((_, opt) => {
                const id = $(opt).attr('value')?.trim() ?? '';
                const rawText = $(opt).text().trim();

                // Ignore empty/default option
                if (!id && !rawText) {
                    return;
                }

                if (
                    !id &&
                    (
                        rawText.toLowerCase().includes('select') ||
                        rawText.includes('चुनें') ||
                        rawText.includes('विकल्प') ||
                        rawText.includes('--')
                    )
                ) {
                    return;
                }

                let english = rawText;
                let hindi = '';

                // Example: Agra / आगरा
                if (rawText.includes('/')) {
                    const parts = rawText.split('/');

                    english = parts[0]?.trim() ?? '';
                    hindi = parts.slice(1).join('/').trim();
                }

                // Example: Agra (आगरा)
                else if (rawText.includes('(') && rawText.includes(')')) {
                    const match: any = rawText.match(/(.*?)\((.*?)\)/);

                    if (match) {
                        english = match[1].trim();
                        hindi = match[2].trim();
                    }
                }

                districts.push({
                    index: districts.length + 1,
                    id,
                    english,
                    hindi,
                    rawText
                });
            });
        }

        console.log(
            `[3/3] Found ${districts.length} district options`
        );

        if (districts.length > 0) {
            console.table(districts);
        } else {
            console.log('No district options found.');
        }

        return districts;

    } catch (error) {
        console.error(
            `Failed to scrape ${targetUrl}:`,
            error instanceof Error ? error.message : error
        );

        return [];
    }
}