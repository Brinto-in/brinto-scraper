const { db } = require('./turso.db.js');

/**
 * Creates the anganwadi_centres table if it doesn't already exist.
 */
async function setupDatabase() {
    console.log('Setting up database schema for anganwadi_centres...');
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
 * Inserts or ignores an array of records into the anganwadi_centres table.
 * @param {Array<Object>} records - The records to insert.
 */
async function insertRecords(records) {
    if (!records || records.length === 0) {
        console.log('No records to insert.');
        return;
    }

    console.log(`Attempting to insert ${records.length} records into anganwadi_centres...`);
    try {
        const stmts = records.map(r => ({
            sql: `INSERT OR IGNORE INTO anganwadi_centres (state, district, project, gram_panchayat, external_id, center_name, center_code, reservation, area_type, raw_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            args: [r.state, r.district, r.project, r.gram_panchayat, r.external_id, r.center_name, r.center_code, r.reservation, r.area_type, r.raw_text],
        }));
        const results = await db.batch(stmts, 'write');

        const insertedCount = results.reduce((sum, result) => sum + result.rowsAffected, 0);
        const skippedCount = records.length - insertedCount;

        console.log(`Successfully inserted ${insertedCount} new records.`);
        if (skippedCount > 0) {
            console.log(`${skippedCount} existing records were skipped.`);
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

module.exports = { setupDatabase, insertRecords, getDistrictsByState };