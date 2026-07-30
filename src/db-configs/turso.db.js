const { createClient } = require('@libsql/client');
require('dotenv').config();

// if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
//     throw new Error('Turso database URL and auth token are required. Please set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables.');
// }

const db = createClient({
    url: 'libsql://brinto-brinto2026.aws-ap-south-1.turso.io',
    authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODM1OTk4ODEsImlkIjoiMDE5ZjQ1YjctOWYwMS03NDY4LThlMTYtY2I2NzFjMDJhNGFkIiwia2lkIjoidmhrTzNxUFUtWUcweEdQWVVRZ2dBWUdxaW1yWF85QjRuTDI1RFVDUlF2OCIsInJpZCI6ImQzNjQ4ZDllLTJmM2UtNGVmYy04YThjLTJjY2RiYmUwOWMxYyJ9.PAJFizf1J05Kh5-ju810DiB5SdRY3tkaUpufaEy3lXRcU-AG5aXB9KowXAllqgUJW3WqFn64FdIvjEgd6AORDQ',
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

    console.log(`Attempting to insert ${records.length} records...`);
    try {
        const stmts = records.map(r => ({
            sql: `INSERT OR IGNORE INTO anganwadi_centres (state, district, project, gram_panchayat, external_id, center_name, center_code, reservation, area_type, raw_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            args: [r.state, r.district, r.project, r.gram_panchayat, r.external_id, r.center_name, r.center_code, r.reservation, r.area_type, r.raw_text],
        }));
        const results = await db.batch(stmts, 'write');

        let insertedCount = 0;
        const skippedRecords = [];

        results.forEach((result, index) => {
            if (result.rowsAffected > 0) {
                insertedCount++;
            } else {
                skippedRecords.push(records[index]);
            }
        });

        console.log(`Successfully inserted ${insertedCount} new records.`);
        if (skippedRecords.length > 0) {
            console.log(`${skippedRecords.length} existing records were skipped.`);
            // To see details of skipped records, you can uncomment the next line:
            // console.log('Skipped records:', JSON.stringify(skippedRecords.map(r => ({ district: r.district, center_name: r.center_name, external_id: r.external_id })), null, 2));
        }
    } catch (err) {
        console.error('Failed to insert records:', err);
        throw err;
    }
}

/**
 * Fetches all districts for a given state ID from the database.
 * @param {number} stateId The ID of the state.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of district objects.
 */
async function getDistrictsByState(stateId) {
    console.log(`Fetching districts for state_id: ${stateId}...`);
    try {
        const rs = await db.execute({
            sql: 'SELECT * FROM districts WHERE state_id = ?',
            args: [stateId],
        });
        console.log(`Found ${rs.rows.length} districts in the database.`);
        return rs.rows;
    } catch (err) {
        console.error(`Failed to fetch districts for state_id ${stateId}:`, err);
        throw err;
    }
}

module.exports = { db, setupDatabase, insertRecords, getDistrictsByState };
