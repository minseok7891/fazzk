const Jimp = require('jimp');

async function cropIcon() {
    try {
        const image = await Jimp.read('temp_icon_source.png');
        const width = image.bitmap.width;
        const height = image.bitmap.height;

        let minX = width, minY = height, maxX = 0, maxY = 0;
        let found = false;

        // Scan for neon green color (approx #00ffa3)
        // RGB: 0, 255, 163
        image.scan(0, 0, width, height, function (x, y, idx) {
            const r = this.bitmap.data[idx + 0];
            const g = this.bitmap.data[idx + 1];
            const b = this.bitmap.data[idx + 2];

            // Tolerance check
            if (r < 50 && g > 200 && b > 130 && b < 200) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                found = true;
            }
        });

        if (found) {
            // Add some padding
            const padding = 20;
            minX = Math.max(0, minX - padding);
            minY = Math.max(0, minY - padding);
            maxX = Math.min(width, maxX + padding);
            maxY = Math.min(height, maxY + padding);

            const cropWidth = maxX - minX;
            const cropHeight = maxY - minY;

            // Make it square
            const size = Math.max(cropWidth, cropHeight);
            const centerX = minX + cropWidth / 2;
            const centerY = minY + cropHeight / 2;

            let cropX = centerX - size / 2;
            let cropY = centerY - size / 2;

            // Boundary checks
            if (cropX < 0) cropX = 0;
            if (cropY < 0) cropY = 0;

            console.log(`Cropping at ${cropX}, ${cropY}, size ${size}`);

            image.crop(cropX, cropY, size, size);
            await image.writeAsync('public/default_profile.png');
            console.log('Icon cropped and saved to public/default_profile.png');
        } else {
            console.log('Green logo not found, cropping center top');
            // Fallback: Crop center top square
            const size = Math.min(width, height) / 2;
            image.crop((width - size) / 2, height * 0.1, size, size);
            await image.writeAsync('public/default_profile.png');
        }

    } catch (err) {
        console.error(err);
    }
}

cropIcon();
