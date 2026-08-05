const cheerio = require('cheerio');
const { solveCaptcha } = require('./img_to_number');

const LOGIN_URL   = 'https://upanganwadibharti.in/workernew/users/login.php';
const CAPTCHA_URL = 'https://upanganwadibharti.in/workernew/captcha.php';
const SUBMIT_URL  = 'https://upanganwadibharti.in/workernew/users/submit_login.php';

/**
 * Logs in with mobile/password, solves the captcha via OCR,
 * and returns fresh session cookies on success.
 * @throws if login fails or captcha is unresolvable
 */
async function loginWithoutChromium(mobile, password) {
    const { gotScraping } = await import('got-scraping');
    const { CookieJar }   = await import('tough-cookie');

    const cookieJar = new CookieJar();

    // Step 1 — load login page to grab CSRF token
    const loginPage = await gotScraping({ url: LOGIN_URL, cookieJar, retry: { limit: 0 } });
    const token = cheerio.load(loginPage.body)('input[name="_token"]').val();
    if (!token) throw new Error('CSRF token not found on login page');

    // Step 2 — download & OCR the captcha
    const captchaImg  = await gotScraping({ url: CAPTCHA_URL, cookieJar, responseType: 'buffer' });
    const captchaCode = await solveCaptcha(captchaImg.body);
    console.log(`   🔍 Captcha: ${captchaCode}`);
    if (!captchaCode || captchaCode.length < 4) throw new Error(`Invalid captcha: "${captchaCode}"`);

    // Step 3 — submit credentials
    const post = await gotScraping({
        url: SUBMIT_URL, method: 'POST', cookieJar,
        form: { _token: token, user_id: mobile, pass: password, captcha: captchaCode, login_submit: '' },
        followRedirect: false,
    });

    const redirect = post.headers.location || '';
    if (!redirect.includes('step-1.php')) throw new Error(`Login failed — redirect: ${redirect || 'none'}`);

    // Step 4 — collect cookies
    const jar  = await cookieJar.getCookies(LOGIN_URL);
    const hdrs = post.headers['set-cookie'] || [];
    const map  = Object.fromEntries(jar.map(c => [c.key, c.value]));
    hdrs.forEach(sc => {
        const [k, v] = sc.split(';')[0].split('=');
        if (k && v) map[k.trim()] = v.trim();
    });

    return {
        cfClearanceToken: map['cf_clearance'] || null,
        sessionId:        map['PHPSESSID']     || null,
    };
}

module.exports = { loginWithoutChromium };