const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

const url = 'https://mis.tgwdcw.in/Default.aspx';
const baseUrl = 'https://mis.tgwdcw.in/';
const stateFilePath = path.join(__dirname, 'latest_state.json');

async function scrapeNotifications() {
    try {
        // Fetch HTML content from the URL
        const { data: html } = await axios.get(url);

        // Load HTML into cheerio
        const $ = cheerio.load(html);

        const notifications = [];

        // Find the table with the notifications.
        // The selector targets the table that is a direct child of a div with align="center".
        const tableRows = $('div[align="center"] > table > tbody > tr');

        // Iterate over each row, skipping the two header rows
        tableRows.slice(2).each((index, element) => {
            const columns = $(element).find('td');

            // Helper to get text from a column
            const getText = (colIndex) => $(columns[colIndex]).text().trim();

            // Helper to get a URL from a link in a column
            const getUrl = (colIndex) => {
                const link = $(columns[colIndex]).find('a').attr('href');
                // If the link is just a directory, it's not a valid file link.
                if (link && !link.endsWith('/')) {
                    // Use URL constructor for robustly joining paths
                    return new URL(link, baseUrl).href;
                }
                return null;
            };

            const notification = {
                s_no: parseInt(getText(0), 10),
                district: getText(1),
                status: getText(2),
                startDate: getText(3) || null,
                closingDate: getText(4) || null,
                vacanciesUrl: getUrl(5),
                notificationUrl: getUrl(6),
            };

            if (notification.status === 'Opened') {
                notifications.push(notification);
            }
        });

        return notifications;

    } catch (error) {
        console.error('Error scraping notifications:', error);
        return null;
    }
}

function compareNotifications(oldNotifs, newNotifs) {
    const changes = {
        added: [],
        removed: [],
        updated: [],
    };

    const oldMap = new Map(oldNotifs.map(n => [n.s_no, n]));
    const newMap = new Map(newNotifs.map(n => [n.s_no, n]));

    // Check for added or updated notifications
    for (const [s_no, newNotification] of newMap.entries()) {
        if (!oldMap.has(s_no)) {
            changes.added.push(newNotification);
        } else {
            const oldNotification = oldMap.get(s_no);
            // Simple string comparison to detect any change in the object
            if (JSON.stringify(oldNotification) !== JSON.stringify(newNotification)) {
                changes.updated.push({
                    before: oldNotification,
                    after: newNotification,
                });
            }
        }
    }

    // Check for removed notifications
    for (const [s_no, oldNotification] of oldMap.entries()) {
        if (!newMap.has(s_no)) {
            changes.removed.push(oldNotification);
        }
    }

    return changes;
}

async function main() {
    console.log('Scraping notifications...');
    const newNotifications = await scrapeNotifications();

    if (!newNotifications) {
        console.log('Scraping failed, cannot check for changes.');
        return;
    }

    let previousNotifications = [];
    try {
        const previousState = await fs.readFile(stateFilePath, 'utf-8');
        previousNotifications = JSON.parse(previousState);
        console.log(`Loaded ${previousNotifications.length} notifications from the last run.`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('No previous state file found. This must be the first run.');
        } else {
            console.error('Error reading previous state file:', error);
        }
    }

    const changes = compareNotifications(previousNotifications, newNotifications);

    if (changes.added.length === 0 && changes.removed.length === 0 && changes.updated.length === 0) {
        console.log('No changes detected since the last run.');
    } else {
        console.log('\n--- Changes Detected ---');
        if (changes.added.length > 0) {
            console.log(`\n[+] ${changes.added.length} Added Notifications:`);
            console.log(JSON.stringify(changes.added, null, 2));
        }
        if (changes.removed.length > 0) {
            console.log(`\n[-] ${changes.removed.length} Removed Notifications:`);
            console.log(JSON.stringify(changes.removed, null, 2));
        }
        if (changes.updated.length > 0) {
            console.log(`\n[*] ${changes.updated.length} Updated Notifications:`);
            console.log(JSON.stringify(changes.updated, null, 2));
        }
        console.log('------------------------\n');
    }

    try {
        await fs.writeFile(stateFilePath, JSON.stringify(newNotifications, null, 2), 'utf-8');
        console.log(`Successfully updated the state file at: ${stateFilePath}`);
    } catch (error) {
        console.error('Error saving current state to file:', error);
    }
}

main();
