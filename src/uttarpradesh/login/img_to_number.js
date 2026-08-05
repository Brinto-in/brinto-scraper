const Tesseract = require('tesseract.js');
const path = require('path');

/**
 * Reads a captcha image and extracts the numeric text from it using OCR.
 *
 * @param {string|Buffer} imageInput - Either an absolute file path to the image,
 *                                      or a Buffer containing the image data.
 * @returns {Promise<string>} The extracted numeric string (digits only).
 */
async function solveCaptcha(imageInput) {
    const { data: { text } } = await Tesseract.recognize(imageInput, 'eng', {
        // Restrict to digits only for better accuracy on numeric captchas
        tessedit_char_whitelist: '0123456789',
    });

    // Strip any whitespace / newlines that Tesseract may add
    const digits = text.replace(/\D/g, '').trim();
    return digits;
}

// Allow running standalone for quick testing: node img_to_number.js [path]
if (require.main === module) {
    const imgPath = process.argv[2] || path.join(__dirname, 'captcha.png');
    console.log(`Solving captcha from: ${imgPath}`);
    solveCaptcha(imgPath)
        .then(code => console.log(`Detected code: ${code}`))
        .catch(err => console.error('Error:', err));
}

module.exports = { solveCaptcha };
