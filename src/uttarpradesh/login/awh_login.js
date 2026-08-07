const cheerio = require('cheerio');
const { solveCaptcha } = require('./img_to_number');

const LOGIN_URL = 'https://upanganwadibharti.in/helper-v2/users/login.php';
const CAPTCHA_URL = 'https://upanganwadibharti.in/helper-v2/captcha.php';
const SUBMIT_URL = 'https://upanganwadibharti.in/helper-v2/users/submit_login.php';

/**
 * Logs in with mobile/password for AWH, solves the captcha via OCR,
 * and returns fresh session cookies on success.
 * @throws if login fails or captcha is unresolvable
 */
async function loginAwhWithoutChromium(mobile, password) {
    const { gotScraping } = await import('got-scraping');
    const { CookieJar } = await import('tough-cookie');

    const cookieJar = new CookieJar();

    // Step 1 — load login page to grab CSRF token
    const loginPage = await gotScraping({ url: LOGIN_URL, cookieJar, retry: { limit: 0 } });
    const token = cheerio.load(loginPage.body)('input[name="_token"]').val();
    if (!token) throw new Error('CSRF token not found on login page');

    // Step 2 — download & OCR the captcha
    const captchaImg = await gotScraping({ url: CAPTCHA_URL, cookieJar, responseType: 'buffer' });
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
    const jar = await cookieJar.getCookies(LOGIN_URL);
    const hdrs = post.headers['set-cookie'] || [];
    const map = Object.fromEntries(jar.map(c => [c.key, c.value]));
    hdrs.forEach(sc => {
        const [k, v] = sc.split(';')[0].split('=');
        if (k && v) map[k.trim()] = v.trim();
    });

    return {
        cfClearanceToken: map['cf_clearance'] || null,
        sessionId: map['PHPSESSID'] || null,
    };
}

module.exports = { loginAwhWithoutChromium };

// Allow running standalone for quick testing: node src/uttarpradesh/login/awh_login.js
if (require.main === module) {
    const sessions = require('./awh_up_sessions');
    const { fetchProjectsForDistrict } = require('../up_project');
    const { getGramPanchayats, getAnganwadis } = require('../lib/scraper');

    if (!sessions || sessions.length === 0) {
        console.error('No sessions found in awh_up_sessions.js to test.');
        process.exit(1);
    }

    async function runAllLogins() {
        const { gotScraping } = await import('got-scraping');

        for (const session of sessions) {
            console.log(`\n--- Attempting login for ${session.districtName} (${session.mobile}) ---`);
            try {
                const loginResult = await loginAwhWithoutChromium(session.mobile, session.password);
                console.log('✅ Login successful!');
                console.log(JSON.stringify(loginResult, null, 2));

                // After login, fetch the projects for this session
                console.log('  Fetching projects...');
                const fullSession = { ...session, ...loginResult, postCode: 'AWH' };
                const { district, projects } = await fetchProjectsForDistrict(gotScraping, fullSession);

                if (district) {
                    console.log(`  District found: ${district.name} (ID: ${district.value})`);
                } else {
                    console.log('  ⚠️  Could not identify district from step-1 page.');
                }

                if (projects.length > 0) {
                    console.log(`  Projects (${projects.length}):`);
                    projects.forEach(p => console.log(`    - ${p.name} (ID: ${p.value})`));
                } else {
                    console.log('  ⚠️  No projects found on page.');
                    continue; // No projects to process, skip to next session
                }

                // For each project, get Gram Panchayats
                for (const project of projects) {
                    try {
                        console.log(`    Fetching Gram Panchayats for project: "${project.name}"...`);
                        const gramPanchayats = await getGramPanchayats(project.value, district.value, 'AWH');
                        console.log(`      ✅ Found ${gramPanchayats.length} Gram Panchayats.`);
                        for (const gp of gramPanchayats) {
                            console.log(`        - ${gp.text}`);
                            try {
                                console.log(`          Fetching Anganwadis for GP: "${gp.text}"...`);
                                const anganwadis = await getAnganwadis(gp.value, project.value, district.value, 'AWH');
                                console.log(`            ✅ Found ${anganwadis.length} Anganwadis.`);
                                for (const awc of anganwadis) {
                                    console.log(`              - ${awc.text}`);
                                }
                            } catch (awcErr) {
                                console.error(`          ❌ Failed to get Anganwadis for "${gp.text}": ${awcErr.message}`);
                            }
                        }
                    } catch (gpErr) {
                        console.error(`      ❌ Failed to get Gram Panchayats for "${project.name}": ${gpErr.message}`);
                    }
                }

            } catch (err) {
                console.error('❌ Login failed:', err.message);
            }
        }
        console.log('\n--- All login attempts completed ---');
    }

    runAllLogins().catch(err => console.error('Fatal error during login loop:', err));
}