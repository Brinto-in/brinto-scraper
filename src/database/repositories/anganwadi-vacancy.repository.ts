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
    const { error } = await db
        .from('anganwadi_vacancies')
        .upsert({
            center_id: vacancy.centerId,
            post_code: vacancy.postCode,
            post_name: vacancy.postName,
            vacancy_count: vacancy.vacancyCount,
            status: vacancy.status ?? 'open',
            start_date: vacancy.startDate ?? null,
            end_date: vacancy.endDate ?? null,
            updatedAt: new Date().toISOString()
        }, {
            onConflict: 'center_id,post_code,post_name'
        });

    if (error) {
        throw error;
    }
}