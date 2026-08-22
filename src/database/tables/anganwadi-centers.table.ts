import { db } from '../../config/database.js';

export async function createAnganwadiCentersTable(): Promise<void> {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS anganwadi_centers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            state_name TEXT NOT NULL,
            district_name TEXT NOT NULL,
            project_name TEXT NOT NULL,
            sector_name TEXT NOT NULL DEFAULT '',
            gp TEXT NOT NULL DEFAULT '',
            awc_name TEXT NOT NULL,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now')),

            UNIQUE (
                state_name,
                district_name,
                project_name,
                sector_name,
                gp,
                awc_name
            )
        )
    `);

    console.log('✓ anganwadi_centers table ready');
}