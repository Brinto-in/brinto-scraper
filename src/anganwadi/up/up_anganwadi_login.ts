import { gotScraping } from 'got-scraping';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';


import type {
    AnganwadiLoginDistrict
} from '../../database/repositories/anganwadi-district.repository.js';
import { solveImage } from '../../libs/img_to_numbers.js';

export interface AnganwadiLoginResult {
    success: boolean;
    sessionId: string | null;
    cfClearanceToken: string | null;
}

export async function loginAnganwadiDistrict(
    district: AnganwadiLoginDistrict
): Promise<AnganwadiLoginResult> {

    console.log('\n' + '='.repeat(70));
    console.log('UP ANGANWADI LOGIN');
    console.log('='.repeat(70));

    console.log(`District : ${district.districtName}`);
    console.log(`Code     : ${district.districtId}`);
    console.log(`Mobile   : ${district.mobile}`);
    console.log(`Login URL: ${district.loginUrl}`);

    const cookieJar = new CookieJar();

    try {

        // ========================================================
        // STEP 1 - Load login page
        // ========================================================

        console.log('\n[1/4] Loading login page...');

        const loginPage = await gotScraping({
            url: district.loginUrl,
            cookieJar,
            retry: {
                limit: 0
            },
            https: {
                rejectUnauthorized: false
            },
            timeout: {
                request: 15000
            }
        });

        const $ = cheerio.load(loginPage.body);

        const token =
            $('input[name="_token"]').attr('value') ?? '';

        if (!token) {
            throw new Error(
                'CSRF token not found on login page'
            );
        }

        console.log('✓ Login page loaded');
        console.log('✓ CSRF token found');

        // ========================================================
        // STEP 2 - Get CAPTCHA
        // ========================================================

        console.log('\n[2/4] Downloading CAPTCHA...');

        const captchaImage = await gotScraping({
            url: district.captchaUrl,
            cookieJar,
            responseType: 'buffer',
            retry: {
                limit: 0
            },
            headers: {
                Referer: district.loginUrl
            },
            https: {
                rejectUnauthorized: false
            },
            timeout: {
                request: 15000
            }
        });

        console.log('✓ CAPTCHA downloaded');

        // IMPORTANT:
        // The same cookieJar is used here.
        // Therefore PHPSESSID remains associated
        // with this login session.

        console.log('\n[3/4] Solving CAPTCHA...');

        const captchaCode =
            await solveImage(captchaImage.body);

        console.log(
            `🔍 Captcha: ${captchaCode}`
        );

        if (
            !captchaCode ||
            captchaCode.length < 4
        ) {
            throw new Error(
                `Invalid captcha: "${captchaCode}"`
            );
        }

        // ========================================================
        // STEP 3 - Submit login
        // ========================================================

        console.log('\n[4/4] Submitting login...');

        const post = await gotScraping({
            url: district.submitUrl,

            method: 'POST',

            cookieJar,

            retry: {
                limit: 0
            },

            form: {
                _token: token,
                user_id: district.mobile,
                pass: district.password,
                captcha: captchaCode,
                login_submit: ''
            },

            followRedirect: false,

            https: {
                rejectUnauthorized: false
            },

            timeout: {
                request: 15000
            },

            headers: {
                Referer: district.loginUrl,
                Origin: 'https://upanganwadibharti.in'
            }
        });

        const redirect =
            post.headers.location ?? '';

        console.log(
            `HTTP ${post.statusCode}`
        );

        console.log(
            `Redirect: ${redirect || 'none'}`
        );

        // ========================================================
        // LOGIN SUCCESS CHECK
        // ========================================================

        if (!redirect.includes('step-1.php')) {

            console.log('✗ Login failed');

            throw new Error(
                `Login failed — redirect: ${
                    redirect || 'none'
                }`
            );
        }

        console.log('✓ Login successful');

        // ========================================================
        // GET COOKIES FROM COOKIE JAR
        // ========================================================

        const jarCookies =
            await cookieJar.getCookies(
                district.loginUrl
            );

        const cookieMap = Object.fromEntries(
            jarCookies.map((cookie) => [
                cookie.key,
                cookie.value
            ])
        );

        // Also inspect Set-Cookie returned by POST.
        const setCookies =
            post.headers['set-cookie'] ?? [];

        for (const setCookie of setCookies) {

            const firstPart: any =
                String(setCookie).split(';')[0];

            const separator =
                firstPart.indexOf('=');

            if (separator === -1) {
                continue;
            }

            const key =
                firstPart.substring(0, separator).trim();

            const value =
                firstPart.substring(separator + 1).trim();

            if (key && value) {
                cookieMap[key] = value;
            }
        }

        const sessionId =
            cookieMap['PHPSESSID'] ?? null;

        const cfClearanceToken =
            cookieMap['cf_clearance'] ?? null;

        console.log('\nSession information:');

        console.log(
            `PHPSESSID: ${
                sessionId
                    ? sessionId
                    : 'NOT FOUND'
            }`
        );

        console.log(
            `cf_clearance: ${
                cfClearanceToken
                    ? 'FOUND'
                    : 'NOT FOUND'
            }`
        );

        if (!sessionId) {
            throw new Error(
                'Login succeeded but PHPSESSID was not found'
            );
        }

        return {
            success: true,
            sessionId,
            cfClearanceToken
        };

    } catch (error) {

        console.error(
            '\n✗ Login error:',
            error instanceof Error
                ? error.message
                : error
        );

        return {
            success: false,
            sessionId: null,
            cfClearanceToken: null
        };
    }
}