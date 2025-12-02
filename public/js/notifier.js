document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        currentItem: null,
        queue: [],
        knownFollowers: new Set(),
        isProcessing: false,
        audio: null,
        showSettings: false,
        showHelp: false,

        // Settings
        volume: 0.5,
        pollingInterval: 5,
        enableTTS: false,
        customSoundPath: null,
        animationType: 'fade', // fade, slide-up, slide-down, bounce
        textColor: '#ffffff',
        textSize: 100, // percentage

        async init() {
            console.log('[Alpine] App Initialized');
            this.audio = document.getElementById('notificationSound');

            // OBS Mode Check
            if (new URLSearchParams(window.location.search).get('obs') === 'true') {
                document.body.classList.add('obs-mode');
                console.log('[init] OBS-MODE');
            }

            this.loadSettings();
            this.applyStyles();
            this.startPolling();
        },

        async loadSettings() {
            // 1. Load from Server (Sync)
            try {
                const res = await fetch('/settings');
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
                await fetch('/settings', {
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
            if (this.customSoundPath) {
                this.audio.src = `file://${this.customSoundPath}`;
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
                const response = await fetch(`/followers?_t=${Date.now()}`);
                if (!response.ok) return;

                const resData = await response.json();
                const followers = resData.content.data;

                if (isInitial) {
                    followers.forEach(f => this.knownFollowers.add(f.user.userIdHash));
                    console.log('[fetch] Initial:', this.knownFollowers.size);
                    return;
                }

                const newFollowers = followers.filter(f => !this.knownFollowers.has(f.user.userIdHash));
                if (newFollowers.length > 0) {
                    console.log('[fetch] NEW:', newFollowers.length);
                    newFollowers.forEach(f => {
                        this.knownFollowers.add(f.user.userIdHash);
                        this.queue.push(f);
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
                console.log('[SHOW]', this.currentItem.user.nickname);

                this.playAlarm();
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

        testAlarm() {
            fetch('/test-follower', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }).then(res => res.json())
                .then(data => {
                    console.log('[TEST] OK');
                    this.fetchFollowers(false);
                })
                .catch(err => console.error('[TEST] ERR:', err));
        }
    }));
});
