const { createClient } = require('@libsql/client');
require('dotenv').config();

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error('Turso database URL and auth token are required. Please set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables.');
}

const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

/**
 * Creates the anganwadi_centres table if it doesn't already exist.
 * The schema is based on the data structure from the JSON file.
 */
async function setupDatabase() {
    console.log('Setting up database schema...');
    try {
        await db.execute(`
      CREATE TABLE IF NOT EXISTS anganwadi_centres (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        state TEXT,
        district TEXT,
        project TEXT,
        gram_panchayat TEXT,
        external_id TEXT UNIQUE,
        center_name TEXT,
        center_code TEXT,
        reservation TEXT,
        area_type INTEGER,
        raw_text TEXT UNIQUE,
        scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('Table anganwadi_centres is ready.');
    } catch (err) {
        console.error('Failed to set up database schema:', err);
        throw err;
    }
}

/**
 * Inserts or replaces an array of records into the anganwadi_centres table.
 * Using REPLACE ensures that if we re-scrape a center, its data is updated.
 * @param {Array<Object>} records - The records to insert.
 */
async function insertRecords(records) {
    if (!records || records.length === 0) {
        console.log('No records to insert.');
        return;
    }

    console.log(`Inserting/updating ${records.length} records...`);
    try {
        const stmts = records.map(r => ({
            sql: `REPLACE INTO anganwadi_centres (state, district, project, gram_panchayat, external_id, center_name, center_code, reservation, area_type, raw_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            args: [r.state, r.district, r.project, r.gram_panchayat, r.external_id, r.center_name, r.center_code, r.reservation, r.area_type, r.raw_text],
        }));
        await db.batch(stmts, 'write');
        console.log('Successfully saved records to the database.');
    } catch (err) {
        console.error('Failed to insert records:', err);
        throw err;
    }
}

module.exports = { db, setupDatabase, insertRecords };
