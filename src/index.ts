console.log('=================================');
console.log('BRINTO SCRAPER');
console.log('=================================');
console.log(`Node.js: ${process.version}`);
console.log('Scraper is running...');

import { runUpAnganwadiScraper } from './anganwadi/up/index.js';
import { runTelanganaAnganwadi } from './anganwadi/telangana/index.js';
import { runOdishaAnganwadi } from './anganwadi/odisha/index.js';

async function main(): Promise<void> {
    await runUpAnganwadiScraper();
    // await runTelanganaAnganwadi();
    // await runOdishaAnganwadi();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});