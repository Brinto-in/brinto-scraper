module.exports = {
  BASE_URL: 'https://upanganwadibharti.in/workernew/ajax.php',
  PAGE_URL: 'https://upanganwadibharti.in/workernew/users/step-1.php',

  // Delay (ms) between consecutive requests, to avoid hammering the server
  // and reduce the chance of tripping Cloudflare bot detection.
  REQUEST_DELAY_MS: 400,

  // How many times to retry a request if it fails or gets a Cloudflare challenge.
  MAX_RETRIES: 4,

  // Base backoff (ms) for retries - doubles each attempt.
  RETRY_BACKOFF_MS: 2000,

  // UR = ward category filter on the final anganwadi lookup step.
  // From the sample traffic, UR=2 was used. The meaning isn't documented
  // by the portal, so we try a small set of values and de-duplicate results
  // by anganwadi ID. Adjust this list if you learn the exact meaning.
  UR_VALUES: ['1', '2'],

  STATE_NAME: 'Uttar Pradesh',

  // Output path - flat JSON array, one object per anganwadi centre,
  // shaped to match the anganwadi_centres table.
  OUTPUT_JSON: require('path').join(__dirname, '../output/anganwadis-up.json'),
};
