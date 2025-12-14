/**
 * Firefox 소스 코드 패키지 생성 스크립트
 * archiver를 사용하여 올바른 경로 구분자로 zip 생성
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const sourceDir = path.join(__dirname, '../firefox-extension-source');
const outputDir = path.join(__dirname, '../dist');
const outputPath = path.join(outputDir, 'fazzk-firefox-source.zip');

// dist 폴더 생성
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const output = fs.createWriteStream(outputPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', function () {
    console.log(`✅ Firefox 소스 코드 패키지: fazzk-firefox-source.zip (${archive.pointer()} bytes)`);
});

archive.on('error', function (err) {
    throw err;
});

archive.pipe(output);

// firefox-extension-source 폴더 전체 추가
archive.directory(sourceDir, false);

archive.finalize();
