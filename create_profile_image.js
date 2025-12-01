const Jimp = require('jimp');

async function createProfileImage() {
    const size = 512;
    // Create new image with black background (as seen in OBS screenshot)
    const image = new Jimp(size, size, '#000000');

    const font = await Jimp.loadFont(Jimp.FONT_SANS_128_WHITE);

    const textImage = new Jimp(size, size, 0x00000000);

    // Calculate center
    const text = 'Z'; // stylized Z for Chzzk
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

    image.composite(textImage, 0, 0);

    // Save
    await image.writeAsync('public/default_profile.png');
    console.log('Profile image created: public/default_profile.png');
}

createProfileImage().catch(console.error);
