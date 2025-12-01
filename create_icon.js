const Jimp = require('jimp');

async function createIcon() {
    const size = 512;
    // Create new image with dark background
    const image = new Jimp(size, size, '#1e1e1e');

    const font = await Jimp.loadFont(Jimp.FONT_SANS_128_WHITE);

    const textImage = new Jimp(size, size, 0x00000000);

    // Calculate center
    const text = 'F';
    const textWidth = Jimp.measureText(font, text);
    const textHeight = Jimp.measureTextHeight(font, text, size);

    textImage.print(
        font,
        (size - textWidth) / 2,
        (size - textHeight) / 2,
        text
    );

    // Colorize text to Neon Green (#00ffa3)
    textImage.scan(0, 0, size, size, function (x, y, idx) {
        const a = this.bitmap.data[idx + 3];
        if (a > 0) {
            this.bitmap.data[idx + 0] = 0x00; // R
            this.bitmap.data[idx + 1] = 0xff; // G
            this.bitmap.data[idx + 2] = 0xa3; // B
        }
    });

    // Add a border (optional, let's keep it simple for now)

    image.composite(textImage, 0, 0);

    // Save
    await image.writeAsync('public/fazzk_icon.png');
    console.log('Icon created: public/fazzk_icon.png');
}

createIcon().catch(console.error);
