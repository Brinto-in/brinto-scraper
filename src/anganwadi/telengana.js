const { CronJob } = require("cron");
const { main: runTelanganaScraper } = require("../telengana/scrapurl");

const job = new CronJob("0 0 */3 * * *", async () => {
    console.log("Running Telangana scraper cron job...");
    try {
        await runTelanganaScraper();
    } catch (err) {
        console.error("Telangana scraper cron job failed:", err);
    }
});

job.start();

console.log("Telangana scraper cron job started.");