import { createAnganwadiDistrictsTable } from './database/migrations/001_create_anganwadi_districts.js';
// import './anganwadi/up/index.js';
console.log('=================================');
console.log('BRINTO SCRAPER');
console.log('=================================');
console.log(`Node.js: ${process.version}`);
console.log('Scraper is running...');
await createAnganwadiDistrictsTable();