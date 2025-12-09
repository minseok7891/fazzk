const { contextBridge, ipcRenderer } = require('electron');

/**
 * 프로덕션 환경 여부
 * 패키지된 앱은 app.asar 경로를 포함
 * @type {boolean}
 */
const isProduction = process.resourcesPath && process.resourcesPath.includes('app.asar');

// Expose secure APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Cookie management APIs
  getCookies: () => ipcRenderer.invoke('get-cookies'),
  getCookiesForDomain: (domain) => ipcRenderer.invoke('get-cookies-for-domain', domain),

  // Session management APIs
  clearSessionData: () => ipcRenderer.invoke('clear-session-data'),

  // 개발 유틸리티 (프로덕션에서는 비활성화)
  log: isProduction
    ? () => { } // 프로덕션에서는 빈 함수
    : (...args) => console.log('[렌더러]', ...args),

  // Navigation control
  navigateToUrl: (url) => ipcRenderer.invoke('navigate-to-url', url),

  // Login flow
  startLogin: () => ipcRenderer.invoke('start-login'),

  // Settings & Config
  selectAudioFile: () => ipcRenderer.invoke('select-audio-file'),
  getAppConfig: () => ipcRenderer.invoke('get-app-config'),

  // Update listeners
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_, data) => callback(data)),
  onUpdateDownloadStarted: (callback) => ipcRenderer.on('update-download-started', (_, data) => callback(data)),
  onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (_, data) => callback(data)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_, data) => callback(data)),

  // GitHub API 업데이트
  onUpdateAvailableGithub: (callback) => ipcRenderer.on('update-available-github', (_, data) => callback(data)),
  onUpdateCheckFailed: (callback) => ipcRenderer.on('update-check-failed', (_, data) => callback(data)),
  onUpdateCheckComplete: (callback) => ipcRenderer.on('update-check-complete', (_, data) => callback(data)),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  openDownloadPage: (url) => ipcRenderer.invoke('open-download-page', url),

  // 테마 변경 시 타이틀바 색상 변경
  setTheme: (isDark) => ipcRenderer.invoke('set-theme', isDark)
});

// 프리로드 스크립트 로드 성공 로그 (개발 환경에서만)
if (!isProduction) {
  console.log('[Preload] 프리로드 스크립트가 성공적으로 로드되었습니다.');
}
