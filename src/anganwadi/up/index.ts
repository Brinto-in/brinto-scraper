import {
    getLoginDistricts,
    getPendingDistricts,
    upsertDistrict
} from '../../database/repositories/anganwadi-district.repository.js';

import { scrapeAnganwadiDistricts } from './district_scraper.js';
import { getGpWardProjects } from './components/up_gp_ward_projects.js';
import { registerAnganwadiDistrict } from './register/up_anganwadi_registration.js';
import { fetchProjectsForDistrict } from './components/up_dist_projects.js';
import { loginAnganwadiDistrict } from './login/up_anganwadi_login.js';
import { getAnganwadis } from './components/anganwadi_gp_projects.js';
import { upsertAnganwadiCenter } from '../../database/repositories/anganwadi-center.repository.js';
import { insertAnganwadiVacancy } from '../../database/repositories/anganwadi-vacancy.repository.js';

const PORTALS = [
    {
        registrationUrl:
            'https://upanganwadibharti.in/worker-v4/users/registration.php',

        loginUrl:
            'https://upanganwadibharti.in/worker-v4/users/login.php',

        step1Url:
            'https://upanganwadibharti.in/worker-v4/users/step-1.php',

        captchaUrl:
            'https://upanganwadibharti.in/worker-v4/captcha.php',

        submitUrl:
            'https://upanganwadibharti.in/worker-v4/users/submit_login.php'
    },
    {
        registrationUrl:
            'https://upanganwadibharti.in/workernew/users/registration.php',

        loginUrl:
            'https://upanganwadibharti.in/workernew/users/login.php',

        step1Url:
            'https://upanganwadibharti.in/workernew/users/step-1.php',

        captchaUrl:
            'https://upanganwadibharti.in/workernew/captcha.php',

        submitUrl:
            'https://upanganwadibharti.in/workernew/users/submit_login.php'
    },
    {
        registrationUrl:
            'https://upanganwadibharti.in/helper-v2/users/registration.php',

        loginUrl:
            'https://upanganwadibharti.in/helper-v2/users/login.php',

        step1Url:
            'https://upanganwadibharti.in/helper-v2/users/step-1.php',

        captchaUrl:
            'https://upanganwadibharti.in/helper-v2/captcha.php',

        submitUrl:
            'https://upanganwadibharti.in/helper-v2/users/submit_login.php'
    }
];

