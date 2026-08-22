import { db } from '../../config/database.js';

export async function createAnganwadiDistrictsTable(): Promise<void> {
  await db.execute(`
        CREATE TABLE IF NOT EXISTS anganwadi_districts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            state TEXT NOT NULL,
            district_id TEXT NOT NULL,
            district_name TEXT NOT NULL,

            source_url TEXT NOT NULL,
            login_url TEXT NOT NULL,
            captcha_url TEXT NOT NULL,
            submit_url TEXT NOT NULL,
            step_1_url TEXT NOT NULL,

            mobile TEXT,
            password TEXT,

            start_date TEXT,
            end_date TEXT,

            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

            UNIQUE (
                state,
                district_id,
                source_url
            )
        )
    `);

  console.log('✓ anganwadi_districts table ready');
}