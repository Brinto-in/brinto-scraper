import { db } from "../../config/database.js";

export interface AnganwadiCenter {
    stateName: string;
    districtName: string;
    projectName: string;
    sectorName: string;
    gp: string;
    area: string;
    awcName: string;
}

export async function upsertAnganwadiCenter(
    center: AnganwadiCenter
): Promise<number> {
    const { data, error } = await db
        .from('anganwadi_centers')
        .upsert({
            state_name: center.stateName,
            district_name: center.districtName,
            project_name: center.projectName,
            sector_name: center.sectorName,
            gp: center.gp,
            area: center.area,
            awc_name: center.awcName,
            updatedAt: new Date().toISOString()
        }, {
            onConflict: 'state_name,district_name,project_name,sector_name,gp,area,awc_name'
        })
        .select('id')
        .single();

    if (error) {
        throw error;
    }
    if (!data) {
        throw new Error('Supabase did not return the upserted anganwadi center');
    }

    return Number(data.id);
}