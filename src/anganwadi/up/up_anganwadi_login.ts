import * as cheerio from 'cheerio';
import { solveImage } from '../../libs/img_to_numbers.js';

const DEFAULT_LOGIN_URL = 'https://upanganwadibharti.in/workernew/users/login.php';
const DEFAULT_CAPTCHA_URL = 'https://upanganwadibharti.in/workernew/captcha.php';
const DEFAULT_SUBMIT_URL = 'https://upanganwadibharti.in/workernew/users/submit_login.php';

export interface LoginResult {
    cfClearanceToken: string | null;
    sessionId: string | null;
}

/**
 * Logs in with mobile/password for AWH, solves the captcha via OCR,
 * and returns fresh session cookies on success.
 * @throws if login fails or captcha is unresolvable
 */
export async function loginAnganwadiDistrict(
    mobile: string,
    password: string,
    loginUrl: string = DEFAULT_LOGIN_URL,
    captchaUrl: string = DEFAULT_CAPTCHA_URL,
    submitUrl: string = DEFAULT_SUBMIT_URL
): Promise<LoginResult> {
    const { gotScraping } = await import('got-scraping');
    const { CookieJar } = await import('tough-cookie');

    const cookieJar = new CookieJar();

    // Step 1 — load login page to grab CSRF token
    const loginPage = await gotScraping({ url: loginUrl, cookieJar, retry: { limit: 0 } });
    const token = cheerio.load(loginPage.body)('input[name="_token"]').val();
    if (!token || typeof token !== 'string') {
        throw new Error('CSRF token not found on login page');
    }

    // Step 2 — download & OCR the captcha
    const captchaImg = await gotScraping({ url: captchaUrl, cookieJar, responseType: 'buffer' });
    const captchaCode: string = await solveImage(captchaImg.body);
    console.log(`   🔍 Captcha: ${captchaCode}`);
    if (!captchaCode || captchaCode.length < 4) {
        throw new Error(`Invalid captcha: "${captchaCode}"`);
    }

    // Step 3 — submit credentials
    const post = await gotScraping({
        url: submitUrl,
        method: 'POST',
        cookieJar,
        form: {
            _token: token,
            user_id: mobile,
            pass: password,
            captcha: captchaCode,
            login_submit: '',
        },
        followRedirect: false,
    });

    const redirect = (post.headers.location as string) || '';
    if (!redirect.includes('step-1.php')) {
        throw new Error(`Login failed — redirect: ${redirect || 'none'}`);
    }

    // Step 4 — collect cookies
    const jar = await cookieJar.getCookies(loginUrl);
    const hdrs = (post.headers['set-cookie'] as string[]) || [];
    const map: Record<string, string> = Object.fromEntries(jar.map((c) => [c.key, c.value]));

    hdrs.forEach((sc: any) => {
        const [k, v] = sc.split(';')[0].split('=');
        if (k && v) map[k.trim()] = v.trim();
    });

    return {
        cfClearanceToken: map['cf_clearance'] || null,
        sessionId: map['PHPSESSID'] || null,
    };
}