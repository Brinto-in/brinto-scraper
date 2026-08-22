import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';

export interface Anganwadi {
    id: string;
    name: string;
}

export async function getAnganwadis(
    ajaxUrl: string,
    grampanchayatID: string,
    pid: string,
    distID: string,
): Promise<Anganwadi[]> {

    const response = await gotScraping({
        url: ajaxUrl,
        method: 'POST',


        form: {
            grampanchayatID,
            pid,
            distID,
            UR: ''
        },

        https: {
            rejectUnauthorized: false
        },

        retry: {
            limit: 0
        }
    });

    console.log(
        `Status: ${response.statusCode}`
    );

    const $ = cheerio.load(response.body);

    const anganwadis: Anganwadi[] = [];

    $('option').each((_, element) => {

        const id =
            $(element)
                .attr('value')
                ?.trim() ?? '';

        const name =
            $(element)
                .text()
                .trim();

        if (!id || !name) {
            return;
        }

        anganwadis.push({
            id,
            name
        });
    });

    return anganwadis;
}