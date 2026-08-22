import { db } from '../../config/database.js';

export async function createAnganwadiVacanciesTable(): Promise<void> {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS anganwadi_vacancies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            center_id INTEGER NOT NULL
                REFERENCES anganwadi_centers(id)
                ON DELETE CASCADE,

            post_code TEXT NOT NULL,
            post_name TEXT NOT NULL,

            vacancy_count INTEGER NOT NULL DEFAULT 0,

            status TEXT NOT NULL DEFAULT 'open',

            start_date TEXT,
            end_date TEXT,

            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now')),

            UNIQUE (
                center_id,
                post_code,
                post_name
            )
        )
    `);

    console.log('✓ anganwadi_vacancies table ready');
}