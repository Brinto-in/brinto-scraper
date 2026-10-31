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
  const { error } = await db
    .from('anganwadi_districts')
    .upsert({
      state: district.state,
      district_id: district.districtId,
      district_name: district.districtName,
      source_url: district.sourceUrl,
      login_url: district.loginUrl,
      step_1_url: district.step1Url,
      captcha_url: district.captchaUrl,
      submit_url: district.submitUrl,
      mobile: district.mobile ?? null,
      password: district.password ?? null,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'state,district_id,source_url'
    });

  if (error) {
    throw error;
  }
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

export async function getPendingDistricts(
  state: string
): Promise<PendingAnganwadiDistrict[]> {
  const { data, error } = await db
    .from('anganwadi_districts')
    .select('id,state,district_id,district_name,source_url,captcha_url,submit_url')
    .is('mobile', null)
    .is('password', null)
    .eq('state', state)
    .order('id');

  if (error) {
    throw error;
  }

  return data.map((row) => ({
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
  const { error } = await db
    .from('anganwadi_districts')
    .update({
      mobile,
      password,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    throw error;
  }
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
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await db
    .from('anganwadi_districts')
    .select('id,state,district_id,district_name,login_url,step_1_url,captcha_url,submit_url,mobile,password,start_date,end_date')
    .not('mobile', 'is', null)
    .not('password', 'is', null)
    .neq('mobile', '')
    .neq('password', '')
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('id');

  if (error) {
    throw error;
  }

  return data.map((row) => ({
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
export interface TelanganaDistrict {
  stateName: string;
  districtName: string;
  startDate: string | null;
  endDate: string | null;
}

function toPostgresDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = value.trim();
  const dayFirstMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const match = dayFirstMatch
    ? [dayFirstMatch[0], dayFirstMatch[3], dayFirstMatch[2], dayFirstMatch[1]]
    : isoMatch;

  if (!match) {
    throw new Error(`Unsupported Telangana district date: ${value}`);
  }

  const [, year, month, day] = match;
  const parsedDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  if (
    parsedDate.getUTCFullYear() !== Number(year) ||
    parsedDate.getUTCMonth() !== Number(month) - 1 ||
    parsedDate.getUTCDate() !== Number(day)
  ) {
    throw new Error(`Invalid Telangana district date: ${value}`);
  }

  return `${year}-${month}-${day}`;
}

export async function upsertTelanganaDistrict(
  district: TelanganaDistrict
): Promise<void> {
  const { error } = await db
    .from('anganwadi_districts')
    .upsert({
      state: district.stateName,
      district_id: district.districtName,
      district_name: district.districtName,
      source_url: 'https://mis.tgwdcw.in/',
      login_url: '',
      captcha_url: '',
      submit_url: '',
      step_1_url: '',
      start_date: toPostgresDate(district.startDate),
      end_date: toPostgresDate(district.endDate),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'state,district_id,source_url'
    });

  if (error) {
    throw error;
  }
}