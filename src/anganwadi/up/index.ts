import {
    getPendingDistricts,
    upsertDistrict
} from '../../database/repositories/anganwadi-district.repository.js';

import { scrapeAnganwadiDistricts } from './district_scraper.js';
import { registerAnganwadiDistrict } from './up_anganwadi_registration.js';

const PORTALS = [
    {
        registrationUrl:
            'https://upanganwadibharti.in/worker-v4/users/registration.php',
        captchaUrl:
            'https://upanganwadibharti.in/worker-v4/captcha.php',
        submitUrl:
            'https://upanganwadibharti.in/worker-v4/users/submit_login.php'
    },
    // {
    //     registrationUrl:
    //         'https://upanganwadibharti.in/workernew/users/registration.php',
    //     captchaUrl:
    //         'https://upanganwadibharti.in/workernew/captcha.php',
    //     submitUrl:
    //         'https://upanganwadibharti.in/workernew/users/submit_login.php'
    // },
    // {
    //     registrationUrl:
    //         'https://upanganwadibharti.in/helper-v2/users/registration.php',
    //     captchaUrl:
    //         'https://upanganwadibharti.in/helper-v2/captcha.php',
    //     submitUrl:
    //         'https://upanganwadibharti.in/helper-v2/users/submit_login.php'
    // }
];

export async function runUpAnganwadiScraper(): Promise<void> {

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

    const pendingDistricts = await getPendingDistricts();

    console.log(
        `Found ${pendingDistricts.length} districts pending registration`
    );

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
}