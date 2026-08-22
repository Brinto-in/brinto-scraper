import { db } from '../../config/database.js';

export interface AnganwadiDistrict {
  state: string;
  districtId: string;
  districtName: string;
  sourceUrl: string;
}

export async function upsertDistrict(
  district: AnganwadiDistrict
): Promise<void> {
  await db.execute({
    sql: `
      INSERT INTO anganwadi_districts (
        state,
        district_id,
        district_name,
        source_url
      )
      VALUES (?, ?, ?, ?)

      ON CONFLICT(state, district_id, source_url)
      DO UPDATE SET
        district_name = excluded.district_name,
        updated_at = CURRENT_TIMESTAMP
    `,
    args: [
      district.state,
      district.districtId,
      district.districtName,
      district.sourceUrl
    ]
  });
}