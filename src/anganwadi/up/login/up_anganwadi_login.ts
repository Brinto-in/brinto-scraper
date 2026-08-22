import { gotScraping } from 'got-scraping';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';
import { solveImage } from '../../../libs/img_to_numbers.js';


export interface AnganwadiLoginResult {
    cfClearanceToken: string | null;
    sessionId: string | null;
}

export async function loginAnganwadiDistrict(
    mobile: string,
    password: string,
    loginUrl: string,
    captchaUrl: string,
    submitUrl: string
): Promise<AnganwadiLoginResult> {

    const cookieJar = new CookieJar();

    // ============================================================
    // STEP 1 — Load login page and get CSRF token
    // ============================================================

    const loginPage = await gotScraping({
        url: loginUrl,
        cookieJar,
        retry: {
            limit: 0
        },
        https: {
            rejectUnauthorized: false
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

    // ============================================================
    // STEP 2 — Download CAPTCHA and solve using OCR
    // ============================================================

    const captchaImage = await gotScraping({
        url: captchaUrl,
        cookieJar,
        responseType: 'buffer',
        retry: {
            limit: 0
        },
        https: {
            rejectUnauthorized: false
        }
    });

    const captchaCode =
        await solveImage(captchaImage.body);

    console.log(
        `   🔍 Captcha: ${captchaCode}`
    );

    if (
        !captchaCode ||
        captchaCode.length < 4
    ) {
        throw new Error(
            `Invalid captcha: "${captchaCode}"`
        );
    }

    // ============================================================
    // STEP 3 — Submit credentials
    // ============================================================

    const post = await gotScraping({
        url: submitUrl,

        method: 'POST',

        cookieJar,

        retry: {
            limit: 0
        },

        form: {
            _token: token,
            user_id: mobile,
            pass: password,
            captcha: captchaCode,
            login_submit: ''
        },

        followRedirect: false,

        https: {
            rejectUnauthorized: false
        }
    });

    const redirect =
        post.headers.location ?? '';

    console.log(
        `   ↪ Redirect: ${redirect || 'none'}`
    );

    if (!redirect.includes('step-1.php')) {
        throw new Error(
            `Login failed — redirect: ${
                redirect || 'none'
            }`
        );
    }

    // ============================================================
    // STEP 4 — Collect cookies
    // ============================================================

    const jarCookies =
        await cookieJar.getCookies(loginUrl);

    const responseCookies =
        post.headers['set-cookie'] ?? [];

    const cookieMap: Record<string, string> =
        Object.fromEntries(
            jarCookies.map((cookie) => [
                cookie.key,
                cookie.value
            ])
        );

    for (const setCookie of responseCookies) {

        const firstPart:any =
            String(setCookie).split(';')[0];

        const separator =
            firstPart.indexOf('=');

        if (separator === -1) {
            continue;
        }

        const key =
            firstPart
                .substring(0, separator)
                .trim();

        const value =
            firstPart
                .substring(separator + 1)
                .trim();

        if (key && value) {
            cookieMap[key] = value;
        }
    }

    const result: AnganwadiLoginResult = {
        cfClearanceToken:
            cookieMap['cf_clearance'] ?? null,

        sessionId:
            cookieMap['PHPSESSID'] ?? null
    };

    console.log(
        `   ✓ PHPSESSID: ${
            result.sessionId ?? 'NOT FOUND'
        }`
    );

    return result;
}