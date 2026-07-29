/**
 * Level 0: Fetch district list dynamically from registration page HTML
 * @returns {Promise<Array<{value: string, district: string}>>}
 */
async function getDistricts() {
  const { gotScraping } = await import('got-scraping');
  const response = await gotScraping({
    url: 'https://upanganwadibharti.in/workernew/users/registration.php',
    method: 'GET',
    headerGeneratorOptions: {
      browsers: ['chrome'],
      devices: ['desktop'],
      operatingSystems: ['windows'],
    },
  });
  const options = [];
  const regex = /<option\s+value=['"]?([^'"]*)['"]?>([^<]*)<\/option>/g;
  let match;
  // Match options inside select with name="district" or id="district"
  const districtSelectMatch = response.body.match(/<select[^>]*name=["']district["'][^>]*>([\s\S]*?)<\/select>/i);
  let htmlToParse = districtSelectMatch ? districtSelectMatch[1] : response.body;

  // Remove HTML comments to avoid parsing commented-out options
  htmlToParse = htmlToParse.replace(/<!--[\s\S]*?-->/g, '');

  while ((match = regex.exec(htmlToParse)) !== null) {
    const val = match[1].trim();
    const text = match[2].trim();
    if (val && !isNaN(Number(val))) {
      options.push({ value: Number(val), district: text });
    }
  }
  return options;
}

module.exports = { getDistricts };