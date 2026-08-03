const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { setupAnganwadiCentersTable, upsertCenter } = require('../../db-configs/anganwadi_centers.js');
const { setupAnganwadiVacanciesTable, upsertVacancies } = require('../../db-configs/anganwadi_vacancies.js');

function toIsoDate(dateStr) {
    if (!dateStr || dateStr.trim() === '-') return null;
    const trimmed = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const match = trimmed.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
    if (!match) return null;
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

async function processRow(row) {
    const center = {
        state: row.state,
        district: row.district,
        project_block: row.project_block,
        mandal: row.mandal || null,
        sector: row.sector || null,
        area: row.area || null,
        center_name: row.center_name,
        awc_id: row.awc_id || null,
        rural_urban: ('R').charAt(0).toUpperCase(),
    };

    const requiredFields = ['state', 'district', 'project_block', 'center_name'];
    const missing = requiredFields.filter(f => !center[f]);
    if (missing.length) {
        console.warn(`Skipping row, missing [${missing.join(', ')}]:`, row);
        return [];
    }

    const centerId = await upsertCenter(center);

    const roleMap = {
        AWT: { flag: row.awt, start: row.awt_start_date, end: row.awt_end_date },
        AWW: { flag: row.aww, start: row.aww_start_date, end: row.aww_end_date },
        AWH: { flag: row.awh, start: row.awh_start_date, end: row.awh_end_date },
    };

    const vacancies = [];
    for (const [role, data] of Object.entries(roleMap)) {
        if (Number(data.flag) === 1) {
            vacancies.push({
                center_id: centerId,
                role,
                is_vacant: 1,
                start_date: toIsoDate(data.start),
                end_date: toIsoDate(data.end),
            });
        }
    }
    console.log(vacancies);
    return vacancies;
}

function readCsv() {
    return new Promise((resolve, reject) => {
        const rows = [];
        fs.createReadStream(path.join(__dirname, 'hyd.csv'))
            .pipe(csv())
            .on('data', row => rows.push(row))
            .on('end', () => resolve(rows))
            .on('error', reject);
    });
}

async function main() {
    try {
        await setupAnganwadiCentersTable();
        await setupAnganwadiVacanciesTable();

        const rows = await readCsv();
        let allVacancies = [];
        for (const row of rows) {
            const vacancies = await processRow(row);
            allVacancies = allVacancies.concat(vacancies);
        }

        if (allVacancies.length) {
            await upsertVacancies(allVacancies);
        } else {
            console.log('No valid vacancy records to import.');
        }
        console.log('Import complete.');
    } catch (err) {
        console.error('Import failed:', err.message);
        process.exit(1);
    }
}

main();