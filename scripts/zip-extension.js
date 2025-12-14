const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const packageJson = require('../package.json');

const version = packageJson.version;
const versionDir = path.join(__dirname, `../dist/v${version}`);
const extensionDir = path.join(__dirname, '../chrome_extension');

// 버전별 디렉토리 확인/생성
if (!fs.existsSync(versionDir)) {
    fs.mkdirSync(versionDir, { recursive: true });
}

// Chrome 확장프로그램 zip 생성
function buildChromeExtension() {
    return new Promise((resolve, reject) => {
        const outputFilename = 'chrome-extension.zip';
        const outputPath = path.join(versionDir, outputFilename);

        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', function () {
            console.log(`✅ Chrome 확장프로그램: ${outputFilename} (${archive.pointer()} bytes)`);
            resolve();
        });

        archive.on('error', reject);
        archive.pipe(output);

        // chrome_extension 폴더 내용 추가 (Firefox manifest 제외)
        const files = fs.readdirSync(extensionDir);
        for (const file of files) {
            if (file === 'manifest.firefox.json') continue;

            const filePath = path.join(extensionDir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                archive.directory(filePath, file);
            } else {
                archive.file(filePath, { name: file });
            }
        }

        archive.finalize();
    });
}

// Firefox 확장프로그램 zip 생성
function buildFirefoxExtension() {
    return new Promise((resolve, reject) => {
        const outputFilename = 'firefox-extension.zip';
        const outputPath = path.join(versionDir, outputFilename);

        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', function () {
            console.log(`✅ Firefox 확장프로그램: ${outputFilename} (${archive.pointer()} bytes)`);
            resolve();
        });

        archive.on('error', reject);
        archive.pipe(output);

        // chrome_extension 폴더 내용 추가
        const files = fs.readdirSync(extensionDir);
        for (const file of files) {
            // Chrome manifest 대신 Firefox manifest 사용
            if (file === 'manifest.json') continue;
            if (file === 'manifest.firefox.json') {
                // Firefox manifest를 manifest.json으로 이름 변경하여 추가
                archive.file(path.join(extensionDir, file), { name: 'manifest.json' });
                continue;
            }

            const filePath = path.join(extensionDir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                archive.directory(filePath, file);
            } else {
                archive.file(filePath, { name: file });
            }
        }

        archive.finalize();
    });
}

// 빌드 실행
async function build() {
    console.log(`🔧 v${version} 빌드 시작...\n`);
    console.log(`📁 출력 폴더: dist/v${version}/\n`);
    await buildChromeExtension();
    await buildFirefoxExtension();

    console.log('\n✨ 빌드 완료!');
}

build().catch(err => {
    console.error('빌드 오류:', err);
    process.exit(1);
});
