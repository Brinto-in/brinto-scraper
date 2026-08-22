import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';
import fs from 'fs';
import readline from 'readline';

import type {
    AnganwadiLoginDistrict
} from '../../database/repositories/anganwadi-district.repository.js';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(question: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
}

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

        console.log('\n[1/4] Opening login page...');

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
        // STEP 2: Get CSRF token
        // ========================================================

        console.log('\n[2/4] Reading login form...');

        const token =
            $('input[name="_token"]').attr('value') ?? '';

        if (!token) {
            throw new Error(
                'Login CSRF token not found'
            );
        }

        console.log('✓ CSRF token found');

        // ========================================================
        // STEP 3: CAPTCHA
        // ========================================================

        console.log('\n[3/4] CAPTCHA required');

        /*
         * Use the CAPTCHA endpoint associated with this portal.
         *
         * The CAPTCHA must be entered manually.
         */

        const captchaResponse = await gotScraping({
            url: district.captchaUrl,

            responseType: 'buffer',

            headers: {
                Cookie: sessionCookie,
                Referer: district.loginUrl
            },

            https: {
                rejectUnauthorized: false
            }
        });

        const captchaPath =
            `login_captcha_${district.id}.png`;

        fs.writeFileSync(
            captchaPath,
            captchaResponse.body
        );

        console.log(
            `✓ CAPTCHA saved: ${captchaPath}`
        );

        const captcha = await askQuestion(
            'Enter CAPTCHA: '
        );

        if (!captcha) {
            throw new Error(
                'CAPTCHA cannot be empty'
            );
        }

        // ========================================================
        // STEP 4: Submit login
        // ========================================================

        console.log('\n[4/4] Submitting login...');

        const loginResponse = await gotScraping.post(
            district.loginUrl,
            {
                headers: {
                    Cookie: sessionCookie,
                    Referer: district.loginUrl,
                    Origin: 'https://upanganwadibharti.in'
                },

                form: {
                    _token: token,
                    user_id: district.mobile,
                    pass: district.password,
                    captcha
                },

                https: {
                    rejectUnauthorized: false
                },

                followRedirect: true
            }
        );

        console.log(
            `HTTP ${loginResponse.statusCode}`
        );

        console.log(
            `Final URL: ${loginResponse.url}`
        );

        // Combine initial + redirect cookies if provided.
        const responseCookies =
            loginResponse.headers['set-cookie'];

        const newCookies = Array.isArray(responseCookies)
            ? responseCookies
                .map((cookie) => String(cookie).split(';')[0])
                .join('; ')
            : '';

        const cookies = [
            sessionCookie,
            newCookies
        ]
            .filter(Boolean)
            .join('; ');

        // ========================================================
        // Determine login result
        // ========================================================

        const finalUrl = loginResponse.url.toLowerCase();

        const body = loginResponse.body.toLowerCase();

        const loginFailed =
            body.includes('invalid captcha') ||
            body.includes('invalid password') ||
            body.includes('invalid user') ||
            body.includes('incorrect') ||
            body.includes('login failed');

        if (loginFailed) {

            console.log(
                '✗ Login failed'
            );

            console.log(
                loginResponse.body.slice(0, 1000)
            );

            return {
                success: false,
                districtId: district.districtId,
                districtName: district.districtName,
                cookies
            };
        }

        /*
         * If the portal redirects away from login.php,
         * that is a strong indication that login succeeded.
         */
        const redirectedAwayFromLogin =
            !finalUrl.includes('/users/login.php');

        const success =
            redirectedAwayFromLogin;

        if (success) {

            console.log(
                '✓ Login successful'
            );

            console.log(
                `✓ Session URL: ${loginResponse.url}`
            );

        } else {

            console.log(
                '⚠ Login result could not be confirmed'
            );
        }

        return {
            success,
            districtId: district.districtId,
            districtName: district.districtName,
            cookies
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

    } finally {
        rl.close();
    }
}