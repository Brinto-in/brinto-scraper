const fs = require('fs/promises');
const path = require('path');
const { setupDatabase, insertRecords } = require('./db-configs/turso.db.js');

/**
 * Main function to run the insertion process.
 */
async function main() {
    try {
        // 1. Set up the database table
        await setupDatabase();

        // 2. Read the JSON data file
        const jsonFilePath = path.join(__dirname, 'anganwadi-up', 'output', 'anganwadis-up.json');
        console.log(`Reading data from ${jsonFilePath}...`);
        const fileContent = await fs.readFile(jsonFilePath, 'utf-8');
        const records = JSON.parse(fileContent);

        // 3. Insert the records into the database
        await insertRecords(records);

        console.log('Database insertion process completed successfully.');
    } catch (error) {
        console.error('An error occurred during the insertion process:', error);
        process.exit(1); // Exit with an error code
    }
}

// Run the main function
main();