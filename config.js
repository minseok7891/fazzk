/**
 * @fileoverview 애플리케이션 설정 모듈
 * @module config
 */

const path = require('path');
const { app } = require('electron');

/**
 * 프로덕션 환경 여부
 * @type {boolean}
 */
const isProduction = process.env.NODE_ENV === 'production' || app.isPackaged;

/**
 * 애플리케이션 설정
 * @type {Object}
 */
module.exports = {
    /** @type {number} 기본 서버 포트 */
    port: 3000,

    /**
     * 세션 관련 설정
     * @type {Object}
     */
    session: {
        /** @type {string} Electron 세션 파티션 이름 */
        partition: 'persist:chzzk'
    },

    /**
     * 창 크기 설정
     * @type {Object}
     */
    window: {
        /** @type {number} 창 너비 */
        width: 1024,
        /** @type {number} 창 높이 */
        height: 768
    },

    /**
     * 타이머 설정 (밀리초)
     * @type {Object}
     */
    timers: {
        /** @type {number} 세션 모니터 간격 (10분) */
        sessionMonitor: 10 * 60 * 1000,
        /** @type {number} 업데이트 확인 지연 (3초) */
        updateCheck: 3000,
        /** @type {number} 연결 확인 간격 (10초) */
        connectionCheck: 10000,
        /** @type {number} 테스트 팔로워 만료 시간 (10초) */
        testFollowerExpiry: 10000,
        /** @type {number} 실제 팔로워 만료 시간 (30초) */
        realFollowerExpiry: 30000
    },

    /**
     * API 엔드포인트
     * @type {Object}
     */
    api: {
        /** @type {string} 네이버 게임 API */
        naverGame: 'https://comm-api.game.naver.com',
        /** @type {string} 치지직 API */
        chzzk: 'https://api.chzzk.naver.com',
        /** @type {string} 네이버 로그인 URL */
        nidLogin: 'https://nid.naver.com/nidlogin.login?url=https%3A%2F%2Fchzzk.naver.com%2F',
        /** @type {string} 치지직 메인 URL */
        chzzkMain: 'https://chzzk.naver.com/'
    },

    /**
     * 인증 관련 설정
     * @type {Object}
     */
    auth: {
        /**
         * 세션 암호화 키
         * 우선순위: 환경변수 > 기기별 고유값
         * @type {string}
         */
        get encryptionKey() {
            // 환경변수에서 우선 확인
            if (process.env.FAZZK_ENCRYPTION_KEY) {
                return process.env.FAZZK_ENCRYPTION_KEY;
            }
            // 기기별 고유 키 생성 (앱 이름 + 사용자 데이터 경로 조합)
            const crypto = require('crypto');
            const salt = 'fazzk-session-v1';
            const uniqueData = `${app.getPath('userData')}-${salt}`;
            return crypto.createHash('sha256').update(uniqueData).digest('hex').substring(0, 32);
        },
        /** @type {string[]} 허용된 쿠키 도메인 */
        allowedDomains: ['.naver.com', '.nid.naver.com', 'nid.naver.com', 'chzzk.naver.com', '.chzzk.naver.com']
    },

    /**
     * 파일 경로
     * @type {Object}
     */
    paths: {
        /** @type {string} 사용자 데이터 경로 */
        userData: app.getPath('userData'),
        /** @type {string} 페이지 경로 */
        pages: path.join(app.getAppPath(), 'pages'),
        /** @type {string} 퍼블릭 경로 */
        public: path.join(app.getAppPath(), 'public'),
        /** @type {string} 아이콘 경로 */
        icon: path.join(app.getAppPath(), 'public', 'dodoroi_icon.png'),
        /** @type {string} 프리로드 스크립트 경로 */
        preload: path.join(app.getAppPath(), 'preload.js')
    },

    /** @type {boolean} 프로덕션 환경 여부 */
    isProduction
};
