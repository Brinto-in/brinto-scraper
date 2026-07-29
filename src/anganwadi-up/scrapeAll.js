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
  const allDistricts = [
    {
      "district": "Sant Kabir Nagar",
      "status": "Active",
      "uploadedDate": "29-07-2026",
      "lastDate": "20-08-2026",
      "link": "https://upanganwadibharti.in/workernew/uploadOrder/ordercopy_1785308758_56a80158.pdf",
      "type": "W",
      "value": 66
    },
    {
      "district": "Etah",
      "status": "Active",
      "uploadedDate": "28-07-2026",
      "lastDate": "17-08-2026",
      "link": "https://upanganwadibharti.in/workernew/uploadOrder/ordercopy_1785244852_d03debe9.pdf",
      "type": "W",
      "value": 24
    },
    {
      "district": "Hapur",
      "status": "Active",
      "uploadedDate": "28-07-2026",
      "lastDate": "18-08-2026",
      "link": "https://upanganwadibharti.in/workernew/uploadOrder/ordercopy_1785239793_f72da20a.pdf",
      "type": "W",
      "value": 35
    },
    {
      "district": "Sitapur",
      "status": "Active",
      "uploadedDate": "27-07-2026",
      "lastDate": "16-08-2026",
      "link": "https://upanganwadibharti.in/workernew/uploadOrder/ordercopy_1785133026_befd4efe.pdf",
      "type": "W",
      "value": 71
    },
    {
      "district": "Lakhimpur Kheri",
      "status": "Active",
      "uploadedDate": "25-07-2026",
      "lastDate": "15-08-2026",
      "link": "https://upanganwadibharti.in/workernew/uploadOrder/ordercopy_1784959724_946b70b5.pdf",
      "type": "W",
      "value": 46
    },
    {
      "district": "Bulandshahr",
      "status": "Active",
      "uploadedDate": "24-07-2026",
      "lastDate": "14-08-2026",
      "link": "https://upanganwadibharti.in/workernew/uploadOrder/ordercopy_1784897506_0da337e4.pdf",
      "type": "W",
      "value": 20
    },
    {
      "district": "Firozabad",
      "status": "Active",
      "uploadedDate": "23-07-2026",
      "lastDate": "13-08-2026",
      "link": "https://upanganwadibharti.in/workernew/uploadOrder/ordercopy_1784785976_69b83996.pdf",
      "type": "W",
      "value": 28
    },
    {
      "district": "Basti",
      "status": "Active",
      "uploadedDate": "22-07-2026",
      "lastDate": "12-08-2026",
      "link": "https://upanganwadibharti.in/workernew/uploadOrder/ordercopy_1784727118_48f7dc0d.pdf",
      "type": "W",
      "value": 16
    },
    {
      "district": "Saharanpur",
      "status": "Active",
      "uploadedDate": "22-07-2026",
      "lastDate": "12-08-2026",
      "link": "https://upanganwadibharti.in/workernew/uploadOrder/ordercopy_1784708678_a0830993.pdf",
      "type": "W",
      "value": 64
    },
    {
      "district": "Ayodhya",
      "status": "Active",
      "uploadedDate": "21-07-2026",
      "lastDate": "11-08-2026",
      "link": "https://upanganwadibharti.in/workernew/uploadOrder/ordercopy_1784634634_c02c225b.pdf",
      "type": "W",
      "value": 7
    },
    {
      "district": "Unnao",
      "status": "Active",
      "uploadedDate": "21-07-2026",
      "lastDate": "11-08-2026",
      "link": "https://upanganwadibharti.in/workernew/uploadOrder/ordercopy_1784632908_d629e489.pdf",
      "type": "W",
      "value": 74
    },
    {
      "district": "Ghaziabad",
      "status": "Active",
      "uploadedDate": "17-07-2026",
      "lastDate": "07-08-2026",
      "link": "https://upanganwadibharti.in/workernew/uploadOrder/ordercopy_1784280600_a49885d4.pdf",
      "type": "W",
      "value": 30
    },
    {
      "district": "Raebareli",
      "status": "Active",
      "uploadedDate": "16-07-2026",
      "lastDate": "06-08-2026",
      "link": "https://upanganwadibharti.in/workernew/uploadOrder/ordercopy_1784210111_04e82bec.pdf",
      "type": "W",
      "value": 62
    },
    {
      "district": "Barabanki",
      "status": "Active",
      "uploadedDate": "15-07-2026",
      "lastDate": "04-08-2026",
      "link": "https://upanganwadibharti.in/workernew/uploadOrder/ordercopy_1784113781_5c84a50e.pdf",
      "type": "W",
      "value": 14
    },
    {
      "district": "Sultanpur",
      "status": "Active",
      "uploadedDate": "14-07-2026",
      "lastDate": "04-08-2026",
      "link": "https://upanganwadibharti.in/workernew/uploadOrder/ordercopy_1784035567_48325048.pdf",
      "type": "W",
      "value": 73
    },
    {
      "district": "Shahjahanpur",
      "status": "Active",
      "uploadedDate": "13-07-2026",
      "lastDate": "03-08-2026",
      "link": "https://upanganwadibharti.in/workernew/uploadOrder/ordercopy_1783933157_ae972eb6.pdf",
      "type": "W",
      "value": 67
    },
    {
      "district": "Deoria",
      "status": "Active",
      "uploadedDate": "10-07-2026",
      "lastDate": "31-07-2026",
      "link": "https://upanganwadibharti.in/workernew/uploadOrder/ordercopy_1783689125_894137f3.pdf",
      "type": "W",
      "value": 23
    },
    {
      "district": "Mainpuri",
      "status": "Active",
      "uploadedDate": "10-07-2026",
      "lastDate": "30-07-2026",
      "link": "https://upanganwadibharti.in/workernew/uploadOrder/ordercopy_1783679674_97fa1778.pdf",
      "type": "W",
      "value": 52
    },
    {
      "district": "Siddharthnagar",
      "status": "Active",
      "uploadedDate": "08-07-2026",
      "lastDate": "05-08-2026",
      "link": "https://upanganwadibharti.in/workernew/uploadOrder/ordercopy_1783511477_2ff14972.pdf",
      "type": "W",
      "value": 70
    },
    {
      "district": "Varanasi",
      "status": "Active",
      "uploadedDate": "01-07-2026",
      "lastDate": "31-07-2026",
      "link": "https://upanganwadibharti.in/workernew/uploadOrder/ordercopy_1782907362_b87d5013.pdf",
      "type": "W",
      "value": 75
    },
    {
      "district": "Aligarh",
      "status": "Active",
      "uploadedDate": "30-06-2026",
      "lastDate": "30-07-2026",
      "link": "https://upanganwadibharti.in/workernew/uploadOrder/ordercopy_1782814735_13281445.pdf",
      "type": "W",
      "value": 2
    },
    {
      "district": "Farrukhabad",
      "status": "Active",
      "uploadedDate": "29-07-2026",
      "lastDate": "19-08-2026",
      "link": "https://upanganwadibharti.in/helper-v2/uploadOrder/ordercopy1785318892.pdf",
      "type": "H",
      "value": 26
    },
    {
      "district": "Etah",
      "status": "Active",
      "uploadedDate": "28-07-2026",
      "lastDate": "17-08-2026",
      "link": "https://upanganwadibharti.in/helper-v2/uploadOrder/ordercopy1785244909.pdf",
      "type": "H",
      "value": 24
    },
    {
      "district": "Azamgarh",
      "status": "Active",
      "uploadedDate": "28-07-2026",
      "lastDate": "31-08-2026",
      "link": "https://upanganwadibharti.in/helper-v2/uploadOrder/ordercopy1785241909.pdf",
      "type": "H",
      "value": 8
    },
    {
      "district": "Hapur",
      "status": "Active",
      "uploadedDate": "28-07-2026",
      "lastDate": "18-08-2026",
      "link": "https://upanganwadibharti.in/helper-v2/uploadOrder/ordercopy1785239329.pdf",
      "type": "H",
      "value": 35
    },
    {
      "district": "Sitapur",
      "status": "Active",
      "uploadedDate": "27-07-2026",
      "lastDate": "16-08-2026",
      "link": "https://upanganwadibharti.in/helper-v2/uploadOrder/ordercopy1785133195.pdf",
      "type": "H",
      "value": 71
    },
    {
      "district": "Lakhimpur Kheri",
      "status": "Active",
      "uploadedDate": "25-07-2026",
      "lastDate": "15-08-2026",
      "link": "https://upanganwadibharti.in/helper-v2/uploadOrder/ordercopy1784959826.pdf",
      "type": "H",
      "value": 46
    },
    {
      "district": "Meerut",
      "status": "Active",
      "uploadedDate": "23-07-2026",
      "lastDate": "11-08-2026",
      "link": "https://upanganwadibharti.in/helper-v2/uploadOrder/ordercopy1784808567.pdf",
      "type": "H",
      "value": 55
    },
    {
      "district": "Basti",
      "status": "Active",
      "uploadedDate": "22-07-2026",
      "lastDate": "12-08-2026",
      "link": "https://upanganwadibharti.in/helper-v2/uploadOrder/ordercopy1784727231.pdf",
      "type": "H",
      "value": 16
    },
    {
      "district": "Bhadohi",
      "status": "Active",
      "uploadedDate": "21-07-2026",
      "lastDate": "20-08-2026",
      "link": "https://upanganwadibharti.in/helper-v2/uploadOrder/ordercopy1784625623.pdf",
      "type": "H",
      "value": 17
    },
    {
      "district": "Ghaziabad",
      "status": "Active",
      "uploadedDate": "17-07-2026",
      "lastDate": "07-08-2026",
      "link": "https://upanganwadibharti.in/helper-v2/uploadOrder/ordercopy1784281689.pdf",
      "type": "H",
      "value": 30
    },
    {
      "district": "Deoria",
      "status": "Active",
      "uploadedDate": "10-07-2026",
      "lastDate": "31-07-2026",
      "link": "https://upanganwadibharti.in/helper-v2/uploadOrder/ordercopy1783689382.pdf",
      "type": "H",
      "value": 23
    },
    {
      "district": "Mainpuri",
      "status": "Active",
      "uploadedDate": "10-07-2026",
      "lastDate": "30-07-2026",
      "link": "https://upanganwadibharti.in/helper-v2/uploadOrder/ordercopy1783679774.pdf",
      "type": "H",
      "value": 52
    }
  ];// await getDistricts();
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
