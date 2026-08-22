// import { createAnganwadiDistrictsTable } from './database/migrations/001_create_anganwadi_districts.js';
// await createAnganwadiDistrictsTable();
import './anganwadi/up/index.js';
console.log('=================================');
console.log('BRINTO SCRAPER');
console.log('=================================');
console.log(`Node.js: ${process.version}`);
console.log('Scraper is running...');

import { createAnganwadiDistrictsTable } from './database/migrations/001_create_anganwadi_districts.js';
import { runUpAnganwadiScraper } from './anganwadi/up/index.js';

async function main(): Promise<void> {
    await createAnganwadiDistrictsTable();

    await runUpAnganwadiScraper();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});