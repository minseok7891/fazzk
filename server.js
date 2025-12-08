const express = require('express');
const path = require('path');
const config = require('./config');
const chzzk = require('./chzzk');
const auth = require('./auth');
const logger = require('./logger');

let testFollowerQueue = [];
let recentRealFollowerQueue = [];
let allKnownFollowers = new Set();

function findAvailablePort(startPort) {
    return new Promise((resolve, reject) => {
        const server = require('net').createServer();
        server.unref();
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(findAvailablePort(startPort + 1));
            } else {
                reject(err);
            }
        });
        server.listen(startPort, () => {
            const { port } = server.address();
            server.close(() => {
                resolve(port);
            });
        });
    });
}

async function startServer(onLogin) {
    const app = express();

    // CORS middleware - localhost만 허용
    app.use((req, res, next) => {
        const allowedOrigins = ['http://localhost', 'http://127.0.0.1'];
        const origin = req.headers.origin;
        if (origin && allowedOrigins.some(allowed => origin.startsWith(allowed))) {
            res.header('Access-Control-Allow-Origin', origin);
        }
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        next();
    });

    app.use(express.json()); // Ensure JSON body parsing is enabled for POST

    // Find available port
    const port = await findAvailablePort(config.port);
    config.runtimePort = port; // Save actual port to config

    // Serve public directory at /public to match frontend paths
    logger.info('[Server] Public 경로:', config.paths.public);
    const fs = require('fs');
    logger.info('[Server] Public 존재:', fs.existsSync(config.paths.public));
    logger.info('[Server] CSS 존재:', fs.existsSync(require('path').join(config.paths.public, 'css', 'notifier.css')));

    app.use('/public', express.static(config.paths.public));
    app.use(express.static(config.paths.public)); // Keep root access for backward compatibility

    // Fallback: Explicitly serve notifier.css if static middleware fails
    app.get('/public/css/notifier.css', (req, res) => {
        const cssPath = require('path').join(config.paths.public, 'css', 'notifier.css');
        logger.info('[Server] 수동 제공:', cssPath);
        if (fs.existsSync(cssPath)) {
            res.setHeader('Content-Type', 'text/css');
            res.send(fs.readFileSync(cssPath, 'utf8'));
        } else {
            logger.error('[Server] CSS 파일 없음:', cssPath);
            res.status(404).send('CSS not found');
        }
    });

    // Static files for pages with cache control
    app.use('/pages', (req, res, next) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        next();
    }, express.static(config.paths.pages));

    app.get('/cookies', async (req, res) => {
        const cookies = await auth.getAllCookies();
        res.json(cookies);
    });

    app.get('/cookies/:domain', async (req, res) => {
        const domain = req.params.domain;
        const cookies = await auth.getCookiesForDomain(domain);
        res.json(cookies);
    });

    app.get('/follower', (req, res) => {
        res.sendFile(path.join(config.paths.pages, 'notifier.html'));
    });

    app.post('/test-follower', (req, res) => {
        const testFollower = {
            user: {
                userIdHash: 'test_' + Date.now(),
                nickname: '테스트 유저',
                profileImageUrl: null
            },
            followingSince: new Date().toISOString(),
            createdAt: Date.now()
        };

        testFollowerQueue.push(testFollower);
        logger.info('[Server] 테스트 팔로워 추가됨:', testFollower.user.nickname);

        res.json({ success: true, message: 'Test follower added to queue' });
    });

    app.get('/followers', async (req, res) => {
        try {
            let realFollowers = [];
            try {
                const followerData = await chzzk.getFollowers();
                if (followerData && followerData.content) {
                    realFollowers = followerData.content.data;
                }
            } catch (apiError) {
                logger.warn('[Server] 실제 팔로워 가져오기 실패 (테스트 큐 위해 무시):', apiError.message);
            }

            const now = Date.now();

            // Detect new real followers
            if (realFollowers.length > 0) {
                const currentHashes = new Set(realFollowers.map(f => f.user.userIdHash));

                // Remove known followers that are no longer in the current list (unfollowed or pushed off page 1)
                for (const hash of allKnownFollowers) {
                    if (!currentHashes.has(hash)) {
                        allKnownFollowers.delete(hash);
                    }
                }

                realFollowers.forEach(f => {
                    const hash = f.user.userIdHash;
                    if (!allKnownFollowers.has(hash)) {
                        allKnownFollowers.add(hash);
                        recentRealFollowerQueue.push({ follower: f, createdAt: now });
                        logger.info('[Server] 새 팔로워 감지됨:', f.user.nickname);
                    }
                });
            }

            // Cleanup queues
            testFollowerQueue = testFollowerQueue.filter(item => now - item.createdAt < 10000);
            recentRealFollowerQueue = recentRealFollowerQueue.filter(item => now - item.createdAt < 30000);

            // Combine and deduplicate
            const seen = new Set();
            const queueItems = [...testFollowerQueue, ...recentRealFollowerQueue.map(item => item.follower)]
                .filter(item => {
                    const hash = item.user?.userIdHash || item.follower?.user?.userIdHash;
                    if (seen.has(hash)) return false;
                    seen.add(hash);
                    return true;
                });

            const otherFollowers = realFollowers.filter(f => !seen.has(f.user.userIdHash));
            const combinedFollowers = [...queueItems, ...otherFollowers];

            // Construct response manually since followerData might be undefined if API failed
            return res.json({
                code: 200,
                message: 'Success',
                content: {
                    page: 0,
                    size: 10,
                    data: combinedFollowers
                }
            });

        } catch (error) {
            logger.error('[Server] 팔로워 가져오기 오류:', error.message);
            return res.status(401).json({
                code: '401',
                message: 'Authentication failed or API request error'
            });
        }
    });

    // Settings API
    const settingsPath = path.join(config.paths.userData, 'settings.json');

    app.get('/settings', (req, res) => {
        try {
            if (fs.existsSync(settingsPath)) {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                res.json(settings);
            } else {
                res.json({}); // Return empty object if no settings saved yet
            }
        } catch (error) {
            logger.error('[Server] 설정 읽기 실패:', error);
            res.status(500).json({ error: 'Failed to read settings' });
        }
    });



    app.post('/settings', (req, res) => {
        try {
            const settings = req.body;
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
            logger.info('[Server] 설정 저장됨:', settings);
            res.json({ success: true });
        } catch (error) {
            logger.error('[Server] 설정 저장 실패:', error);
            res.status(500).json({ error: 'Failed to save settings' });
        }
    });

    app.post('/auth/cookies', async (req, res) => {
        try {
            const { NID_AUT, NID_SES } = req.body;
            if (NID_AUT && NID_SES && onLogin) {
                logger.info('[Server] 확장 프로그램에서 쿠키 수신');
                await onLogin({ NID_AUT, NID_SES });
                res.json({ success: true });
            } else {
                res.status(400).json({ error: 'Missing cookies or handler' });
            }
        } catch (error) {
            logger.error('[Server] 쿠키 처리 실패:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    app.listen(port, () => {
        logger.info(`[Server] Express 서버 실행 중: http://localhost:${port}`);
    });
}

module.exports = {
    startServer
};
