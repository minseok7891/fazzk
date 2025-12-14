/**
 * @fileoverview Electron 빌드 파일을 버전 폴더로 이동
 * electron-builder 완료 후 실행됨
 */

const fs = require('fs');
const path = require('path');
const packageJson = require('../package.json');

const version = packageJson.version;
const distDir = path.join(__dirname, '../dist');
const versionDir = path.join(distDir, `v${version}`);

// 버전별 디렉토리 확인/생성
if (!fs.existsSync(versionDir)) {
    fs.mkdirSync(versionDir, { recursive: true });
}

// Electron 앱 파일을 버전 폴더로 이동
function moveElectronApp() {
    const appFiles = [
        `Fazzk Setup ${version}.exe`,
        `Fazzk Setup ${version}.exe.blockmap`,
        'latest.yml'
    ];

    let moved = 0;
    for (const file of appFiles) {
        const src = path.join(distDir, file);
        const dest = path.join(versionDir, file);
        if (fs.existsSync(src)) {
            // 이미 존재하면 삭제 후 이동
            if (fs.existsSync(dest)) {
                fs.unlinkSync(dest);
            }
            fs.renameSync(src, dest);
            console.log(`  ✓ ${file}`);
            moved++;
        }
    }

    if (moved > 0) {
        console.log(`\n✅ ${moved}개 파일을 dist/v${version}/ 폴더로 이동했습니다.`);
    } else {
        console.log('⚠️ 이동할 파일이 없습니다.');
    }
}

console.log(`\n📦 빌드 파일 정리 중...\n`);
moveElectronApp();
