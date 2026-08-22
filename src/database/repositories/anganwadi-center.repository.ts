import { db } from '../../config/database.js';

export interface AnganwadiCenter {
    stateName: string;
    districtName: string;
    projectName: string;
    sectorName: string;
    gp: string;
    awcName: string;
}

export async function upsertAnganwadiCenter(
    center: AnganwadiCenter
): Promise<void> {

    await db.execute({
        sql: `
            INSERT INTO anganwadi_centers (
                state_name,
                district_name,
                project_name,
                sector_name,
                gp,
                awc_name
            )
            VALUES (?, ?, ?, ?, ?, ?)

            ON CONFLICT (
                state_name,
                district_name,
                project_name,
                sector_name,
                gp,
                awc_name
            )
            DO UPDATE SET
                updatedAt = datetime('now')
        `,
        args: [
            center.stateName,
            center.districtName,
            center.projectName,
            center.sectorName,
            center.gp,
            center.awcName
        ]
    });
}