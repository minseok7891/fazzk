import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { open as openShell } from '@tauri-apps/plugin-shell';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
// import { Store } from '@tauri-apps/plugin-store'; // If needed for client-side store, but server handles settings.

const isTauri = !!(window.__TAURI_INTERNALS__ || window.__TAURI__); // Simple check

export const api = {
    isTauri,

    // === Cookies / Session ===
    getCookies: async () => {
        if (!isTauri) return [];
        try { return await invoke('get_cookies'); }
        catch (e) { console.error('getCookies failed', e); return []; }
    },
    getServerPort: async () => {
        if (!isTauri) return 3000;
        try { return await invoke('get_server_port'); }
        catch (e) { console.error('getServerPort failed', e); return 3000; }
    },
    getAppVersion: async () => {
        if (!isTauri) return '2.5.1'; // 현재 버전으로 업데이트
        try { return await invoke('get_app_version'); }
        catch (e) { console.error('getAppVersion failed', e); return '2.5.1'; }
    },
    manualLogin: async (nidAut, nidSes) => {
        if (!isTauri) throw new Error('Manual login not available in browser mode');
        try {
            await invoke('manual_login', { nidAut, nidSes });
            return true;
        } catch (e) {
            console.error('manualLogin failed', e);
            throw e;
        }
    },

    // === Settings & Files ===
    selectAudioFile: async () => {
        if (!isTauri) {
            console.warn('File selection not available in browser mode');
            return null;
        }
        try {
            const selected = await openDialog({
                multiple: false,
                filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }]
            });
            return selected;
        } catch (e) {
            console.error('selectAudioFile failed', e);
            return null;
        }
    },
    convertFileSrc: (path) => {
        if (!isTauri) return path;
        try {
            return convertFileSrc(path);
        } catch (e) {
            console.error('convertFileSrc failed', e);
            return path;
        }
    },

    // === Window Controls ===
    minimize: async () => {
        if (!isTauri) return;
        try { await getCurrentWindow().minimize(); } catch (e) { console.error(e); }
    },
    toggleMaximize: async () => {
        if (!isTauri) return;
        try {
            const win = getCurrentWindow();
            const isMaximized = await win.isMaximized();
            if (isMaximized) await win.unmaximize();
            else await win.maximize();
        } catch (e) { console.error(e); }
    },
    close: async () => {
        if (!isTauri) return;
        try { await getCurrentWindow().close(); } catch (e) { console.error(e); }
    },

    // === Events ===
    listen: (event, callback) => {
        if (!isTauri) {
            console.warn('Event listening not available in browser mode');
            return Promise.resolve(() => {});
        }
        return listen(event, callback);
    },

    // === Theme ===
    setTheme: async (isDark) => {
        if (!isTauri) {
            console.log('Theme setting not available in browser mode');
            return;
        }
        try {
            await invoke('set_theme', { isDark });
        } catch (e) {
            console.error('setTheme failed', e);
        }
    },

    // === Updates ===
    checkForUpdates: async () => {
        if (!isTauri) return { has_update: false, error: 'Not available in browser mode' };
        try { return await invoke('check_for_updates'); }
        catch (e) { return { has_update: false, error: e.toString() }; }
    },
    openDownloadPage: async (url) => {
        if (!isTauri) {
            window.open(url, '_blank');
            return;
        }
        try { await invoke('open_download_page', { url }); }
        catch (e) { console.error(e); }
    },
    downloadUpdate: async (url) => {
        if (!isTauri) throw new Error('Update download not available in browser mode');
        try { await invoke('download_and_install_update', { url }); }
        catch (e) { throw e; }
    },
    onUpdateProgress: (callback) => {
        if (!isTauri) return Promise.resolve(() => {});
        return listen('update-download-progress', callback);
    },

    // === Tauri Invoke ===
    invoke: (command, args) => {
        if (!isTauri) {
            console.warn(`Invoke command '${command}' not available in browser mode`);
            return Promise.reject(new Error('Not available in browser mode'));
        }
        return invoke(command, args);
    }
};
