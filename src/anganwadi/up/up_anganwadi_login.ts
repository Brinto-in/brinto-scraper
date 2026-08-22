import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';
import fs from 'fs';
import readline from 'readline';

import type {
    AnganwadiLoginDistrict
} from '../../database/repositories/anganwadi-district.repository.js';
import { solveImage } from '../../libs/img_to_numbers.js';

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

/**
 * Convert Set-Cookie headers into a normal Cookie header.
 */
function mergeCookies(
    existingCookies: string,
    setCookieHeader: string | string[] | undefined
): string {

    const cookieMap = new Map<string, string>();

    // Existing cookies
    if (existingCookies) {
        existingCookies
            .split(';')
            .map((cookie) => cookie.trim())
            .filter(Boolean)
            .forEach((cookie) => {
                const index = cookie.indexOf('=');

                if (index > 0) {
                    const name = cookie.substring(0, index);
                    const value = cookie.substring(index + 1);

                    cookieMap.set(name, value);
                }
            });
    }

    // New Set-Cookie headers
    const cookies = Array.isArray(setCookieHeader)
        ? setCookieHeader
        : setCookieHeader
            ? [setCookieHeader]
            : [];

    for (const cookie of cookies) {

        const firstPart:any = String(cookie).split(';')[0];

        const index = firstPart.indexOf('=');

        if (index <= 0) {
            continue;
        }

        const name = firstPart.substring(0, index);
        const value = firstPart.substring(index + 1);

        cookieMap.set(name, value);
    }

    return Array.from(cookieMap.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
}

/**
 * Extract PHPSESSID from Cookie header.
 */
function extractPhpSessId(
    cookies: string
): string {

    const match = cookies.match(
        /(?:^|;\s*)PHPSESSID=([^;]+)/i
    );

    return match?.[1] ?? '';
}

export interface AnganwadiLoginResult {
    success: boolean;
    isLoggedIn: boolean;

    districtId: string;
    districtName: string;

    phpSessId: string;
    cookies: string;

    finalUrl: string;
    statusCode: number;
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

    try {

        // ========================================================
        // STEP 1
        // Open login.php
        // ========================================================

        console.log('\n[1/4] Opening login page...');

        const loginPage = await gotScraping({
            url: district.loginUrl,

            headers: {
                'Accept-Language':
                    'en-US,en;q=0.9,hi;q=0.8',

                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
                    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
                    'Chrome/124.0.0.0 Safari/537.36'
            },

            https: {
                rejectUnauthorized: false
            },

            timeout: {
                request: 15000
            }
        });

        let cookies = mergeCookies(
            '',
            loginPage.headers['set-cookie']
        );

        console.log(
            `✓ Login page loaded (${loginPage.statusCode})`
        );

        console.log(
            `✓ Cookies: ${cookies || 'none'}`
        );

        // ========================================================
        // Parse login form
        // ========================================================

        const $ = cheerio.load(loginPage.body);

        const csrfToken =
            $('input[name="_token"]').attr('value') ?? '';

        if (!csrfToken) {
            throw new Error(
                'Login _token not found'
            );
        }

        console.log('✓ _token found');

        // ========================================================
        // STEP 2
        // Get CAPTCHA using SAME session
        // ========================================================

        console.log('\n[2/4] Getting CAPTCHA...');

        const captchaResponse = await gotScraping({
            url: district.captchaUrl,

            responseType: 'buffer',

            headers: {
                Cookie: cookies,
                Referer: district.loginUrl,

                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
                    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
                    'Chrome/124.0.0.0 Safari/537.36'
            },

            https: {
                rejectUnauthorized: false
            },

            timeout: {
                request: 15000
            }
        });

        // IMPORTANT:
        // CAPTCHA response can update PHPSESSID.
        cookies = mergeCookies(
            cookies,
            captchaResponse.headers['set-cookie']
        );

        const phpSessIdAfterCaptcha =
            extractPhpSessId(cookies);

        const captchaPath =
            `login_captcha_${district.id}.png`;

        fs.writeFileSync(
            captchaPath,
            captchaResponse.body
        );

        console.log(
            `✓ CAPTCHA saved: ${captchaPath}`
        );

        console.log(
            `✓ PHPSESSID: ${phpSessIdAfterCaptcha || 'NOT FOUND'
            }`
        );

        // ========================================================
        // STEP 3
        // CAPTCHA input
        // ========================================================

        const captcha = await solveImage(captchaPath);

        if (!captcha) {
            throw new Error(
                'CAPTCHA cannot be empty'
            );
        }

        // ========================================================
        // STEP 4
        // Submit login
        // ========================================================

        console.log(
            '\n[3/4] Submitting login...'
        );

        const submitResponse =
            await gotScraping.post(
                district.loginUrl,
                {
                    headers: {
                        Cookie: cookies,

                        Referer:
                            district.loginUrl,

                        Origin:
                            'https://upanganwadibharti.in',

                        'Content-Type':
                            'application/x-www-form-urlencoded',

                        'User-Agent':
                            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
                            'AppleWebKit/537.36 (KHTML, like Gecko) ' +
                            'Chrome/124.0.0.0 Safari/537.36'
                    },

                    form: {
                        _token: csrfToken,

                        user_id:
                            district.mobile,

                        pass:
                            district.password,

                        captcha,

                        login_submit: ''
                    },

                    https: {
                        rejectUnauthorized: false
                    },

                    followRedirect: true,

                    timeout: {
                        request: 20000
                    }
                }
            );

        // Merge any cookies returned by login.
        cookies = mergeCookies(
            cookies,
            submitResponse.headers['set-cookie']
        );

        const phpSessId =
            extractPhpSessId(cookies);

        console.log(
            `HTTP ${submitResponse.statusCode}`
        );

        console.log(
            `Final URL: ${submitResponse.url}`
        );

        console.log(
            `PHPSESSID: ${phpSessId || 'NOT FOUND'
            }`
        );

        // ========================================================
        // Check response
        // ========================================================

        const body =
            submitResponse.body ?? '';

        const bodyLower =
            body.toLowerCase();

        const captchaError =
            bodyLower.includes(
                'captcha verification failed'
            ) ||
            bodyLower.includes(
                'invalid captcha'
            ) ||
            bodyLower.includes(
                'कृपया सही कैप्चा दर्ज करें'
            );

        const invalidCredentials =
            bodyLower.includes(
                'invalid user id'
            ) ||
            bodyLower.includes(
                'invalid password'
            ) ||
            bodyLower.includes(
                'user not found'
            ) ||
            bodyLower.includes(
                'गलत यूजर आईडी'
            ) ||
            bodyLower.includes(
                'पासवर्ड गलत है'
            );

        // The old implementation also used step-1/dashboard/
        // logout/welcome indicators to determine authentication.
        const authenticated =
            submitResponse.url.includes(
                'step-1'
            ) ||
            submitResponse.url.includes(
                'dashboard'
            ) ||
            submitResponse.url.includes(
                'application'
            ) ||
            submitResponse.url.includes(
                'profile'
            ) ||
            bodyLower.includes(
                'step-1.php'
            ) ||
            bodyLower.includes(
                'logout'
            ) ||
            bodyLower.includes(
                'लॉगआउट'
            ) ||
            bodyLower.includes(
                'welcome'
            ) ||
            bodyLower.includes(
                'स्वागत'
            );

        if (captchaError) {

            console.log(
                '✗ CAPTCHA verification failed'
            );

            return {
                success: false,
                isLoggedIn: false,

                districtId:
                    district.districtId,

                districtName:
                    district.districtName,

                phpSessId,
                cookies,

                finalUrl:
                    submitResponse.url,

                statusCode:
                    submitResponse.statusCode
            };
        }

        if (invalidCredentials) {

            console.log(
                '✗ Invalid user ID/password'
            );

            return {
                success: false,
                isLoggedIn: false,

                districtId:
                    district.districtId,

                districtName:
                    district.districtName,

                phpSessId,
                cookies,

                finalUrl:
                    submitResponse.url,

                statusCode:
                    submitResponse.statusCode
            };
        }

        console.log(
            '\n[4/4] Login session established'
        );

        console.log(
            `✓ PHPSESSID = ${phpSessId}`
        );

        console.log(
            `✓ Authenticated = ${authenticated}`
        );

        return {
            success:
                submitResponse.statusCode >= 200 &&
                submitResponse.statusCode < 400 &&
                !captchaError,

            isLoggedIn:
                authenticated,

            districtId:
                district.districtId,

            districtName:
                district.districtName,

            phpSessId,
            cookies,

            finalUrl:
                submitResponse.url,

            statusCode:
                submitResponse.statusCode
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
            isLoggedIn: false,

            districtId:
                district.districtId,

            districtName:
                district.districtName,

            phpSessId: '',
            cookies: '',

            finalUrl:
                district.loginUrl,

            statusCode: 0
        };
    }
}