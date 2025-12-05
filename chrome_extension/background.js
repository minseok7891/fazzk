// 포트 범위 설정
const PORT_RANGE = { start: 3000, end: 3010 };
let activePort = null;
let lastSent = 0;

// 사용 가능한 포트 찾기
async function findActivePort() {
    for (let port = PORT_RANGE.start; port <= PORT_RANGE.end; port++) {
        try {
            const response = await fetch(`http://localhost:${port}/settings`, {
                method: 'GET',
                signal: AbortSignal.timeout(500)
            });
            if (response.ok) {
                activePort = port;
                await chrome.storage.local.set({ activePort: port });
                return port;
            }
        } catch (e) {
            // 이 포트는 사용 불가
        }
    }
    return null;
}

// 저장된 포트 또는 탐색
async function getActivePort() {
    if (activePort) return activePort;

    const stored = await chrome.storage.local.get('activePort');
    if (stored.activePort) {
        // 저장된 포트가 여전히 유효한지 확인
        try {
            const response = await fetch(`http://localhost:${stored.activePort}/settings`, {
                signal: AbortSignal.timeout(500)
            });
            if (response.ok) {
                activePort = stored.activePort;
                return activePort;
            }
        } catch (e) {
            // 저장된 포트 무효, 재탐색
        }
    }

    return await findActivePort();
}

// 쿠키 변경 감지
chrome.cookies.onChanged.addListener((changeInfo) => {
    const cookie = changeInfo.cookie;
    if (cookie.domain.includes('naver.com') && (cookie.name === 'NID_AUT' || cookie.name === 'NID_SES')) {
        const now = Date.now();
        if (now - lastSent > 2000) {
            lastSent = now;
            checkAndSendCookies();
        }
    }
});

async function checkAndSendCookies() {
    try {
        const nidAut = await chrome.cookies.get({ url: 'https://nid.naver.com', name: 'NID_AUT' });
        const nidSes = await chrome.cookies.get({ url: 'https://nid.naver.com', name: 'NID_SES' });

        if (nidAut && nidSes) {
            sendToApp(nidAut.value, nidSes.value);
        }
    } catch (error) {
        // 쿠키 가져오기 실패
    }
}

async function sendToApp(nidAut, nidSes) {
    const port = await getActivePort();
    if (!port) {
        return;
    }

    try {
        const response = await fetch(`http://localhost:${port}/auth/cookies`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                NID_AUT: nidAut,
                NID_SES: nidSes
            })
        });

        if (response.ok) {
            chrome.action.setBadgeText({ text: 'OK' });
            chrome.action.setBadgeBackgroundColor({ color: '#00ffa3' });

            setTimeout(() => {
                chrome.action.setBadgeText({ text: '' });
            }, 3000);
        }
    } catch (error) {
        // 포트 무효화, 다음에 재탐색
        activePort = null;
    }
}

// 시작 시 포트 탐색
findActivePort();
