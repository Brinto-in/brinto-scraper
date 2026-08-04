const { CronJob } = require("cron");
const { main: runOdishaScraper } = require("../odisha/scraper");

const job = new CronJob("0 0 */3 * * *", async () => {
    console.log("Running Odisha scraper cron job...");
    try {
        await runOdishaScraper();
    } catch (err) {
        console.error("Odisha scraper cron job failed:", err);
    }
});

job.start();

console.log("Odisha scraper cron job started.");