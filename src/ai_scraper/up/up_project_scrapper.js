// scrape-project.js
// Usage: node scrape-project.js <mobile_number> <password>
// It will download the captcha image to captcha.png, ask you to view it and type the code.
const cheerio = require('cheerio');
const { CookieJar } = require('tough-cookie');
const fs = require('fs');
const readline = require('readline');
const BASE = 'https://upanganwadibharti.in/workernew';

function ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

async function main() {
    const { gotScraping } = await import('got-scraping');
    const cookieJar = new CookieJar();
    const client = gotScraping.extend({
        headerGeneratorOptions: {
            browsers: [{ name: 'chrome', minVersion: 110 }],
            devices: ['desktop'],
            operatingSystems: ['macos'],
        },
        cookieJar,
    });
    // Static login details for Ayodhya
    const mobile = '5555566661';
    const password = 'Test@1234';

    console.log(`Using static login for Ayodhya: ${mobile}`);

    // 1. Load login page to get CSRF token + a session cookie
    const loginPageRes = await client.get(`${BASE}/users/login.php`);
    const loginPageUrl = loginPageRes.url;
    let $ = cheerio.load(loginPageRes.body);
    const token = $('input[name="_token"]').attr('value');
    const relativeFormAction = $('form').attr('action');

    if (!relativeFormAction) {
        console.error('Could not find form action URL on the login page. The page structure may have changed.');
        process.exit(1);
    }
    const formActionUrl = new URL(relativeFormAction, loginPageUrl).href;

    // 2. Download the captcha image (same session, so it matches the cookie)
    const captchaRes = await client.get(`${BASE}/captcha.php`, { responseType: 'buffer' });
    fs.writeFileSync('captcha.png', captchaRes.body);
    console.log('Saved captcha.png — open it and read the code.');

    // 3. Ask you for the captcha text (manual step — required)
    const captchaText = await ask('Enter the captcha you see in captcha.png [21482]: ') || '21482'; // Default to the known captcha

    // 4. Submit the login form
    const loginRes = await client.post(formActionUrl, {
        form: {
            _token: token,
            user_id: mobile,
            pass: password,
            captcha: captchaText,
        },
        headers: {
            'Referer': loginPageUrl,
            'Origin': new URL(loginPageUrl).origin,
        },
        followRedirect: true,
    });

    // Check if login was successful by looking for an error message
    let postLogin$ = cheerio.load(loginRes.body);
    if (postLogin$('body').text().includes('Invalid Captcha') || postLogin$('body').text().includes('Invalid credentials')) {
        console.error('Login failed. Please check captcha or credentials.');
        console.error('Response body:', loginRes.body);
        return;
    }

    // Log cookies after login
    console.log('\n--- Login Cookies ---');
    const cookies = await cookieJar.getCookies(BASE);
    const cfClearanceCookie = cookies.find(c => c.key === 'cf_clearance');
    const phpsessidCookie = cookies.find(c => c.key === 'PHPSESSID');

    if (cfClearanceCookie) {
        console.log(`cf_clearance: ${cfClearanceCookie.value}`);
    } else {
        console.log('cf_clearance cookie not found.');
    }
    if (phpsessidCookie) {
        console.log(`PHPSESSID: ${phpsessidCookie.value}`);
    } else {
        console.log('PHPSESSID cookie not found.');
    }
    console.log('----------------------\n');

    // 5. Fetch whatever page contains the "project" dropdown (adjust URL as needed)
    const dashboardRes = await client.get(`${BASE}/users/step-1.php`);
    $ = cheerio.load(dashboardRes.body);

    const projects = [];
    $('select#project option').each((i, el) => {
        const value = $(el).attr('value');
        const name = $(el).text().trim();
        if (value) projects.push({ value, name });
    });

    console.log('Projects found:');
    console.log(JSON.stringify(projects, null, 2));
}

main().catch(err => {
    console.error('Error:', err.message);
});