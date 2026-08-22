import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';
import fs from 'fs';
import readline from 'readline';

import type { PendingAnganwadiDistrict } from '../../database/repositories/anganwadi-district.repository.js';
import { updateDistrictLogin } from '../../database/repositories/anganwadi-district.repository.js';
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

function generateDynamicMobile(districtCode: string | number): string {
    const code = String(districtCode)
        .trim()
        .replace(/[^0-9]/g, '');

    if (!code) {
        throw new Error('Invalid district code');
    }

    const formattedCode =
        code.length === 1
            ? code.padStart(2, '0')
            : code;

    const prefixLength = 10 - formattedCode.length;

    return '5'.repeat(prefixLength) + formattedCode;
}

export async function registerAnganwadiDistrict(
    district: PendingAnganwadiDistrict
): Promise<void> {

    console.log('\n' + '='.repeat(65));
    console.log('UP ANGANWADI REGISTRATION');
    console.log('='.repeat(65));

    console.log(`District : ${district.districtName}`);
    console.log(`Code     : ${district.districtId}`);
    console.log(`URL      : ${district.sourceUrl}`);

    const applicantName = 'Testing';
    const fatherName = 'Testing';
    const password = 'Test@1234';

    const mobile = generateDynamicMobile(
        district.districtId
    );

    console.log(`Mobile   : ${mobile}`);
    console.log(`Password : ${password}`);

    try {

        // ========================================================
        // STEP 1: Establish session
        // ========================================================

        console.log('\n[1/4] Establishing session...');

        const pageRes = await gotScraping({
            url: district.sourceUrl,
            https: {
                rejectUnauthorized: false
            },
            timeout: {
                request: 15000
            }
        });

        const rawCookies = pageRes.headers['set-cookie'];

        const sessionCookie = Array.isArray(rawCookies)
            ? rawCookies
                .map((cookie) => String(cookie).split(';')[0])
                .join('; ')
            : '';

        const $ = cheerio.load(pageRes.body);

        const csrfToken =
            $('meta[name="csrf-token"]').attr('content') ?? '';

        console.log('✓ Session established');

        // ========================================================
        // STEP 2: Download CAPTCHA
        // ========================================================

        console.log('\n[2/4] Downloading CAPTCHA...');

        const captchaRes = await gotScraping({
            url: district.captchaUrl,
            responseType: 'buffer',

            headers: {
                Cookie: sessionCookie,
                Referer: district.sourceUrl
            },

            https: {
                rejectUnauthorized: false
            }
        });

        const captchaPath =
            `captcha_${district.id}.png`;

        fs.writeFileSync(
            captchaPath,
            captchaRes.body
        );

        console.log(
            `✓ CAPTCHA saved: ${captchaPath}`
        );

        const captchaCode = await solveImage(captchaPath);

        // ========================================================
        // STEP 3: Manual CAPTCHA
        // ========================================================

        // console.log(
        //     `\nOpen ${captchaPath} and enter the CAPTCHA.`
        // );

        // const captcha = await askQuestion(
        //     'CAPTCHA: '
        // );

        if (!captchaCode) {
            throw new Error('CAPTCHA cannot be empty');
        }

        // ========================================================
        // STEP 4: Submit registration
        // ========================================================

        console.log('\n[3/4] Submitting registration...');

        const postRes = await gotScraping.post(
            district.submitUrl,
            {
                headers: {
                    Cookie: sessionCookie,
                    Referer: district.sourceUrl,
                    Origin: 'https://upanganwadibharti.in',

                    ...(csrfToken
                        ? {
                            'X-CSRF-TOKEN': csrfToken
                        }
                        : {})
                },

                form: {
                    applicant_name: applicantName,
                    father_name: fatherName,
                    district: district.districtId,
                    mobile_no: mobile,
                    pass: password,
                    aadhar: '',
                    emailid: '',
                    captchacode: '',
                    captcha: captchaCode,
                    registration_submit: ''
                },

                https: {
                    rejectUnauthorized: false
                },

                followRedirect: true
            }
        );

        console.log(
            `HTTP ${postRes.statusCode}`
        );

        console.log(
            `Final URL: ${postRes.url}`
        );

        // ========================================================
        // STEP 5: Check response
        // ========================================================

        const responseBody = postRes.body.toLowerCase();

        const registrationFailed =
            responseBody.includes('invalid captcha') ||
            responseBody.includes('captcha incorrect') ||
            responseBody.includes('already registered') ||
            responseBody.includes('error');

        if (registrationFailed) {
            console.log(
                '✗ Registration was not successful'
            );

            console.log(
                postRes.body.slice(0, 1000)
            );

            return;
        }

        // ========================================================
        // STEP 6: Save credentials
        // ========================================================

        await updateDistrictLogin(
            district.id,
            mobile,
            password
        );

        console.log(
            '✓ Registration successful'
        );

        console.log(
            '✓ Mobile and password saved to database'
        );

        console.log('='.repeat(65));

    } catch (error) {

        console.error(
            'Registration error:',
            error instanceof Error
                ? error.message
                : error
        );

    } finally {

        rl.close();
    }
}