const express = require('express');
const config = require('./config');
const chzzk = require('./chzzk');
const auth = require('./auth');

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

async function startServer() {
    const app = express();

    // Find available port
    const port = await findAvailablePort(config.port);
    config.runtimePort = port; // Save actual port to config

    // Serve public directory at /public to match frontend paths
    console.log('[Server] Public path:', config.paths.public);
    const fs = require('fs');
    console.log('[Server] Public exists:', fs.existsSync(config.paths.public));
    console.log('[Server] CSS exists:', fs.existsSync(require('path').join(config.paths.public, 'css', 'notifier.css')));

    app.use('/public', express.static(config.paths.public));
    app.use(express.static(config.paths.public)); // Keep root access for backward compatibility

    // Fallback: Explicitly serve notifier.css if static middleware fails
    app.get('/public/css/notifier.css', (req, res) => {
        const cssPath = require('path').join(config.paths.public, 'css', 'notifier.css');
        console.log('[Server] Manual serve:', cssPath);
        if (fs.existsSync(cssPath)) {
            res.setHeader('Content-Type', 'text/css');
            res.send(fs.readFileSync(cssPath, 'utf8'));
        } else {
            console.error('[Server] CSS file not found:', cssPath);
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
        console.log('[Server] Test follower added:', testFollower.user.nickname);

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
                console.warn('[Server] Failed to fetch real followers (ignoring for test queue):', apiError.message);
            }

            const now = Date.now();

            // Detect new real followers
            realFollowers.forEach(f => {
                const hash = f.user.userIdHash;
                if (!allKnownFollowers.has(hash)) {
                    allKnownFollowers.add(hash);
                    recentRealFollowerQueue.push({ follower: f, createdAt: now });
                    console.log('[Server] New follower detected:', f.user.nickname);
                }
            });

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
                message: "Success",
                content: {
                    page: 0,
                    size: 10,
                    data: combinedFollowers
                }
            });

        } catch (error) {
            console.error('[Server] Error fetching followers:', error.message);
            return res.status(401).json({
                code: '401',
                message: 'Authentication failed or API request error'
            });
        }
    });

    app.listen(port, () => {
        console.log(`[Server] Express server running at http://localhost:${port}`);
    });
}

module.exports = {
    startServer
};
