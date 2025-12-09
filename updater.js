/**
 * @fileoverview GitHub API 기반 자동 업데이트 모듈
 * electron-updater 대신 GitHub API로 직접 버전 확인
 * @module updater
 */

const { ipcMain, shell } = require('electron');
const https = require('https');
const { version } = require('./package.json');
const logger = require('./logger');

/** @type {string} GitHub 저장소 소유자 */
const GITHUB_OWNER = 'minseok7891';

/** @type {string} GitHub 저장소 이름 */
const GITHUB_REPO = 'fazzk';

/**
 * 메인 윈도우 참조
 * @type {Electron.BrowserWindow|null}
 */
let mainWindow = null;

/**
 * 업데이터 초기화
 * @param {Electron.BrowserWindow} win - 메인 윈도우 인스턴스
 * @returns {void}
 */
function initUpdater(win) {
    mainWindow = win;
}

/**
 * GitHub에서 최신 릴리즈 정보 가져오기
 * @async
 * @returns {Promise<Object>} GitHub 릴리즈 객체
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
 * Semantic Version 비교
 * @param {string} v1 - 첫 번째 버전 (예: "v1.2.3")
 * @param {string} v2 - 두 번째 버전 (예: "v1.2.4")
 * @returns {number} v1 > v2이면 1, v1 < v2이면 -1, 같으면 0
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
 * @typedef {Object} UpdateCheckResult
 * @property {boolean} hasUpdate - 업데이트 가능 여부
 * @property {string} [latestVersion] - 최신 버전 (업데이트 있을 시)
 * @property {string} [downloadUrl] - 다운로드 URL (업데이트 있을 시)
 * @property {string} [error] - 에러 메시지 (실패 시)
 */

/**
 * 업데이트 확인
 * @async
 * @returns {Promise<UpdateCheckResult>} 업데이트 확인 결과
 */
async function checkForUpdates() {
    try {
        const release = await getLatestRelease();
        const latestVersion = release.tag_name;
        const currentVersion = `v${version}`;

        if (compareVersions(latestVersion, currentVersion) > 0) {
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

        // 업데이트 없음 - 최신 버전 사용 중 알림
        if (mainWindow) {
            mainWindow.webContents.send('update-check-complete', {
                hasUpdate: false,
                currentVersion: currentVersion
            });
        }

        return { hasUpdate: false };
    } catch (error) {
        logger.error('[Updater] 업데이트 확인 실패:', error.message);

        // 렌더러에 에러 알림 전송
        if (mainWindow) {
            mainWindow.webContents.send('update-check-failed', {
                error: error.message,
                errorCode: error.code || 'UNKNOWN'
            });
        }

        return { hasUpdate: false, error: error.message };
    }
}

/**
 * 외부 브라우저에서 다운로드 페이지 열기
 * @param {string} url - 열 URL
 * @returns {void}
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
