const { CronJob } = require("cron");

async function myTask() {
    console.log("Running task...");
    // Your logic here
}

const job = new CronJob("0 0 */3 * * *", async () => {
    try {
        await myTask();
    } catch (err) {
        console.error("Cron job failed:", err);
    }
});

job.start();

console.log("MyTask cron started.");