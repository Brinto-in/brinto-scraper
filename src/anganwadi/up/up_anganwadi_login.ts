import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';

import type {
    AnganwadiLoginDistrict
} from '../../database/repositories/anganwadi-district.repository.js';

export interface LoginResult {
    success: boolean;
    districtId: string;
    districtName: string;
    cookies: string;
}

export async function loginAnganwadiDistrict(
    district: AnganwadiLoginDistrict
): Promise<LoginResult> {

    console.log('\n' + '='.repeat(65));
    console.log('UP ANGANWADI LOGIN');
    console.log('='.repeat(65));

    console.log(`District : ${district.districtName}`);
    console.log(`Code     : ${district.districtId}`);
    console.log(`Mobile   : ${district.mobile}`);
    console.log(`Login URL: ${district.loginUrl}`);

    try {

        // ========================================================
        // STEP 1: Open login page
        // ========================================================

        console.log('\n[1/3] Opening login page...');

        const pageResponse = await gotScraping({
            url: district.loginUrl,

            https: {
                rejectUnauthorized: false
            },

            timeout: {
                request: 15000
            }
        });

        const rawCookies = pageResponse.headers['set-cookie'];

        const sessionCookie = Array.isArray(rawCookies)
            ? rawCookies
                .map((cookie) => String(cookie).split(';')[0])
                .join('; ')
            : '';

        const $ = cheerio.load(pageResponse.body);

        console.log(
            `✓ Login page loaded (${pageResponse.statusCode})`
        );

        // ========================================================
        // STEP 2: Find login form
        // ========================================================

        console.log('\n[2/3] Parsing login form...');

        const form = $('form').first();

        if (form.length === 0) {
            throw new Error('Login form not found');
        }

        console.log('✓ Login form found');

        // We'll inspect the actual field names before submitting.
        console.log('\nLogin form fields:');

        form.find('input').each((_, element) => {
            const name = $(element).attr('name') ?? '';
            const type = $(element).attr('type') ?? 'text';

            console.log(
                `  ${name} (${type})`
            );
        });

        // ========================================================
        // STEP 3: Login
        // ========================================================

        console.log('\n[3/3] Login submission will be added after');
        console.log('      confirming the portal field names.');

        return {
            success: false,
            districtId: district.districtId,
            districtName: district.districtName,
            cookies: sessionCookie
        };

    } catch (error) {

        console.error(
            `Login failed for ${district.districtName}:`,
            error instanceof Error
                ? error.message
                : error
        );

        return {
            success: false,
            districtId: district.districtId,
            districtName: district.districtName,
            cookies: ''
        };
    }
}