const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { setupAnganwadiVacanciesTable, upsertAnganwadiVacancies } = require('../../db-configs/anganwadi_vacancies.js');

const REQUIRED_FIELDS = ['state', 'district', 'project_block', 'center_name'];

function toRecord(row) {
    return {
        state: row.state,
        district: row.district,
        project_block: row.project_block,
        mandal: row.mandal,
        sector: row.sector,
        center_name: row.center_name,
        awc_id: row.awc_id,
        awt: Number(row.awt) || 0,
        aww: Number(row.aww) || 0,
        awh: Number(row.awh) || 0,
        awh_start_date: row.awh_start_date || null,
        awh_end_date: row.awh_end_date || null,
        rural_urban: (row.rural_urban || '').charAt(0).toUpperCase(),
    };
}

function isValid(record) {
    const missing = REQUIRED_FIELDS.filter(f => !record[f]);
    if (missing.length) {
        console.warn(`Skipping row, missing [${missing.join(', ')}]:`, record);
        return false;
    }
    if (!['R', 'U'].includes(record.rural_urban)) {
        console.warn('Skipping row, invalid rural_urban:', record);
        return false;
    }
    return true;
}

function readAndParseCsv() {
    const csvFilePath = path.join(__dirname, 'telengana.csv');
    const records = [];
    const seenKeys = new Set();

    return new Promise((resolve, reject) => {
        fs.createReadStream(csvFilePath)
            .pipe(csv())
            .on('data', (row) => {
                const record = toRecord(row);
                if (!isValid(record)) return;

                // Match the DB's unique index exactly
                const key = [record.state, record.district, record.project_block, record.mandal, record.sector, record.center_name].join('|');
                if (seenKeys.has(key)) {
                    console.warn('Skipping duplicate:', key);
                    return;
                }
                seenKeys.add(key);
                records.push(record);
            })
            .on('end', () => {
                console.log(`Parsed ${records.length} valid records from ${path.basename(csvFilePath)}.`);
                resolve(records);
            })
            .on('error', reject);
    });
}

async function main() {
    try {
        await setupAnganwadiVacanciesTable();
        const records = await readAndParseCsv();
        if (records.length) {
            await upsertAnganwadiVacancies(records);
        } else {
            console.log('No valid records to import.');
        }
        console.log('Import complete.');
    } catch (err) {
        console.error('Import failed:', err.message);
        process.exit(1);
    }
}

main();