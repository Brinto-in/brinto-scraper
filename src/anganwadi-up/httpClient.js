const { gotScraping } = require('got-scraping');

/**
 * A pre-configured HTTP client for scraping, using got-scraping.
 * It mimics browser headers to avoid being blocked (e.g., 403 Forbidden errors).
 */
const httpClient = gotScraping.extend({
    // got-scraping automatically uses realistic browser-like headers and manages TLS fingerprints.
    // We can override or add headers here if needed.
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'max-age=0',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
    },
    // You can add other got-scraping options here, like retry logic.
});

module.exports = httpClient;