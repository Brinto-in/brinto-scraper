import * as cheerio from 'cheerio';

// const STEP1_URLS: Record<string, string> = {
//     AWW: 'https://upanganwadibharti.in/workernew/users/step-1.php', // Anganwadi Worker
// };

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface Option {
    name: string;
    value: string;
}

export interface DistrictProjectsResult {
    district: Option | null;
    projects: Option[];
}

export interface FetchProjectsParams {
    districtName?: string;
    cfClearanceToken?: string;
    sessionId?: string;
    stepUrl?: string;
    postCode?: string;
}

// Minimal interface for got-scraping / httpClient instance
export interface ScrapingHttpClient {
    get: (url: string, options?: any) => Promise<{ body: string }>;
}

/**
 * Fetches the step-1 page for a district session and parses
 * the district ID + available project list from the dropdowns.
 */
export async function fetchProjectsForDistrict(
    httpClient: any,
    { districtName, cfClearanceToken, sessionId, stepUrl, postCode = 'AWW' }: FetchProjectsParams
): Promise<DistrictProjectsResult> {
    console.log(stepUrl);
    const step1Url = stepUrl;
    console.log(step1Url);
    
    if (!step1Url) {
        throw new Error(`Invalid postCode "${postCode}" provided.`);
    }

    try {
        const response = await httpClient.get(step1Url, {
            headers: {
                Cookie: `cf_clearance=${cfClearanceToken}; PHPSESSID=${sessionId}`,
                'User-Agent': UA,
            },
        });

        const $ = cheerio.load(response.body);

        const districtOpt = $('select#district option[value!=""]').first();
        const district: Option | null = districtOpt.length
            ? { name: districtOpt.text().trim(), value: districtOpt.attr('value') || '' }
            : null;

        if (!district) console.warn(`⚠️  No district found in dropdown for ${districtName}`);

        const projects: Option[] = [];
        $('select#project option[value]').each((_, el) => {
            const value = $(el).attr('value');
            const name = $(el).text().trim().replace(/\s+/g, ' ');
            if (value) projects.push({ value, name });
        });

        if (!projects.length) console.warn(`⚠️  No projects found for ${districtName} — session may be expired`);

        return { district, projects };
    } catch (err: any) {
        console.error(`❌ fetchProjectsForDistrict(${districtName}): ${err.message}`);
        return { district: null, projects: [] };
    }
}