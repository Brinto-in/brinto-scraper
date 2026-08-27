import { db } from '../../config/database.js';

export interface AnganwadiVacancy {
    centerId: number;
    postCode: string;
    postName: string;
    vacancyCount: number;
    status?: string;
    startDate?: string | null;
    endDate?: string | null;
}

export async function insertAnganwadiVacancy(
    vacancy: AnganwadiVacancy
): Promise<void> {
    await db.execute({
        sql: `
            INSERT INTO anganwadi_vacancies (
                center_id,
                post_code,
                post_name,
                vacancy_count,
                status,
                start_date,
                end_date
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)

            ON CONFLICT (
                center_id,
                post_code,
                post_name
            )
            DO UPDATE SET
                vacancy_count = excluded.vacancy_count,
                status = excluded.status,
                start_date = excluded.start_date,
                end_date = excluded.end_date,
                updatedAt = datetime('now')
        `,
        args: [
            vacancy.centerId,
            vacancy.postCode,
            vacancy.postName,
            vacancy.vacancyCount,
            vacancy.status ?? 'open',
            vacancy.startDate ?? null,
            vacancy.endDate ?? null
        ]
    });
}