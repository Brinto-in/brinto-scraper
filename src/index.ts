import { createAnganwadiDistrictsTable } from './database/migrations/001_create_anganwadi_districts.js';
import { createAnganwadiCentersTable } from './database/tables/anganwadi-centers.table.js';
import { createAnganwadiVacanciesTable } from './database/tables/anganwadi-vacancies.table.js';
// await createAnganwadiDistrictsTable();
// await createAnganwadiCentersTable();
// await createAnganwadiVacanciesTable();
import './anganwadi/up/index.js';
console.log('=================================');
console.log('BRINTO SCRAPER');
console.log('=================================');
console.log(`Node.js: ${process.version}`);
console.log('Scraper is running...');

import { runUpAnganwadiScraper } from './anganwadi/up/index.js';

async function main(): Promise<void> {
    await runUpAnganwadiScraper();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});