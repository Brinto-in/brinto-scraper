// scrape-project.js
// Usage: node scrape-project.js <mobile_number> <password>
// It will download the captcha image to captcha.png, ask you to view it and type the code.

const axios = require('axios');
const cheerio = require('cheerio');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const fs = require('fs');
const readline = require('readline');

const BASE = 'https://upanganwadibharti.in/workernew';

const jar = new CookieJar();
const client = wrapper(axios.create({ jar, withCredentials: true }));

function ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

async function main() {
    const [, , mobile, password] = process.argv;
    if (!mobile || !password) {
        console.error('Usage: node scrape-project.js <mobile> <password>');
        process.exit(1);
    }

    // 1. Load login page to get CSRF token + a session cookie
    const loginPageRes = await client.get(`${BASE}/users/login.php`);
    let $ = cheerio.load(loginPageRes.data);
    const token = $('input[name="_token"]').attr('value');

    // 2. Download the captcha image (same session, so it matches the cookie)
    const captchaRes = await client.get(`${BASE}/captcha.php`, { responseType: 'arraybuffer' });
    fs.writeFileSync('captcha.png', captchaRes.data);
    console.log('Saved captcha.png — open it and read the code.');

    // 3. Ask you for the captcha text (manual step — required)
    const captchaText = await ask('Enter the captcha you see in captcha.png: ');

    // 4. Submit the login form
    const loginRes = await client.post(
        `${BASE}/users/submit_login.php`,
        new URLSearchParams({
            _token: token,
            user_id: mobile,
            pass: password,
            captcha: captchaText,
        }),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': `${BASE}/users/login.php`,
            },
            maxRedirects: 5,
        }
    );

    // 5. Fetch whatever page contains the "project" dropdown (adjust URL as needed)
    const dashboardRes = await client.get(`${BASE}/users/dashboard.php`); // <-- change to real post-login page
    $ = cheerio.load(dashboardRes.data);

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