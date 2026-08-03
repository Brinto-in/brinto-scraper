const { db } = require('./turso.db');

const TABLE_NAME = 'anganwadi_vacancies';
const CONFLICT_COLUMNS = ['center_id', 'post_code'];

async function setupAnganwadiVacanciesTable() {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            center_id       INTEGER NOT NULL REFERENCES anganwadi_centers(id) ON DELETE CASCADE,
            post_code       TEXT NOT NULL,
            post_name       TEXT NOT NULL,
            vacancy_count   INTEGER NOT NULL DEFAULT 0,
            status          TEXT DEFAULT 'open',
            start_date      TEXT,
            end_date        TEXT,
            createdAt       TEXT DEFAULT (datetime('now')),
            updatedAt       TEXT DEFAULT (datetime('now'))
        );
    `);

    await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_vacancy_post
        ON ${TABLE_NAME} (${CONFLICT_COLUMNS.join(', ')});
    `);

    console.log(`Table ${TABLE_NAME} ready.`);
}

/**
 * Upserts vacancy rows.
 * Each entry = { center_id, post_code, post_name, vacancy_count, status, start_date, end_date }
 */
async function upsertVacancies(vacancies) {
    if (!vacancies?.length) return { totalAffected: 0 };

    const sql = `
        INSERT INTO ${TABLE_NAME} (center_id, post_code, post_name, vacancy_count, status, start_date, end_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (${CONFLICT_COLUMNS.join(', ')})
        DO UPDATE SET
            post_name = excluded.post_name,
            vacancy_count = excluded.vacancy_count,
            status = excluded.status,
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            updatedAt = datetime('now');
    `;

    const stmts = vacancies.map(v => ({
        sql,
        args: [
            v.center_id,
            v.post_code,
            v.post_name,
            v.vacancy_count ?? 0,
            v.status ?? 'open',
            v.start_date ?? null,
            v.end_date ?? null,
        ],
    }));

    const results = await db.batch(stmts, 'write');
    const totalAffected = results.reduce((sum, r) => sum + r.rowsAffected, 0);
    console.log(`Upserted ${totalAffected} vacancy rows.`);
    return { totalAffected };
}

module.exports = { setupAnganwadiVacanciesTable, upsertVacancies };