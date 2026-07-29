const { getProjects, getGramPanchayats, getAnganwadis } = require('./lib/scraper');
const { getDistricts } = require('./data/districts');
const { parseCenterText } = require('./lib/parseCenterText');
const { STATE_NAME } = require('./lib/config');
const { setupDatabase, insertRecords } = require('../db-configs/turso.db.js');

// Flat array of records, one per anganwadi centre, shaped to match the
// anganwadi_centres table columns directly.
let records = [];
let totalScrapedCount = 0;

async function flush() {
  if (records.length > 0) {
    await insertRecords(records);
    totalScrapedCount += records.length;
    records = []; // Clear the array for the next batch
  }
}

async function scrapeDistrict(dist) {
  console.log(`\n=== District: ${dist.district} (${dist.value}) ===`);

  let projects;
  try {
    projects = await getProjects(dist.value);
  } catch (err) {
    console.error(`  FAILED to get projects for district ${dist.district}: ${err.message}`);
    return;
  }
  console.log(`  ${projects.length} projects found`);

  for (const project of projects) {
    console.log(`  -- Project: ${project.text} (${project.value})`);

    let gramPanchayats;
    try {
      gramPanchayats = await getGramPanchayats(project.value, dist.value);
    } catch (err) {
      console.error(`    FAILED to get gram panchayats: ${err.message}`);
      continue;
    }
    console.log(`     ${gramPanchayats.length} gram panchayats found`);

    for (const gp of gramPanchayats) {
      let anganwadis;
      try {
        anganwadis = await getAnganwadis(gp.value, project.value, dist.value);
      } catch (err) {
        console.error(`     FAILED anganwadis for GP ${gp.text}: ${err.message}`);
        anganwadis = [];
      }

      for (const aw of anganwadis) {
        const { center_name, center_code, reservation } = parseCenterText(aw.text);
        records.push({
          state: STATE_NAME,
          district: dist.district,
          project: project.text,
          gram_panchayat: gp.value,
          external_id: aw.value,
          center_name,
          center_code,
          reservation,
          area_type: Number(aw.UR),
          raw_text: aw.text,
        });
      }

      console.log(`       ${gp.text}: ${anganwadis.length} anganwadis`);
    }

    // Save progress after every project so a crash doesn't lose everything.
    await flush();
  }
}

async function main() {
  const requestedIds = process.argv.slice(2);

  console.log('Fetching list of districts...');
  const allDistricts = [{ value: 66, district: 'Sant Kabir Nagar' },];// await getDistricts();
  console.log(`Found ${allDistricts.length} districts.`);

  const targetDistricts = requestedIds.length
    ? allDistricts.filter((d) => requestedIds.includes(String(d.value)))
    : allDistricts;

  console.log(`Starting scrape of ${targetDistricts.length} district(s)...`);

  await setupDatabase();

  for (const dist of targetDistricts) {
    await scrapeDistrict(dist);
  }

  await flush(); // Save any remaining records
  console.log(`\nDone. ${totalScrapedCount} anganwadi centres saved to the database.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
