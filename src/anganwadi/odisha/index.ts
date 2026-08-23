import { scrapeOdishaAnganwadi } from "./scraper.js";


export async function runOdishaAnganwadi(): Promise<void> {

    const records =
        await scrapeOdishaAnganwadi();

    console.log(
        "\n========== ODISHA ANGANWADI DATA ==========\n"
    );

    // console.log(
    //     JSON.stringify(
    //         records,
    //         null,
    //         2
    //     )
    // );

    console.log(
        "\n============================================"
    );
}