/**
 * Tauri API 호환 레이어
 * Electron의 window.electronAPI를 Tauri API로 대체합니다.
 * 
 * 사용법: HTML 파일에서 이 스크립트를 먼저 로드하세요.
 * <script src="/public/js/tauri-api.js"></script>
 */

(function () {
    if (window.electronAPI) {
        console.warn('[Tauri API] 이미 초기화되었습니다.');
        return;
    }

    // Tauri 환경 감지
    const isTauri = window.__TAURI__ !== undefined;

    // Tauri API 초기화
    async function initTauriAPI() {
        if (!isTauri) {
            console.warn('[Tauri API] Tauri 환경이 아닙니다. 일부 기능이 비활성화됩니다.');
            return;
        }

        const { invoke } = window.__TAURI__.core;
        const { open } = window.__TAURI__.shell;
        const { getCurrentWindow } = window.__TAURI__.window;
        const { listen } = window.__TAURI__.event;
        const { convertFileSrc } = window.__TAURI__.core; // Tauri 2.0

        // Listen for manual login success from Rust backend
        listen('manual-login-success', (event) => {
            console.log('[Tauri API] Manual Login Success:', event.payload);
            // Visual feedback
            document.body.style.backgroundColor = '#00ffa3';
            document.body.innerHTML = '<h1>로그인 성공! 이동 중...</h1>';

            setTimeout(() => {
                window.location.href = '/notifier.html';
            }, 500);
        });

        // Update Progress Listener
        let updateProgressCallback = null;
        listen('update-progress', (event) => {
            console.log('[Tauri API] Update Progress:', event.payload);
            if (updateProgressCallback) {
                updateProgressCallback(event.payload);
            }
        });

        // window.electronAPI 호환 객체 생성
        window.electronAPI = {
            // === 쿠키/세션 관리 (Rust 백엔드 구현 필요) ===
            getCookies: async () => {
                try {
                    return await invoke('get_cookies');
                } catch (e) {
                    console.error('[Tauri API] getCookies 실패:', e);
                    return [];
                }
            },

            getServerPort: async () => {
                try {
                    return await invoke('get_server_port');
                } catch (e) {
                    console.error('[Tauri API] getServerPort 실패:', e);
                    return 3000; // Fallback
                }
            },

            getAppVersion: async () => {
                try {
                    return await invoke('get_app_version');
                } catch (e) {
                    console.error('[Tauri API] getAppVersion 실패:', e);
                    return '2.0.0'; // Fallback
                }
            },

            getCookiesForDomain: async (domain) => {
                try {
                    return await invoke('get_cookies_for_domain', { domain });
                } catch (e) {
                    console.error('[Tauri API] getCookiesForDomain 실패:', e);
                    return [];
                }
            },
            clearSessionData: async () => {
                try {
                    return await invoke('clear_session_data');
                } catch (e) {
                    console.error('[Tauri API] clearSessionData 실패:', e);
                    return false;
                }
            },

            // === 업데이트 ===
            checkForUpdates: async () => {
                try {
                    return await invoke('check_for_updates');
                } catch (e) {
                    console.error('[Tauri API] checkForUpdates 실패:', e);
                    return { has_update: false, error: e.toString() };
                }
            },
            openDownloadPage: async (url) => {
                try {
                    return await invoke('open_download_page', { url });
                } catch (e) {
                    console.error('[Tauri API] openDownloadPage 실패:', e);
                }
            },
            downloadUpdate: async (url) => {
                try {
                    return await invoke('download_and_install_update', { url });
                } catch (e) {
                    console.error('[Tauri API] downloadUpdate 실패:', e);
                    alert('다운로드 실패: ' + e);
                }
            },
            onUpdateProgress: (callback) => {
                updateProgressCallback = callback;
                console.log('[Tauri API] onUpdateProgress 리스너 등록됨');
            },

            // === 네비게이션 ===
            navigateToUrl: async (url) => {
                try {
                    return await invoke('navigate_to_url', { url });
                } catch (e) {
                    console.error('[Tauri API] navigateToUrl 실패:', e);
                    // 폴백: 현재 창에서 이동
                    window.location.href = url;
                    return true;
                }
            },

            // === 로그인 ===
            manualLogin: async (nid_aut, nid_ses) => {
                try {
                    // Tauri converts camelCase to snake_case for args
                    await invoke('manual_login', { nidAut: nid_aut, nidSes: nid_ses });
                    return true;
                } catch (e) {
                    console.error('[Tauri API] manualLogin error:', e);
                    alert('로그인 실패: ' + e);
                    return false;
                }
            },

            // === 설정 ===
            selectAudioFile: async () => {
                try {
                    // Tauri 2.0 Plugin Access
                    const dialog = window.__TAURI__.dialog || (window.__TAURI__.plugin && window.__TAURI__.plugin.dialog);
                    if (!dialog) {
                        console.error('[Tauri API] Dialog plugin not found');
                        return null;
                    }

                    const selected = await dialog.open({
                        multiple: false,
                        filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }]
                    });

                    return selected;
                } catch (e) {
                    console.error('[Tauri API] selectAudioFile 실패:', e);
                    return null;
                }
            },
            convertFileSrc: (filePath) => {
                try {
                    return convertFileSrc(filePath);
                } catch (e) {
                    console.error('[Tauri API] convertFileSrc 실패:', e);
                    return filePath;
                }
            },
            getAppConfig: async () => {
                try {
                    return await invoke('get_app_config');
                } catch (e) {
                    console.error('[Tauri API] getAppConfig 실패:', e);
                    return { port: 3000 };
                }
            },

            // === 테마 ===
            setTheme: async (isDark) => {
                localStorage.setItem('fazzk-theme', isDark ? 'dark' : 'light');
                return true;
            },

            // === Placeholder for update events ===
            onUpdateAvailable: (cb) => { },
            onUpdateDownloadStarted: (cb) => { },
            onUpdateDownloaded: (cb) => { },
            onUpdateAvailableGithub: (cb) => { },
            onUpdateCheckFailed: (cb) => { },
            onUpdateCheckComplete: (cb) => { },

            // === 창 제어 (Custom Titlebar for Tauri) ===
            minimize: async () => {
                try { await getCurrentWindow().minimize(); } catch (e) { console.error(e); }
            },
            toggleMaximize: async () => {
                try {
                    const win = getCurrentWindow();
                    const isMaximized = await win.isMaximized();
                    if (isMaximized) await win.unmaximize();
                    else await win.maximize();
                } catch (e) { console.error(e); }
            },
            close: async () => {
                try { await getCurrentWindow().close(); } catch (e) { console.error(e); }
            },

            // === 로깅 ===
            log: (...args) => console.log('[Tauri]', ...args)
        };

        console.log('[Tauri API] 초기화 완료');
    }

    // 페이지 로드 시 자동 초기화
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTauriAPI);
    } else {
        initTauriAPI();
    }
})();
