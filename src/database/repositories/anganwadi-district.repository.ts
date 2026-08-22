import { db } from '../../config/database.js';

export interface AnganwadiDistrict {
  state: string;
  districtId: string;
  districtName: string;

  sourceUrl: string;
  loginUrl: string;
  step1Url: string;
  captchaUrl: string;
  submitUrl: string;

  mobile?: string;
  password?: string;
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
            source_url,
            login_url,
            step_1_url,
            captcha_url,
            submit_url,
            mobile,
            password
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

        ON CONFLICT(state, district_id, source_url)
        DO UPDATE SET
            district_name = excluded.district_name,
            login_url = excluded.login_url,
            step_1_url = excluded.step_1_url,
            captcha_url = excluded.captcha_url,
            submit_url = excluded.submit_url,
            updated_at = CURRENT_TIMESTAMP
    `,
    args: [
      district.state,
      district.districtId,
      district.districtName,
      district.sourceUrl,
      district.loginUrl,
      district.step1Url,
      district.captchaUrl,
      district.submitUrl,
      district.mobile ?? null,
      district.password ?? null
    ]
  });
}

export interface PendingAnganwadiDistrict {
  id: number;
  state: string;
  districtId: string;
  districtName: string;
  sourceUrl: string;
  captchaUrl: string;
  submitUrl: string;
}

export async function getPendingDistricts(): Promise<
  PendingAnganwadiDistrict[]
> {
  const result = await db.execute(`
    SELECT
      id,
      state,
      district_id,
      district_name,
      source_url,
      captcha_url,
      submit_url
    FROM anganwadi_districts
    WHERE mobile IS NULL
      AND password IS NULL
    ORDER BY id
  `);

  return result.rows.map((row) => ({
    id: Number(row.id),
    state: String(row.state),
    districtId: String(row.district_id),
    districtName: String(row.district_name),
    sourceUrl: String(row.source_url),
    captchaUrl: String(row.captcha_url),
    submitUrl: String(row.submit_url)
  }));
}

export async function updateDistrictLogin(
  id: number,
  mobile: string,
  password: string
): Promise<void> {
  await db.execute({
    sql: `
            UPDATE anganwadi_districts
            SET
                mobile = ?,
                password = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `,
    args: [
      mobile,
      password,
      id
    ]
  });
}

export interface AnganwadiLoginDistrict {
  id: number;
  state: string;
  districtId: string;
  districtName: string;

  loginUrl: string;
  step1Url: string;
  captchaUrl: string;
  submitUrl: string;

  mobile: string;
  password: string;

  start_date: string | null;
  end_date: string | null;
}

export async function getLoginDistricts(): Promise<
  AnganwadiLoginDistrict[]
> {
  const result = await db.execute(`
        SELECT
            id,
            state,
            district_id,
            district_name,
            login_url,
            step_1_url,
            captcha_url,
            submit_url,
            mobile,
            password,
            start_date,
            end_date
        FROM anganwadi_districts
        WHERE mobile IS NOT NULL
          AND password IS NOT NULL
          AND mobile != ''
          AND password != ''
          AND (
              end_date IS NULL
              OR date(end_date) >= date('now')
          )
        ORDER BY id
    `);

  return result.rows.map((row) => ({
    id: Number(row.id),
    state: String(row.state),
    districtId: String(row.district_id),
    districtName: String(row.district_name),

    loginUrl: String(row.login_url),
    step1Url: String(row.step_1_url),
    captchaUrl: String(row.captcha_url),
    submitUrl: String(row.submit_url),

    mobile: String(row.mobile),
    password: String(row.password),

    start_date:
      row.start_date !== null && row.start_date !== undefined
        ? String(row.start_date)
        : null,

    end_date:
      row.end_date !== null && row.end_date !== undefined
        ? String(row.end_date)
        : null
  }));
}