const { db } = require('./turso.db');

const TABLE_NAME = 'anganwadi_centers';
const CONFLICT_COLUMNS = ['state_name', 'district_name', 'project_name', 'sector_name', 'gp', 'awc_name'];

async function setupAnganwadiCentersTable() {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
            id              INTEGER PRIMARY KEY,
            state_name      TEXT NOT NULL,
            district_name   TEXT NOT NULL,
            project_name    TEXT NOT NULL,
            sector_name     TEXT NOT NULL DEFAULT '',
            gp              TEXT NOT NULL DEFAULT '',
            awc_name        TEXT NOT NULL,
            createdAt       TEXT DEFAULT (datetime('now')),
            updatedAt       TEXT DEFAULT (datetime('now'))
        );
    `);

    // Drop legacy index if it was created on the old column set
    try {
        await db.execute(`DROP INDEX IF EXISTS idx_unique_awc;`);
    } catch (_) { }

    await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_awc
        ON ${TABLE_NAME} (${CONFLICT_COLUMNS.join(', ')});
    `);

    console.log(`Table ${TABLE_NAME} ready.`);
}

/**
 * Upserts a center and returns its id.
 * Checks for existing record first to prevent SQLite from advancing sequence on duplicate attempts.
 * Expects: { state_name, district_name, project_name, sector_name, gp, awc_name }
 */
async function upsertCenter(center) {
    const payload = {
        state_name: center.state_name ?? null,
        district_name: center.district_name ?? null,
        project_name: center.project_name ?? null,
        sector_name: center.sector_name ?? '',
        gp: center.gp ?? '',
        awc_name: center.awc_name ?? null,
    };

    const existing = await db.execute({
        sql: `
            SELECT id FROM ${TABLE_NAME}
            WHERE state_name    = ?
              AND district_name = ?
              AND project_name  = ?
              AND sector_name   = ?
              AND gp            = ?
              AND awc_name      = ?
            LIMIT 1;
        `,
        args: [payload.state_name, payload.district_name, payload.project_name, payload.sector_name, payload.gp, payload.awc_name],
    });

    if (existing.rows.length > 0) {
        const id = existing.rows[0].id;
        await db.execute({
            sql: `UPDATE ${TABLE_NAME} SET updatedAt = datetime('now') WHERE id = ?;`,
            args: [id],
        });
        return id;
    }

    const columns = Object.keys(payload);
    const placeholders = columns.map(() => '?').join(', ');

    const insertResult = await db.execute({
        sql: `
            INSERT INTO ${TABLE_NAME} (${columns.join(', ')})
            VALUES (${placeholders});
        `,
        args: Object.values(payload),
    });

    if (insertResult.lastInsertRowid !== undefined && insertResult.lastInsertRowid !== null) {
        return Number(insertResult.lastInsertRowid);
    }

    const result = await db.execute({
        sql: `
            SELECT id FROM ${TABLE_NAME}
            WHERE state_name    = ?
              AND district_name = ?
              AND project_name  = ?
              AND sector_name   = ?
              AND gp            = ?
              AND awc_name      = ?
            LIMIT 1;
        `,
        args: [payload.state_name, payload.district_name, payload.project_name, payload.sector_name, payload.gp, payload.awc_name],
    });

    return result.rows[0]?.id;
}

module.exports = { setupAnganwadiCentersTable, upsertCenter };