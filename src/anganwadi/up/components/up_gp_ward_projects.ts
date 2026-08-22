import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';

export interface AnganwadiProject {
    id: string;
    name: string;
}

export async function getGpWardProjects(
    ajaxUrl: string,
    distID: string,
    projectID: string,
    gramp = ''
): Promise<AnganwadiProject[]> {

    const response = await gotScraping({
        url: ajaxUrl,
        method: 'POST',

        form: {
            gramp,
            projectID,
            distID
        },

        https: {
            rejectUnauthorized: false
        },

        retry: {
            limit: 0
        }
    });

    const $ = cheerio.load(response.body);

    const projects: AnganwadiProject[] = [];

    $('option').each((_, element) => {
        const id =
            $(element).attr('value')?.trim() ?? '';

        const name =
            $(element).text().trim();

        // Ignore default option
        if (!id || !name) {
            return;
        }

        projects.push({
            id,
            name
        });
    });

    return projects;
}