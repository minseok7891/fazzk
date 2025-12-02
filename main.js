const { app, BrowserWindow, session, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const config = require('./config');
const auth = require('./auth');
const chzzk = require('./chzzk');
const server = require('./server');

let mainWindow;
let tray = null;

// Start Express Server
server.startServer();

function createWindow() {
    // Navigate to login page
    mainWindow.loadURL(config.api.nidLogin);

    mainWindow.webContents.on('did-finish-load', () => {
        console.log('[Window] Page load finished');
    });

    mainWindow.webContents.on('did-navigate', async (event, url) => {
        console.log('[Window] Navigated to:', url);

        // Check if we are on Chzzk main page (relaxed check)
        if (url.includes('chzzk.naver.com')) {
            console.log('[Window] Login success detected! Saving session...');
            await auth.saveSessionData();

            console.log('[Window] Loading notifier page...');
            mainWindow.loadURL(`http://localhost:${config.runtimePort || config.port}/pages/notifier.html`);

            try {
                const profileId = await chzzk.getProfileId();
                console.log('[Window] Profile ID:', profileId);
            } catch (e) {
                console.error('[Window] Failed to get profile ID:', e);
            }
        }
    });

    // Monitor cookie changes
    session.fromPartition('persist:chzzk').cookies.on('changed', async (event, cookie, cause, removed) => {
        if (!removed) {
            if (cookie.name === 'NID_AUT' || cookie.name === 'NID_SES') {
                console.log('[Cookie] Auth cookie changed. Saving session...');
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
    console.log('[IPC] start-login called');
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

// App Lifecycle
app.whenReady().then(async () => {
    console.log('[App] Ready');

    // Use the persistent session
    const appSession = session.fromPartition('persist:chzzk');
    await appSession.cookies.flushStore();



    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            sandbox: true,
            preload: config.paths.preload,
            webSecurity: true,
            partition: 'persist:chzzk' // Ensure persistent session storage
        },
        icon: config.paths.icon
    });

    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    // Start at the start page or notifier if logged in
    const sessionLoaded = await auth.loadSessionData();
    let loaded = false;

    if (sessionLoaded) {
        try {
            console.log('[App] Validating session...');
            const profileId = await chzzk.getProfileId();
            console.log('[App] Session valid. Profile:', profileId);
            mainWindow.loadURL(`http://localhost:${config.runtimePort || config.port}/pages/notifier.html`);
            loaded = true;
        } catch (e) {
            console.error('[App] Session invalid or expired:', e.message);
            // Session cleared in chzzk.js if 401/403
        }
    }

    if (!loaded) {
        console.log('[App] No valid session, loading start page.');
        mainWindow.loadURL(`http://localhost:${config.runtimePort || config.port}/pages/start.html`);
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            // Re-create window logic if needed, for now just basic
            mainWindow = new BrowserWindow({
                width: 1024,
                height: 768,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    enableRemoteModule: false,
                    sandbox: true,
                    preload: config.paths.preload,
                    webSecurity: true
                },
                icon: config.paths.icon
            });
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