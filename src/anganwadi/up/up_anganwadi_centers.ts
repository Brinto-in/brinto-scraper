import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';

export interface AnganwadiCenter {
    id: string;
    name: string;
}

export interface FetchAnganwadiCentersParams {
    ajaxUrl: string;
    grampanchayatID: string;
    pid: string;
    distID: string;
    cookies?: string;
    userAgent?: string;
}

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Fetches and parses Anganwadi centers options from the target AJAX endpoint.
 * 
 * @returns Array of parsed Anganwadi Centers or empty array on failure/session expiration
 */
export async function getAnganwadiCenters({
    ajaxUrl,
    grampanchayatID,
    pid,
    distID,
    cookies,
    userAgent = DEFAULT_USER_AGENT,
}: FetchAnganwadiCentersParams): Promise<AnganwadiCenter[]> {
    try {
        const requestOptions: any = {
            url: ajaxUrl,
            method: 'POST',
            form: {
                grampanchayatID,
                pid,
                distID,
                UR: '',
            },
            https: {
                rejectUnauthorized: false,
            },
            retry: {
                limit: 0,
            },
            headers: {
                'User-Agent': userAgent,
                ...(cookies ? { Cookie: cookies } : {}),
            },
        };

        const response = await gotScraping(requestOptions);

        if (response.statusCode !== 200) {
            console.warn(`⚠️ Request failed with status code: ${response.statusCode}`);
            return [];
        }

        const $ = cheerio.load(response.body);
        const centers: AnganwadiCenter[] = [];

        $('option').each((_, element) => {
            const id = $(element).attr('value')?.trim() ?? '';
            const name = $(element).text().trim().replace(/\s+/g, ' ');

            // Ignore empty default placeholders (e.g., "-- Select --" or value="")
            if (!id || !name || id === '0') {
                return;
            }

            centers.push({ id, name });
        });

        if (!centers.length) {
            console.warn(`⚠️ No centers found for GP ID: ${grampanchayatID} (Session might be expired or bad payload)`);
        }

        return centers;
    } catch (err: any) {
        console.error(`❌ getAnganwadiCenters error: ${err?.message || err}`);
        return [];
    }
}