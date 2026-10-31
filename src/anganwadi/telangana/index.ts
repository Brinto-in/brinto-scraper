import { scrapeTelanganaDistricts } from './district_scraper.js';
import {
    upsertTelanganaDistrict
} from '../../database/repositories/anganwadi-district.repository.js';
import { scrapeTelanganaAnganwadi } from './scraper.js';

export async function runTelanganaAnganwadi(): Promise<void> {

    console.log('\n==============================================');
    console.log('TELANGANA ANGANWADI');
    console.log('==============================================');

    const districts = await scrapeTelanganaDistricts();

    for (const district of districts) {
        try {

            await upsertTelanganaDistrict(district);

            console.log(
                `✓ Saved: ${district.districtName} | ` +
                `${district.startDate ?? 'N/A'} - ` +
                `${district.endDate ?? 'N/A'}`
            );

        } catch (error) {

            console.error(
                `Failed to save ${district.districtName}:`,
                error instanceof Error
                    ? error.message
                    : error
            );
        }
    }

    console.log(
        `✓ Telangana districts processed: ${districts.length}`
    );

    await scrapeTelanganaAnganwadi();
}