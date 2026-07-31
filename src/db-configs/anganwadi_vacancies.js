const { db } = require('./turso.db.js');

const TABLE_NAME = 'anganwadi_vacancies';
const CONFLICT_COLUMNS = ['state', 'district', 'project_block', 'mandal', 'sector', 'center_name'];
const CONFLICT_WHERE = `state = 'Telangana'`; // must match the partial index below

async function setupAnganwadiVacanciesTable() {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            state           TEXT    NOT NULL,
            district        TEXT    NOT NULL,
            project_block   TEXT    NOT NULL,
            mandal          TEXT,
            sector          TEXT,
            area            TEXT,
            center_name     TEXT    NOT NULL,
            awc_id          TEXT,
            awt             INTEGER DEFAULT 0 CHECK (awt IN (0,1)),
            aww             INTEGER DEFAULT 0 CHECK (aww IN (0,1)),
            awh             INTEGER DEFAULT 0 CHECK (awh IN (0,1)),
            awh_start_date  TEXT,
            awh_end_date    TEXT,
            rural_urban     TEXT    CHECK (rural_urban IN ('R','U')),
            view_doc_url    TEXT,
            createdAt       TEXT    DEFAULT (datetime('now')),
            updatedAt       TEXT    DEFAULT (datetime('now'))
        );
    `);

    await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_telangana
        ON ${TABLE_NAME} (${CONFLICT_COLUMNS.join(', ')})
        WHERE ${CONFLICT_WHERE};
    `);

    console.log(`Table ${TABLE_NAME} ready.`);
}

async function upsertAnganwadiVacancies(records) {
    if (!records?.length) return { totalAffected: 0 };

    const columns = Object.keys(records[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const updateSet = columns
        .filter(col => !CONFLICT_COLUMNS.includes(col))
        .map(col => `${col} = excluded.${col}`)
        .join(', ');

    const sql = `
        INSERT INTO ${TABLE_NAME} (${columns.join(', ')})
        VALUES (${placeholders})
        ON CONFLICT (${CONFLICT_COLUMNS.join(', ')}) WHERE ${CONFLICT_WHERE}
        DO UPDATE SET ${updateSet}, updatedAt = datetime('now');
    `;

    const stmts = records.map(record => ({ sql, args: Object.values(record) }));

    try {
        const results = await db.batch(stmts, 'write');
        const totalAffected = results.reduce((sum, r) => sum + r.rowsAffected, 0);
        console.log(`Upserted ${totalAffected} rows into ${TABLE_NAME}.`);
        return { totalAffected };
    } catch (err) {
        console.error(`Upsert failed for ${TABLE_NAME}:`, err);
        throw err;
    }
}

module.exports = { setupAnganwadiVacanciesTable, upsertAnganwadiVacancies };