export async function runUpAnganwadiScraper(): Promise<void> {
    const { gotScraping } = await import('got-scraping');

    // ============================================================
    // STEP 1: SCRAPE DISTRICTS
    // ============================================================

    console.log('\n==============================================');
    console.log('UP ANGANWADI - DISTRICT SCRAPING');
    console.log('==============================================');

    for (const portal of PORTALS) {

        const districts = await scrapeAnganwadiDistricts(
            portal.registrationUrl
        );

        for (const district of districts) {

            await upsertDistrict({
                state: 'UP',
                districtId: district.id,
                districtName: district.english,

                sourceUrl: portal.registrationUrl,
                loginUrl: portal.loginUrl,
                step1Url: portal.step1Url,
                captchaUrl: portal.captchaUrl,
                submitUrl: portal.submitUrl
            });
        }
    }

    // ============================================================
    // STEP 2: GET DISTRICTS WITHOUT LOGIN DETAILS
    // ============================================================

    console.log('\n==============================================');
    console.log('UP ANGANWADI - PENDING REGISTRATIONS');
    console.log('==============================================');

    const pendingDistricts = await getPendingDistricts('UP');

    console.log(
        `Found ${pendingDistricts.length} districts pending registration`
    );

    // return
    // ============================================================
    // STEP 3: REGISTER PENDING DISTRICTS
    // ============================================================

    for (const district of pendingDistricts) {

        console.log('\n----------------------------------------------');
        console.log(
            `Registering: ${district.districtName}`
        );
        console.log(
            `District ID: ${district.districtId}`
        );
        console.log(
            `Source: ${district.sourceUrl}`
        );
        console.log('----------------------------------------------');

        try {

            await registerAnganwadiDistrict(district);

        } catch (error) {

            console.error(
                `Registration failed for ${district.districtName}:`,
                error instanceof Error
                    ? error.message
                    : error
            );
        }
    }

    console.log('\n==============================================');
    console.log('UP ANGANWADI PROCESS COMPLETED');
    console.log('==============================================');

    // ============================================================
    // STEP 4: LOGIN DISTRICTS
    // ============================================================

    console.log('\n==============================================');
    console.log('UP ANGANWADI - LOGIN');
    console.log('==============================================');

    const loginDistricts = await getLoginDistricts();

    console.log(loginDistricts);

    console.log(
        `Found ${loginDistricts.length} districts with credentials`
    );
    let dist_: any = [];
    dist_.push(loginDistricts[0]);

    // Cache static dynamic URLs or utilities outside the loop if possible
    for (const district of loginDistricts) {
        // if (district.districtName !== 'Banda') {
        //     continue
        // }
        console.log(district.districtName, district.start_date, district.end_date);

        try {
            // 1. Authenticate District
            const loginResult = await loginAnganwadiDistrict(
                district.mobile,
                district.password,
                district.loginUrl,
                district.captchaUrl,
                district.submitUrl
            );

            // 2. Extract portal name and construct AJAX URL once per district
            const portal = new URL(district.step1Url).pathname.split('/')[1];
            const ajaxUrl = `https://upanganwadibharti.in/${portal}/ajax.php`;
            const postCode = district.step1Url?.includes('helper') ? 'AWH' : 'AWW';

            // 3. Fetch Projects
            const result: any = await fetchProjectsForDistrict(gotScraping, {
                districtName: district.districtName,
                cfClearanceToken: loginResult.cfClearanceToken ?? '',
                sessionId: loginResult.sessionId ?? '',
                stepUrl: district.step1Url,
                postCode
            });

            const districtVal = result.district?.value;
            const projects = result.projects ?? [];

            // 4. Process Projects Concurrently or Sequentially
            await Promise.allSettled(
                projects.map(async (project: any) => {
                    try {
                        const gpWards = await getGpWardProjects(
                            ajaxUrl,
                            districtVal,
                            project.value
                        );

                        // Fetch all Anganwadis in parallel for the current project's GP/Wards
                        await Promise.allSettled(
                            (gpWards ?? []).map(async (gpWard: any) => {
                                try {
                                    const anganwadis: any[] = await getAnganwadis(
                                        ajaxUrl,
                                        gpWard.name,
                                        project.value,
                                        districtVal
                                    );

                                    console.log(anganwadis);

                                    // Map each Anganwadi to an async upsert task and await all of them concurrently
                                    await Promise.all(
                                        (anganwadis ?? []).map(async (awc: any) => {
                                            const centerId = await upsertAnganwadiCenter({
                                                stateName: 'Uttar Pradesh',
                                                districtName: district.districtName,
                                                projectName: project.name,
                                                sectorName: '',
                                                gp: gpWard.name,
                                                area: '',
                                                awcName: awc.name
                                            });
                                            await insertAnganwadiVacancy({
                                                centerId,
                                                postCode: postCode,
                                                postName: postCode === 'AWH' ? 'Helper' : 'Worker',
                                                vacancyCount: 1,
                                                status: 'open',
                                                startDate: district.start_date,
                                                endDate: district.end_date
                                            });
                                        })
                                    );
                                } catch (error) {
                                    console.error(
                                        `Failed Anganwadi (District: ${district.districtName}, GP/Ward: ${gpWard.name}):`,
                                        error instanceof Error ? error.message : error
                                    );
                                }
                            })
                        );
                    } catch (error) {
                        console.error(
                            `Failed Project (District: ${district.districtName}, Project: ${project.value}):`,
                            error instanceof Error ? error.message : error
                        );
                    }
                })
            );
        } catch (error) {
            console.error(
                `Failed District (${district.districtName}):`,
                error instanceof Error ? error.message : error
            );
        }
    }
    console.log('\n==============================================');
    console.log('UP ANGANWADI PROCESS COMPLETED');
    console.log('==============================================');
}