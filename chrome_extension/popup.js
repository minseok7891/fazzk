// Fazzk Extension Popup Script (Chrome/Firefox 호환)

const PORT_RANGE = { start: 3000, end: 3010 };

// API 호환성: browser 또는 chrome 사용
const api = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', () => {
    const statusDiv = document.getElementById('status');
    const portInfo = document.getElementById('portInfo');
    const sendBtn = document.getElementById('sendBtn');
    const copyBtn = document.getElementById('copyBtn');
    const refreshBtn = document.getElementById('refreshBtn');

    // 초기 연결 확인
    checkConnection();

    sendBtn.addEventListener('click', async () => {
        statusDiv.textContent = '쿠키 가져오는 중...';
        const cookies = await getCookies();
        if (cookies) {
            sendToApp(cookies.NID_AUT, cookies.NID_SES);
        } else {
            statusDiv.textContent = '네이버 로그인 필요';
        }
    });

    copyBtn.addEventListener('click', async () => {
        const cookies = await getCookies();
        if (cookies) {
            const json = JSON.stringify(cookies, null, 2);
            navigator.clipboard.writeText(json).then(() => {
                statusDiv.textContent = '복사되었습니다!';
                setTimeout(() => checkConnection(), 2000);
            });
        } else {
            statusDiv.textContent = '네이버 로그인 필요';
        }
    });

    refreshBtn.addEventListener('click', async () => {
        portInfo.textContent = '포트 탐색 중...';
        portInfo.style.color = '#aaa';
        await api.storage.local.remove('activePort');
        checkConnection();
    });

    async function getCookies() {
        const nidAut = await api.cookies.get({ url: 'https://nid.naver.com', name: 'NID_AUT' });
        const nidSes = await api.cookies.get({ url: 'https://nid.naver.com', name: 'NID_SES' });

        if (nidAut && nidSes) {
            return { NID_AUT: nidAut.value, NID_SES: nidSes.value };
        }
        return null;
    }

    async function findActivePort() {
        for (let port = PORT_RANGE.start; port <= PORT_RANGE.end; port++) {
            try {
                const response = await fetch(`http://localhost:${port}/settings`, {
                    method: 'GET',
                    signal: AbortSignal.timeout(500)
                });
                if (response.ok) {
                    await api.storage.local.set({ activePort: port });
                    return port;
                }
            } catch (e) {
                // 이 포트 사용 불가
            }
        }
        return null;
    }

    async function getActivePort() {
        const stored = await api.storage.local.get('activePort');
        if (stored.activePort) {
            try {
                const response = await fetch(`http://localhost:${stored.activePort}/settings`, {
                    signal: AbortSignal.timeout(500)
                });
                if (response.ok) {
                    return stored.activePort;
                }
            } catch (e) {
                // 저장된 포트 무효
            }
        }
        return await findActivePort();
    }

    async function sendToApp(nidAut, nidSes) {
        const port = await getActivePort();
        if (!port) {
            statusDiv.textContent = '앱을 실행해 주세요.';
            statusDiv.style.color = '#ff5555';
            return;
        }

        try {
            statusDiv.textContent = '전송 중...';
            const response = await fetch(`http://localhost:${port}/auth/cookies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ NID_AUT: nidAut, NID_SES: nidSes })
            });

            if (response.ok) {
                statusDiv.textContent = '전송 성공! 앱을 확인하세요.';
                statusDiv.style.color = '#00ffa3';
            } else {
                statusDiv.textContent = '앱 연결 실패';
                statusDiv.style.color = '#ff5555';
            }
        } catch (error) {
            statusDiv.textContent = '앱이 실행 중인지 확인하세요.';
            statusDiv.style.color = '#ff5555';
        }
    }

    async function checkConnection() {
        const port = await getActivePort();
        if (port) {
            portInfo.textContent = `포트: ${port}`;
            portInfo.style.color = '#00ffa3';
            statusDiv.textContent = '앱 연결됨 (자동 동기화 중)';
            statusDiv.style.color = '#00ffa3';
        } else {
            portInfo.textContent = '앱 미연결';
            portInfo.style.color = '#ff5555';
            statusDiv.textContent = '앱을 실행해 주세요.';
            statusDiv.style.color = '#aaa';
        }
    }
});
