document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        // API Base URL
        baseUrl: 'http://localhost:3000',
        obsUrl: 'http://localhost:3000/follower?obs=true',

        currentItem: null,
        queue: [],
        knownFollowers: new Set(),
        isProcessing: false,
        audio: null,
        showSettings: false,
        showHelp: false,
        showHistory: false,
        sessionError: false,
        isReconnecting: false,
        reconnectAttempts: 0,
        maxReconnectAttempts: 5,
        history: [],

        // Settings
        volume: 0.5,
        pollingInterval: 5,
        displayDuration: 5,
        enableTTS: false,
        customSoundPath: null,
        animationType: 'fade', // fade, slide-up, slide-down, bounce
        textColor: '#ffffff',
        textSize: 100, // percentage
        isDarkTheme: true,

        async init() {
            console.log('[Alpine] App Initialized');
            this.audio = document.getElementById('notificationSound');

            // Tauri API 로드 대기 (최대 1초) - 레이스 컨디션 방지
            // tauri-api.js가 나중에 로드되는 경우를 대비
            if (!window.electronAPI && window.__TAURI__) {
                console.log('[Notifier] Waiting for Tauri API...');
                for (let i = 0; i < 20; i++) {
                    if (window.electronAPI) break;
                    await new Promise(r => setTimeout(r, 50));
                }
            }

            // 앱 모드라면 app-mode 클래스 추가 (윈도우 컨트롤 표시용)
            if (window.electronAPI) {
                document.body.classList.add('app-mode');
            }

            // 앱이 아니면(OBS 등) OBS 모드 적용
            if (!window.electronAPI) {
                document.body.classList.add('obs-mode');
                console.log('[init] OBS-MODE (Auto-detected)');
            }

            // 1. Tauri 환경 (Bridge 통신 사용) - 최우선
            if (window.electronAPI?.getServerPort) {
                const port = await window.electronAPI.getServerPort();
                this.baseUrl = `http://localhost:${port}`;
                this.obsUrl = `http://localhost:${port}/follower?obs=true`;
                console.log('[Notifier] Using Dynamic Port (Tauri):', port);
            }
            // 2. 그 외 환경 (OBS, 브라우저 직접 접속 등)
            else if (window.location.protocol.startsWith('http')) {
                this.baseUrl = window.location.origin;
                this.obsUrl = `${this.baseUrl}/follower?obs=true`;
                console.log('[Notifier] Auto-detected Base URL (HTTP):', this.baseUrl);
            }

            this.loadSettings();
            this.applyStyles();
            this.startPolling();
        },

        async loadSettings() {
            // 1. Load from Server (Sync)
            try {
                const res = await fetch(`${this.baseUrl}/settings`);
                if (res.ok) {
                    const serverSettings = await res.json();
                    if (Object.keys(serverSettings).length > 0) {
                        console.log('[Settings] Loaded from server:', serverSettings);
                        if (serverSettings.volume !== undefined) this.volume = serverSettings.volume;
                        if (serverSettings.pollingInterval !== undefined) this.pollingInterval = serverSettings.pollingInterval;
                        if (serverSettings.enableTTS !== undefined) this.enableTTS = serverSettings.enableTTS;
                        if (serverSettings.customSoundPath !== undefined) this.customSoundPath = serverSettings.customSoundPath;
                        if (serverSettings.animationType !== undefined) this.animationType = serverSettings.animationType;
                        if (serverSettings.textColor !== undefined) this.textColor = serverSettings.textColor;
                        if (serverSettings.textSize !== undefined) this.textSize = serverSettings.textSize;
                    }
                }
            } catch (e) {
                console.error('[Settings] Failed to load from server, falling back to localStorage:', e);
                // Fallback to localStorage
                const s = localStorage;
                if (s.getItem('volume')) this.volume = parseFloat(s.getItem('volume'));
                if (s.getItem('pollingInterval')) this.pollingInterval = parseInt(s.getItem('pollingInterval'));
                if (s.getItem('enableTTS')) this.enableTTS = s.getItem('enableTTS') === 'true';
                if (s.getItem('customSoundPath')) this.customSoundPath = s.getItem('customSoundPath');
                if (s.getItem('animationType')) this.animationType = s.getItem('animationType');
                if (s.getItem('textColor')) this.textColor = s.getItem('textColor');
                if (s.getItem('textSize')) this.textSize = parseInt(s.getItem('textSize'));
            }

            // 2. URL Parameters Override (Highest Priority - for OBS manual overrides)
            const params = new URLSearchParams(window.location.search);
            if (params.has('volume')) this.volume = parseFloat(params.get('volume'));
            if (params.has('pollingInterval')) this.pollingInterval = parseInt(params.get('pollingInterval'));
            if (params.has('enableTTS')) this.enableTTS = params.get('enableTTS') === 'true';
            if (params.has('animationType')) this.animationType = params.get('animationType');
            if (params.has('textColor')) {
                this.textColor = params.get('textColor').startsWith('#') ? params.get('textColor') : '#' + params.get('textColor');
            }
            if (params.has('textSize')) this.textSize = parseInt(params.get('textSize'));

            this.applyStyles();
            this.loadHistory(); // Load history on init
        },

        async saveSettings() {
            // Save to LocalStorage (Backup)
            const s = localStorage;
            s.setItem('volume', this.volume);
            s.setItem('pollingInterval', this.pollingInterval);
            s.setItem('enableTTS', this.enableTTS);
            if (this.customSoundPath) s.setItem('customSoundPath', this.customSoundPath);
            s.setItem('animationType', this.animationType);
            s.setItem('textColor', this.textColor);
            s.setItem('textSize', this.textSize);

            // Save to Server (Primary for Sync)
            try {
                await fetch(`${this.baseUrl}/settings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        volume: this.volume,
                        pollingInterval: this.pollingInterval,
                        enableTTS: this.enableTTS,
                        customSoundPath: this.customSoundPath,
                        animationType: this.animationType,
                        textColor: this.textColor,
                        textSize: this.textSize
                    })
                });
                console.log('[Settings] Saved to server');
            } catch (e) {
                console.error('[Settings] Failed to save to server:', e);
            }

            this.applyStyles();
            this.showSettings = false;
        },

        applyStyles() {
            const root = document.documentElement;
            root.style.setProperty('--text-color', this.textColor);

            // Adjust text size (base is 16px, so 100% = 1rem)
            document.body.style.fontSize = `${this.textSize}%`;

            // Update audio source if custom path exists
            // Update audio source if custom path exists
            if (this.customSoundPath) {
                if (window.electronAPI?.convertFileSrc) {
                    this.audio.src = window.electronAPI.convertFileSrc(this.customSoundPath);
                } else {
                    this.audio.src = `file://${this.customSoundPath}`;
                }
            } else {
                this.audio.src = '/public/sound.mp3';
            }
        },

        async selectSoundFile() {
            if (window.electronAPI) {
                const path = await window.electronAPI.selectAudioFile();
                if (path) {
                    this.customSoundPath = path;
                }
            } else {
                alert('Electron API not available');
            }
        },

        startPolling() {
            console.log('[startPolling] interval:', this.pollingInterval);
            this.fetchFollowers(true);
            this.scheduleNextPoll();
        },

        scheduleNextPoll() {
            setTimeout(() => {
                this.pollLoop();
            }, this.pollingInterval * 1000);
        },

        async pollLoop() {
            // console.log('[POLL] ' + new Date().toLocaleTimeString());
            await this.fetchFollowers(false);
            this.scheduleNextPoll();
        },

        async fetchFollowers(isInitial = false) {
            try {
                const response = await fetch(`${this.baseUrl}/followers?_t=${Date.now()}`);
                if (!response.ok) return;

                const resData = await response.json();
                const followers = resData.content.data;
                if (followers && followers.length > 0) {
                    this.debugLastData = followers[0];
                }

                if (isInitial) {
                    followers.forEach(f => {
                        this.knownFollowers.add(f.user.userIdHash);

                        // OBS 새로고침 시 최근 알림 누락 방지 (30초 이내)
                        try {
                            let timeStr = f.followingSince;
                            if (timeStr && timeStr.indexOf('T') === -1) {
                                timeStr = timeStr.replace(' ', 'T');
                            }

                            const followTime = new Date(timeStr).getTime();
                            const now = Date.now();

                            // 1시간 (테스트용)
                            if (!isNaN(followTime) && (now - followTime < 3600000)) {
                                console.log('[Initial] Recent follower:', f.user.nickname);
                                if (!this.queue.some(item => item.user.userIdHash === f.user.userIdHash)) {
                                    this.queue.push(f);
                                }
                            }
                        } catch (e) {
                            console.warn('[Initial] Date check failed:', e);
                        }
                    });
                    console.log('[fetch] Initial:', this.knownFollowers.size);
                    if (this.queue.length > 0) this.processQueue();
                    return;
                }

                const newFollowers = followers.filter(f => !this.knownFollowers.has(f.user.userIdHash));
                if (newFollowers.length > 0) {
                    console.log('[fetch] NEW:', newFollowers.length);
                    newFollowers.forEach(f => {
                        // 큐에 이미 있는지 이중 체크
                        if (!this.queue.some(item => item.user.userIdHash === f.user.userIdHash)) {
                            this.knownFollowers.add(f.user.userIdHash);
                            this.queue.push(f);
                        }
                    });
                    this.processQueue();
                }
            } catch (error) {
                console.error('[fetch] ERR:', error);
            }
        },

        processQueue() {
            if (this.queue.length > 0 && !this.isProcessing) {
                this.isProcessing = true;
                this.currentItem = this.queue.shift();
                console.log('[SHOW] Item:', this.currentItem);
                console.log('[SHOW] User:', this.currentItem?.user);
                console.log('[SHOW] Nickname:', this.currentItem?.user?.nickname);

                this.playAlarm();
                this.addHistory(this.currentItem); // Add to history
                if (this.enableTTS) this.speak(this.currentItem.user.nickname);

                // Show duration
                setTimeout(() => {
                    this.currentItem = null;
                    // Cooldown before next
                    setTimeout(() => {
                        this.isProcessing = false;
                        this.processQueue();
                    }, 500);
                }, 5000);
            }
        },

        playAlarm() {
            if (this.audio) {
                this.audio.volume = this.volume;
                this.audio.currentTime = 0;
                this.audio.play().catch(e => console.error('[AUDIO] FAIL:', e));
            }
        },

        speak(text) {
            if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(`${text}님이 팔로우했습니다.`);
                utterance.lang = 'ko-KR';
                utterance.volume = this.volume;
                window.speechSynthesis.speak(utterance);
            }
        },

        addHistory(item) {
            if (!item) return;
            // Add timestamp
            const historyItem = {
                ...item,
                notifiedAt: new Date().toISOString()
            };
            this.history.unshift(historyItem);

            // Limit history size (e.g., 50)
            if (this.history.length > 50) {
                this.history.pop();
            }
            this.saveHistory();
        },

        saveHistory() {
            localStorage.setItem('alarmHistory', JSON.stringify(this.history));
        },

        loadHistory() {
            const saved = localStorage.getItem('alarmHistory');
            if (saved) {
                try {
                    this.history = JSON.parse(saved);
                } catch (e) {
                    console.error('[History] Load failed:', e);
                    this.history = [];
                }
            }
        },

        clearHistory() {
            this.history = [];
            localStorage.removeItem('alarmHistory');
        },

        testAlarm() {
            fetch(`${this.baseUrl}/test-follower`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }).then(res => res.json())
                .then(data => {
                    console.log('[TEST] OK');
                    this.fetchFollowers(false);
                })
                .catch(err => console.error('[TEST] ERR:', err));
        },

        copyOBSUrl() {
            // OBS URL은 항상 백엔드 서버 포트를 사용해야 함
            const url = `${this.baseUrl}/follower?obs=true`;
            navigator.clipboard.writeText(url).then(() => {
                alert('OBS URL이 복사되었습니다!');
            });
        },

        formatTime(timestamp) {
            const d = new Date(timestamp);
            return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        },

        loadTheme() {
            const savedTheme = localStorage.getItem('fazzk-theme');
            if (savedTheme === 'light') {
                document.documentElement.setAttribute('data-theme', 'light');
                this.isDarkTheme = false;
            } else {
                document.documentElement.removeAttribute('data-theme');
                this.isDarkTheme = true;
            }
            if (window.electronAPI?.setTheme) {
                window.electronAPI.setTheme(this.isDarkTheme);
            }
        },

        toggleTheme() {
            this.isDarkTheme = !this.isDarkTheme;
            if (this.isDarkTheme) {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('fazzk-theme', 'dark');
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('fazzk-theme', 'light');
            }
            if (window.electronAPI?.setTheme) {
                window.electronAPI.setTheme(this.isDarkTheme);
            }
        }
    }));
});
