const { app, BrowserWindow, session, ipcMain, Tray, Menu, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const config = require('./config');
const auth = require('./auth');
const chzzk = require('./chzzk');
const server = require('./server');
const updater = require('./updater');
const logger = require('./logger');

let mainWindow;
let tray = null;

/**
 * 브라우저 윈도우 생성 함수
 * @returns {BrowserWindow} 생성된 브라우저 윈도우 인스턴스
 */
function createBrowserWindow() {
    const win = new BrowserWindow({
        width: config.window.width,
        height: config.window.height,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#1a1a1a',
            symbolColor: '#ffffff',
            height: 32
        },
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            sandbox: true,
            preload: config.paths.preload,
            webSecurity: true,
            partition: config.session.partition
        },
        icon: config.paths.icon
    });

    // 메뉴 바 제거
    win.removeMenu();

    // 닫기 버튼 클릭 시 트레이로 최소화
    win.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            win.hide();
        }
    });

    return win;
}

// Start Express Server
server.startServer(async (cookies) => {
    logger.info('[Main] 수동 로그인 쿠키 수신');
    await auth.setManualCookies(cookies);

    if (mainWindow) {
        logger.info('[Main] 알림 페이지로 이동 중...');
        mainWindow.loadURL(`http://localhost:${config.runtimePort || config.port}/pages/notifier.html`);
    }
});

function createWindow() {
    // Navigate to login page
    mainWindow.loadURL(config.api.nidLogin);

    mainWindow.webContents.on('did-finish-load', () => {
        logger.info('[Window] 페이지 로드 완료');
    });

    mainWindow.webContents.on('did-navigate', async (event, url) => {
        logger.info('[Window] 이동됨:', url);

        // Check if we are on Chzzk main page (relaxed check)
        if (url.includes('chzzk.naver.com')) {
            logger.info('[Window] 로그인 성공! 세션 저장 중...');
            await auth.saveSessionData();

            logger.info('[Window] 알림 페이지 로드 중...');
            mainWindow.loadURL(`http://localhost:${config.runtimePort || config.port}/pages/notifier.html`);

            try {
                const profileId = await chzzk.getProfileId();
                logger.info('[Window] 프로필 ID:', profileId);
            } catch (e) {
                logger.error('[Window] 프로필 ID 가져오기 실패:', e);
            }
        }
    });

    // Monitor cookie changes
    session.fromPartition(config.session.partition).cookies.on('changed', async (event, cookie, cause, removed) => {
        if (!removed) {
            if (cookie.name === 'NID_AUT' || cookie.name === 'NID_SES') {
                logger.info('[Cookie] 인증 쿠키 변경됨. 세션 저장 중...');
                await auth.saveSessionData();
            }
        }
    });
}

// IPC Handlers
ipcMain.handle('get-cookies', async (event, domain) => {
    if (domain) return await auth.getCookiesForDomain(domain);
    return await auth.getAllCookies();
});

ipcMain.handle('get-cookies-for-domain', async (event, domain) => {
    return await auth.getCookiesForDomain(domain);
});

ipcMain.handle('clear-session-data', async (event) => {
    auth.clearSessionData();
    chzzk.resetProfileId();
    return true;
});

ipcMain.handle('navigate-to-url', async (event, url) => {
    if (mainWindow) {
        await mainWindow.loadURL(url);
        return true;
    }
    return false;
});

ipcMain.handle('start-login', async (event) => {
    logger.info('[IPC] 로그인 시작 호출됨');
    if (mainWindow) {
        createWindow();
        return true;
    }
    return false;
});

ipcMain.handle('select-audio-file', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }]
    });
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

ipcMain.handle('get-app-config', () => {
    return {
        port: config.runtimePort || config.port
    };
});

