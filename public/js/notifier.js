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

        loadSettings() {
            const s = localStorage;
            if (s.getItem('volume')) this.volume = parseFloat(s.getItem('volume'));
            if (s.getItem('pollingInterval')) this.pollingInterval = parseInt(s.getItem('pollingInterval'));
            if (s.getItem('enableTTS')) this.enableTTS = s.getItem('enableTTS') === 'true';
            if (s.getItem('customSoundPath')) this.customSoundPath = s.getItem('customSoundPath');
            if (s.getItem('animationType')) this.animationType = s.getItem('animationType');
            if (s.getItem('textColor')) this.textColor = s.getItem('textColor');
            if (s.getItem('textSize')) this.textSize = parseInt(s.getItem('textSize'));
        },

        saveSettings() {
            const s = localStorage;
            s.setItem('volume', this.volume);
            s.setItem('pollingInterval', this.pollingInterval);
            s.setItem('enableTTS', this.enableTTS);
            if (this.customSoundPath) s.setItem('customSoundPath', this.customSoundPath);
            s.setItem('animationType', this.animationType);
            s.setItem('textColor', this.textColor);
            s.setItem('textSize', this.textSize);

            this.applyStyles();
            this.showSettings = false;

            // Restart polling with new interval if needed
            // (Simple implementation: just let the next loop handle it)
        },

        applyStyles() {
            const root = document.documentElement;
            root.style.setProperty('--text-color', this.textColor);

            // Adjust text size (base is 16px, so 100% = 1rem)
            // We can scale the body font size or specific elements
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
