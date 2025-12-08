/**
 * 로거 모듈
 * 개발/프로덕션 환경에 따라 조건부 로깅을 수행합니다.
 * 
 * 사용법:
 *   const logger = require('./logger');
 *   logger.info('[Module] 메시지');
 *   logger.warn('[Module] 경고 메시지');
 *   logger.error('[Module] 에러 메시지');
 */

const config = require('./config');

// 프로덕션 환경에서는 로그 출력 안 함
const isEnabled = !config.isProduction;

/**
 * 정보 로그 출력
 * @param {...any} args - 로그 인자들
 */
function info(...args) {
    if (isEnabled) {
        console.log(...args);
    }
}

/**
 * 경고 로그 출력
 * @param {...any} args - 로그 인자들
 */
function warn(...args) {
    if (isEnabled) {
        console.warn(...args);
    }
}

/**
 * 에러 로그 출력 (항상 출력)
 * @param {...any} args - 로그 인자들
 */
function error(...args) {
    // 에러는 항상 출력
    console.error(...args);
}

module.exports = {
    info,
    warn,
    error
};
