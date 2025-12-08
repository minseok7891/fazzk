/**
 * GitHub API 기반 업데이터 모듈
 * electron-updater 대신 GitHub API로 직접 버전 확인
 */
const { ipcMain, shell } = require('electron');
const https = require('https');
const { version } = require('./package.json');
const logger = require('./logger');

const GITHUB_OWNER = 'minseok7891';
const GITHUB_REPO = 'fazzk';

let mainWindow = null;

/**
 * 업데이터 초기화
 */
function initUpdater(win) {
    mainWindow = win;
}

/**
 * GitHub에서 최신 릴리즈 정보 가져오기
 */
function getLatestRelease() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
            method: 'GET',
            headers: {
                'User-Agent': 'Fazzk-Updater',
                'Accept': 'application/vnd.github.v3+json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const release = JSON.parse(data);
                    resolve(release);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

/**
 * 버전 비교 (semver)
 */
function compareVersions(v1, v2) {
    const parts1 = v1.replace('v', '').split('.').map(Number);
    const parts2 = v2.replace('v', '').split('.').map(Number);

    for (let i = 0; i < 3; i++) {
        if (parts1[i] > parts2[i]) return 1;
        if (parts1[i] < parts2[i]) return -1;
    }
    return 0;
}

/**
 * 업데이트 확인
 */
async function checkForUpdates() {
    try {
        const release = await getLatestRelease();
        const latestVersion = release.tag_name;
        const currentVersion = `v${version}`;

        if (compareVersions(latestVersion, currentVersion) > 0) {
            // 새 버전 있음
            const exeAsset = release.assets.find(a => a.name.endsWith('.exe'));

            if (mainWindow) {
                mainWindow.webContents.send('update-available-github', {
                    currentVersion: currentVersion,
                    latestVersion: latestVersion,
                    releaseNotes: release.body || '',
                    downloadUrl: exeAsset ? exeAsset.browser_download_url : release.html_url,
                    releaseUrl: release.html_url,
                    publishedAt: release.published_at
                });
            }

            return {
                hasUpdate: true,
                latestVersion,
                downloadUrl: exeAsset ? exeAsset.browser_download_url : release.html_url
            };
        }

        return { hasUpdate: false };
    } catch (error) {
        logger.error('[Updater] 업데이트 확인 실패:', error.message);
        return { hasUpdate: false, error: error.message };
    }
}

/**
 * 다운로드 페이지 열기
 */
function openDownloadPage(url) {
    shell.openExternal(url);
}

// IPC 핸들러
ipcMain.handle('check-for-updates', async () => {
    return await checkForUpdates();
});

ipcMain.handle('open-download-page', (_, url) => {
    openDownloadPage(url);
});

module.exports = {
    initUpdater,
    checkForUpdates
};
