
const { BASE_URL, MAX_RETRIES, RETRY_BACKOFF_MS } = require('./config');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function looksLikeChallenge(body) {
  if (!body) return true;
  return (
    body.includes('Just a moment') ||
    body.includes('cf_chl_opt') ||
    body.includes('challenges.cloudflare.com')
  );
}

/**
 * POSTs form-encoded data to the ajax endpoint, retrying on network errors
 * or Cloudflare challenge pages with exponential backoff.
 * @param {Object} form - key/value pairs to send as x-www-form-urlencoded body
 * @returns {Promise<string>} raw HTML/text response body
 */
async function postForm(form) {
  const { gotScraping } = await import('got-scraping');
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await gotScraping({
        url: BASE_URL,
        method: 'POST',
        headerGeneratorOptions: {
          browsers: ['chrome'],
          devices: ['desktop'],
          operatingSystems: ['windows'],
        },
        headers: {
          'x-requested-with': 'XMLHttpRequest',
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        form,
        timeout: { request: 20000 },
      });

      if (response.statusCode === 200 && !looksLikeChallenge(response.body)) {
        return response.body;
      }

      lastError = new Error(
        `Unexpected response (status ${response.statusCode}${looksLikeChallenge(response.body) ? ', Cloudflare challenge detected' : ''
        })`
      );
    } catch (err) {
      lastError = err;
    }

    const backoff = RETRY_BACKOFF_MS * attempt;
    console.warn(
      `  [retry ${attempt}/${MAX_RETRIES}] ${JSON.stringify(form)} -> ${lastError.message}. Waiting ${backoff}ms...`
    );
    await sleep(backoff);
  }

  throw new Error(`Failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

module.exports = { postForm, sleep };
