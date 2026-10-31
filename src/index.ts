console.log('=================================');
console.log('BRINTO SCRAPER');
console.log('=================================');
console.log(`Node.js: ${process.version}`);
console.log('Scraper is running...');

import cron from 'node-cron';
import { runUpAnganwadiScraper } from './anganwadi/up/index.js';
import { runTelanganaAnganwadi } from './anganwadi/telangana/index.js';
import { runOdishaAnganwadi } from './anganwadi/odisha/index.js';

const scheduledScrapers = [
    ['Uttar Pradesh', runUpAnganwadiScraper],
    ['Telangana', runTelanganaAnganwadi],
    ['Odisha', runOdishaAnganwadi]
] as const;

async function runAllScrapers(): Promise<void> {
    console.log(`\nStarting scheduled scraping at ${new Date().toISOString()}`);

    for (const [state, runScraper] of scheduledScrapers) {
        try {
            await runScraper();
        } catch (error) {
            console.error(
                `Failed to run ${state} scraper:`,
                error instanceof Error ? error.stack ?? error.message : error
            );
        }
    }

    console.log(`Finished scheduled scraping at ${new Date().toISOString()}`);
}

const task = cron.schedule(
    '0 9,15 * * *',
    runAllScrapers,
    {
        name: 'all-anganwadi-scrapers',
        timezone: 'Asia/Kolkata',
        noOverlap: true
    }
);

task.on('execution:overlap', () => {
    console.warn('Skipped scheduled scraping because the previous run is still in progress');
});

console.log('=================================');
console.log('BRINTO SCRAPER SCHEDULER');
console.log('=================================');
console.log(`Node.js: ${process.version}`);
console.log('Scheduled daily at 09:00 and 15:00 Asia/Kolkata');
console.log(`Next run: ${task.getNextRun()?.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);