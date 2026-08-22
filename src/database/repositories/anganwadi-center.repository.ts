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
): Promise<number> {

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
            DO NOTHING
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

    const result: any = await db.execute({
        sql: `
            SELECT id
            FROM anganwadi_centers
            WHERE
                state_name = ?
                AND district_name = ?
                AND project_name = ?
                AND sector_name = ?
                AND gp = ?
                AND awc_name = ?
            LIMIT 1
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

    if (result.rows.length === 0) {
        throw new Error(
            `Anganwadi center not found: ${center.awcName}`
        );
    }

    return Number(result.rows[0].id);
}