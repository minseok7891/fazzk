const axios = require('axios');
const config = require('./config');
const auth = require('./auth');
const logger = require('./logger');

let profileId = '';

async function getProfileId() {
    if (profileId) return profileId;

    try {
        const apiUrl = `${config.api.naverGame}/nng_main/v1/user/getUserStatus`;
        const cookies = await auth.getAuthCookies();

        const response = await axios.get(apiUrl, {
            headers: {
                Cookie: Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; '),
            },
            timeout: 5000
        });

        logger.info('[Chzzk] 프로필 데이터 수신:', response.data);
        profileId = response.data.content.userIdHash;
        return profileId;
    } catch (error) {
        logger.error('[Chzzk] 프로필 ID 가져오기 실패:', error.message);
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            logger.error('[Chzzk] 세션 만료됨');
            auth.clearSessionData();
            profileId = '';
        }
        throw error;
    }
}

async function getFollowers(page = 0, size = 10) {
    try {
        const currentProfileId = await getProfileId();
        const apiUrl = `${config.api.chzzk}/manage/v1/channels/${currentProfileId}/followers?page=${page}&size=${size}&userNickname=`;

        const cookies = await auth.getAuthCookies();

        const response = await axios.get(apiUrl, {
            headers: {
                Cookie: Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; '),
            },
            timeout: 5000
        });

        return response.data;
    } catch (error) {
        logger.error('[Chzzk] 팔로워 가져오기 실패:', error.message);
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            logger.error('[Chzzk] 세션 만료됨');
            auth.clearSessionData();
            profileId = '';
        }
        throw error;
    }
}

function resetProfileId() {
    profileId = '';
}

module.exports = {
    getProfileId,
    getFollowers,
    resetProfileId
};
