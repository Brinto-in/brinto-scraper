import Tesseract from 'tesseract.js';

export async function solveImage(
    imageInput: string | Buffer
): Promise<string> {
    const {
        data: { text }
    } = await Tesseract.recognize(
        imageInput,
        'eng'
    );

    return text.replace(/\D/g, '').trim();
}