/**
 * Parses `<option value="X">Label</option>` fragments into [{value, text}, ...].
 * Skips the placeholder blank option (value="").
 * Decodes common HTML entities that may appear in Hindi labels.
 */
function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function parseOptions(html) {
  const options = [];
  const regex = /<option\s+value="([^"]*)">([^<]*)<\/option>/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const value = decodeEntities(match[1]);
    const text = decodeEntities(match[2]);
    if (value === '') continue; // skip "please select" placeholder
    options.push({ value, text });
  }
  return options;
}

module.exports = { parseOptions };