// 테마 변경 시 타이틀바 색상 변경
ipcMain.handle('set-theme', (event, isDark) => {
    if (mainWindow) {
        try {
            const currentUrl = mainWindow.webContents.getURL();
            let overlayColor;

            if (currentUrl.includes('notifier.html')) {
                // Notifier 페이지는 항상 녹색 타이틀바 (배너와 일체화)
                overlayColor = '#01E271';
            } else {
                // Start 페이지는 테마에 따라 다름
                overlayColor = isDark ? '#1a1a1a' : '#7261c7';
            }

            mainWindow.setTitleBarOverlay({
                color: overlayColor,
                symbolColor: '#ffffff',
                height: 32
            });
            return true;
        } catch (e) {
            logger.error('[Theme] 타이틀바 색상 변경 실패:', e);
            return false;
        }
    }
    return false;
});

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });

    // App Lifecycle
    app.whenReady().then(async () => {
        logger.info('[App] 준비 완료');

        // Use the persistent session
        const appSession = session.fromPartition(config.session.partition);
        await appSession.cookies.flushStore();

        // 브라우저 윈도우 생성
        mainWindow = createBrowserWindow();

        // 업데이터 초기화 및 자동 업데이트 확인
        updater.initUpdater(mainWindow);
        setTimeout(() => {
            updater.checkForUpdates();
        }, 3000); // 앱 시작 3초 후 업데이트 확인

        // 새로고침 단축키 등록 (F5, Ctrl+R)
        globalShortcut.register('F5', () => {
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.reload();
            }
        });
        globalShortcut.register('CommandOrControl+R', () => {
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.reload();
            }
        });

        // Start at the start page or notifier if logged in
        const sessionLoaded = await auth.loadSessionData();
        let loaded = false;

        if (sessionLoaded) {
            try {
                logger.info('[App] 세션 검증 중...');
                const profileId = await chzzk.getProfileId();
                logger.info('[App] 세션 유효. 프로필:', profileId);
                mainWindow.loadURL(`http://localhost:${config.runtimePort || config.port}/pages/notifier.html`);
                loaded = true;

                // 세션 모니터 시작
                auth.startSessionMonitor(() => {
                    // 만료 임박 시 렌더러에 알림
                    mainWindow.webContents.send('session-expiring-soon');
                });

                // 세션 자동 갱신 시작
                auth.startAutoRefresh((errorMsg) => {
                    // 갱신 실패 시 렌더러에 알림
                    mainWindow.webContents.send('session-refresh-failed', errorMsg);
                });
            } catch (e) {
                logger.error('[App] 세션 유효하지 않거나 만료됨:', e.message);
                // Session cleared in chzzk.js if 401/403
            }
        }

        if (!loaded) {
            logger.info('[App] 유효한 세션 없음, 시작 페이지 로드');
            mainWindow.loadURL(`http://localhost:${config.runtimePort || config.port}/pages/start.html`);
        }

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                mainWindow = createBrowserWindow();
                mainWindow.loadURL(`http://localhost:${config.runtimePort || config.port}/pages/start.html`);
            }
        });

        // Tray
        const icon = nativeImage.createFromPath(config.paths.icon);
        tray = new Tray(icon);
        const contextMenu = Menu.buildFromTemplate([
            {
                label: '알림 보기',
                click: () => {
                    if (mainWindow) {
                        mainWindow.show();
                        mainWindow.focus();
                    }
                }
            },
            {
                label: '업데이트 확인',
                click: () => {
                    updater.checkForUpdates();
                }
            },
            { type: 'separator' },
            {
                label: '종료',
                click: () => {
                    app.isQuitting = true;
                    app.quit();
                }
            }
        ]);

        tray.setToolTip('Fazzk');
        tray.setContextMenu(contextMenu);

        tray.on('click', () => {
            if (mainWindow) {
                if (mainWindow.isVisible()) {
                    mainWindow.hide();
                } else {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    app.on('will-quit', () => {
        // 앱 종료 시 단축키 해제
        globalShortcut.unregisterAll();
    });
}