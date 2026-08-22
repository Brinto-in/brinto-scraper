import { scrapeTelanganaDistricts } from './district_scraper.js';

export async function runTelanganaAnganwadi(): Promise<void> {

    console.log('\n==============================================');
    console.log('TELANGANA ANGANWADI');
    console.log('==============================================');

    const districts = await scrapeTelanganaDistricts();

    console.log('\nTelangana Districts:');
}

// runTelanganaAnganwadi();