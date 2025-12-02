const { session } = require('electron');
const Store = require('electron-store');
const fs = require('fs');
const config = require('./config');

const store = new Store({
    name: 'session',
    encryptionKey: config.auth.encryptionKey
});

async function saveSessionData() {
    const userDataPath = config.paths.userData;

    console.log('[Auth] Saving session data...');

    try {
        if (!fs.existsSync(userDataPath)) {
            fs.mkdirSync(userDataPath, { recursive: true });
        }
        fs.accessSync(userDataPath, fs.constants.W_OK);

        const currentSession = session.fromPartition('persist:chzzk');
        const cookies = await currentSession.cookies.get({});

        if (cookies.length === 0) {
            console.warn('[Auth] No cookies to save.');
        } else {
            const naverAuthCookies = cookies.filter(c => c.name === 'NID_AUT' || c.name === 'NID_SES');
            if (naverAuthCookies.length > 0) {
                console.log(`[Auth] Found ${naverAuthCookies.length} Naver auth cookies.`);
            }
        }

        const sessionData = {
            cookies,
            savedAt: new Date().toISOString()
        };

        store.set('session', sessionData);
        console.log('[Auth] Session data saved securely.');
    } catch (error) {
        console.error('[Auth] Failed to save session data:', error);
    }
}

async function loadSessionData() {
    console.log('[Auth] Loading session data...');

    try {
        if (!store.has('session')) {
            console.log('[Auth] No saved session data found.');
            return false;
        }

        const sessionData = store.get('session');

        if (!sessionData.cookies || !Array.isArray(sessionData.cookies)) {
            console.error('[Auth] Invalid session data format.');
            clearSessionData();
            return false;
        }

        const now = Date.now() / 1000;
        const hasExpiredCookies = sessionData.cookies.some(cookie => {
            return cookie.expirationDate && cookie.expirationDate < now;
        });

        if (hasExpiredCookies) {
            console.log('[Auth] Found expired cookies. Clearing session.');
            clearSessionData();
            return false;
        }

        // Filter out invalid cookies instead of clearing everything
        const validCookies = sessionData.cookies.filter(cookie => {
            return config.auth.allowedDomains.some(domain => {
                if (domain.startsWith('.')) {
                    return cookie.domain.endsWith(domain) || cookie.domain === domain.substring(1);
                }
                return cookie.domain === domain;
            });
        });

        if (validCookies.length < sessionData.cookies.length) {
            console.log(`[Auth] Filtered out ${sessionData.cookies.length - validCookies.length} invalid domain cookies.`);
        }

        const currentSession = session.fromPartition('persist:chzzk');
        let successCount = 0;

        for (const cookie of validCookies) {
            if (!cookie.url) {
                cookie.url = `http${cookie.secure ? 's' : ''}://${cookie.domain}`;
            }
            try {
                await currentSession.cookies.set(cookie);
                successCount++;
            } catch (error) {
                console.error('[Auth] Failed to set cookie:', error);
            }
        }

        console.log(`[Auth] Session restored. ${successCount}/${sessionData.cookies.length} cookies loaded.`);
        return successCount > 0;
    } catch (error) {
        console.error('[Auth] Failed to load session data:', error);
        clearSessionData();
        return false;
    }
}

function clearSessionData() {
    try {
        store.delete('session');
        console.log('[Auth] Session data cleared.');
    } catch (error) {
        console.error('[Auth] Failed to clear session data:', error);
    }
}

async function getAllCookies() {
    try {
        return await session.fromPartition('persist:chzzk').cookies.get({});
    } catch (error) {
        console.error('[Auth] Failed to get all cookies:', error);
        return [];
    }
}

async function getCookiesForDomain(domain) {
    try {
        return await session.fromPartition('persist:chzzk').cookies.get({ domain });
    } catch (error) {
        console.error('[Auth] Failed to get cookies for domain:', error);
        return [];
    }
}

async function getAuthCookies() {
    const allCookies = await getAllCookies();
    const authCookies = allCookies.reduce((acc, obj) => {
        if (obj.name === "NID_AUT" || obj.name === "NID_SES") {
            acc[obj.name] = obj.value;
        }
        return acc;
    }, {});

    if (!authCookies['NID_SES'] || !authCookies['NID_AUT']) {
        throw new Error('Missing authentication cookies');
    }

    return {
        NID_SES: authCookies['NID_SES'],
        NID_AUT: authCookies['NID_AUT']
    };
}

module.exports = {
    saveSessionData,
    loadSessionData,
    clearSessionData,
    getAllCookies,
    getCookiesForDomain,
    getAuthCookies,
    store // Exporting store if needed elsewhere, though preferably not
};
