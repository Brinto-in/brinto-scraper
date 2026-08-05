const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { solveCaptcha } = require('./img_to_number');

// Local array of credentials to log in and collect sessions
const accounts = [
    { districtName: 'Ambedkarnagar', mobile: '5555566678', password: 'Test@1234' },
];

/**
 * Performs login for a single mobile/password combination.
 * Automatically solves the captcha using OCR.
 * Returns the session cookies on success.
 */
async function loginWithoutChromium(mobile, password) {
    const { gotScraping } = await import('got-scraping');
    const { CookieJar } = await import('tough-cookie');

    const cookieJar = new CookieJar();
    const loginUrl = 'https://upanganwadibharti.in/workernew/users/login.php';
    const captchaUrl = 'https://upanganwadibharti.in/workernew/captcha.php';
    const submitUrl = 'https://upanganwadibharti.in/workernew/users/submit_login.php';

    // GET login page to initialize cookies and get CSRF token
    const response = await gotScraping({
        url: loginUrl,
        cookieJar,
        retry: { limit: 0 }
    });

    const $ = cheerio.load(response.body);
    const token = $('input[name="_token"]').val();
    if (!token) {
        throw new Error('CSRF Token not found on login page.');
    }

    // Download CAPTCHA image using the same session/cookie jar
    const captchaResponse = await gotScraping({
        url: captchaUrl,
        cookieJar,
        responseType: 'buffer'
    });

    // Auto-solve captcha using OCR
    const captchaCode = await solveCaptcha(captchaResponse.body);
    console.log(`   🔍 OCR detected captcha: ${captchaCode}`);

    if (!captchaCode || captchaCode.length < 4) {
        throw new Error(`OCR returned invalid captcha: "${captchaCode}"`);
    }

    // POST form submission
    const postResponse = await gotScraping({
        url: submitUrl,
        method: 'POST',
        cookieJar,
        form: {
            _token: token,
            user_id: mobile,
            pass: password,
            captcha: captchaCode,
            login_submit: ''
        },
        followRedirect: false
    });

    // Check if we successfully logged in / redirected to step-1.php
    const redirectUrl = postResponse.headers.location || '';
    if (!redirectUrl.includes('step-1.php')) {
        throw new Error(`Login failed. Redirected to: ${redirectUrl || 'nowhere'}`);
    }

    // Retrieve all cookies from the jar
    const cookies = await cookieJar.getCookies(loginUrl);

    // Also check response headers for set-cookie
    const setCookieHeaders = postResponse.headers['set-cookie'] || [];

    const cookieMap = {};
    cookies.forEach(c => {
        cookieMap[c.key] = c.value;
    });

    // Parse set-cookie headers manually if needed
    setCookieHeaders.forEach(sc => {
        const parts = sc.split(';')[0].split('=');
        if (parts.length >= 2) {
            cookieMap[parts[0].trim()] = parts[1].trim();
        }
    });

    return {
        cfClearanceToken: cookieMap['cf_clearance'] || null,
        sessionId: cookieMap['PHPSESSID'] || null,
        allCookies: cookieMap
    };
}

const MAX_RETRIES = 3;

async function main() {
    console.log(`Processing ${accounts.length} accounts locally.\n`);

    for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        if (!account.mobile || !account.password) {
            console.log(`Skipping ${account.districtName}: mobile or password missing.`);
            continue;
        }

        console.log(`--------------------------------------------------`);
        console.log(`Processing District: ${account.districtName} (${i + 1}/${accounts.length})`);
        console.log(`Mobile: ${account.mobile}`);
        console.log(`--------------------------------------------------`);

        let success = false;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const result = await loginWithoutChromium(account.mobile, account.password);

                console.log(`✅ Success! Collected cookies for ${account.districtName}:`);
                console.log(`   cfClearanceToken: ${result.cfClearanceToken || 'Not found'}`);
                console.log(`   sessionId: ${result.sessionId || 'Not found'}`);
                success = true;
                break;
            } catch (error) {
                console.error(`   ❌ Attempt ${attempt}/${MAX_RETRIES} failed: ${error.message}`);
                if (attempt < MAX_RETRIES) {
                    console.log(`   Retrying...`);
                }
            }
        }

        if (!success) {
            console.error(`   ⚠️ All ${MAX_RETRIES} attempts failed for ${account.districtName}.\n`);
        }
    }

    console.log('\nAll done processing sessions.');
}

if (require.main === module) {
    main().catch(err => {
        console.error('Fatal error in main:', err);
    });
}

module.exports = {
    loginWithoutChromium
};