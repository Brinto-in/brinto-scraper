/**
 * Splits the anganwadi option text, e.g.:
 *   "MORCHA(09138010333)-सामान्य (अनारक्षित)"
 * into:
 *   { center_name: "MORCHA", center_code: "09138010333", reservation: "सामान्य (अनारक्षित)" }
 *
 * Falls back gracefully if the text doesn't match the expected pattern.
 */
function parseCenterText(raw) {
  const match = raw.match(/^(.*?)\((\d+)\)-(.*)$/);
  if (match) {
    return {
      center_name: match[1].trim(),
      center_code: match[2].trim(),
      reservation: match[3].trim(),
    };
  }
  return { center_name: raw.trim(), center_code: null, reservation: null };
}

module.exports = { parseCenterText };
