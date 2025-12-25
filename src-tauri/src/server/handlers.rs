use super::state::ServerState;
use crate::chzzk;
use crate::state::CookieData;
use axum::{
    extract::{Json, State},
    http::StatusCode,
    response::{Html, IntoResponse},
};
use chrono::{DateTime, Local};
use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};
use tauri_plugin_store::StoreExt;

// Handler for POST /auth/cookies (from Extension)
pub async fn receive_cookies(
    State(state): State<ServerState>,
    Json(payload): Json<CookieData>,
) -> impl IntoResponse {
    tracing::info!("[Server] Received cookies from extension");

    // 1. Verify cookies & Fetch User Info
    match chzzk::get_profile_id(&state.app_state.client, &payload).await {
        Ok((hash, nickname)) => {
            tracing::info!("[Server] Verified User: {} ({})", nickname, hash);

            // 2. Update In-Memory State (AppState)
            {
                if let Ok(mut cookies) = state.app_state.cookies.lock() {
                    *cookies = Some(payload.clone());
                }
                if let Ok(mut hash_lock) = state.app_state.user_id_hash.lock() {
                    *hash_lock = Some(hash.clone());
                }
                if let Ok(mut status) = state.app_state.login_status.lock() {
                    *status = true;
                }
            }

            // 3. Save to Persistent Store (session.json)
            if let Ok(store) = state.app_handle.store("session.json") {
                store.set("NID_AUT", serde_json::json!(payload.nid_aut));
                store.set("NID_SES", serde_json::json!(payload.nid_ses));
                // Optional: Save caching info
                store.set("nickname", serde_json::json!(nickname));

                if let Err(e) = store.save() {
                    tracing::error!("[Server] Failed to save session: {}", e);
                } else {
                    tracing::info!("[Server] Session saved to store");
                }
            } else {
                tracing::error!("[Server] Failed to open Store");
            }

            // 4. Emit event to frontend (Update UI immediately)
            if let Err(e) = state.app_handle.emit(
                "manual-login-success",
                serde_json::json!({
                    "nickname": nickname,
                    "userIdHash": hash
                }),
            ) {
                tracing::error!("[Server] Failed to emit event: {}", e);
            }

            Json(serde_json::json!({
                "code": 200,
                "message": "Success",
                "nickname": nickname
            }))
        }
        Err(e) => {
            tracing::warn!("[Server] Cookie verification failed: {}", e);
            Json(serde_json::json!({
                "code": 401,
                "message": format!("Verification failed: {}", e)
            }))
        }
    }
}

// Handler for GET /cookies (Debug)
pub async fn get_cookies(State(state): State<ServerState>) -> impl IntoResponse {
    let cookies = state.app_state.cookies.lock().unwrap().clone();
    Json(cookies)
}

// Handler for GET /settings - Load settings from Tauri Store
pub async fn load_settings(State(state): State<ServerState>) -> impl IntoResponse {
    tracing::info!("[Server] Loading settings from Store");

    if let Ok(store) = state.app_handle.store("settings.json") {
        // 설정 항목들을 가져오기
        let mut settings = serde_json::Map::new();

        let keys = vec![
            "volume",
            "pollingInterval",
            "displayDuration",
            "enableTTS",
            "customSoundPath",
            "animationType",
            "textColor",
            "textSize",
        ];

        for key in keys {
            if let Some(value) = store.get(key) {
                settings.insert(key.to_string(), value.clone());
            }
        }

        if settings.is_empty() {
            // 기본 설정 반환
            Json(serde_json::json!({
                "volume": 0.5,
                "pollingInterval": 5,
                "displayDuration": 5,
                "enableTTS": false,
                "customSoundPath": null,
                "animationType": "fade",
                "textColor": "#ffffff",
                "textSize": 100
            }))
        } else {
            Json(serde_json::Value::Object(settings))
        }
    } else {
        // Store 열기 실패 시 기본 설정 반환
        Json(serde_json::json!({
            "volume": 0.5,
            "pollingInterval": 5,
            "displayDuration": 5,
            "enableTTS": false,
            "customSoundPath": null,
            "animationType": "fade",
            "textColor": "#ffffff",
            "textSize": 100
        }))
    }
}

// Handler for POST /settings - Save settings to Tauri Store
pub async fn save_settings(
    State(state): State<ServerState>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    tracing::info!("[Server] Saving settings to Store");

    if let Ok(store) = state.app_handle.store("settings.json") {
        // payload가 객체인 경우 각 항목을 저장
        if let Some(obj) = payload.as_object() {
            for (key, value) in obj {
                store.set(key, value.clone());
            }

            if let Err(e) = store.save() {
                tracing::error!("[Server] Failed to save settings: {}", e);
                return Json(
                    serde_json::json!({ "success": false, "error": "Failed to save settings" }),
                );
            }

            tracing::info!("[Server] Settings saved successfully");
            Json(serde_json::json!({ "success": true }))
        } else {
            Json(serde_json::json!({ "success": false, "error": "Invalid settings format" }))
        }
    } else {
        Json(serde_json::json!({ "success": false, "error": "Failed to open store" }))
    }
}

// Handler for GET /follower (OBS Widget)
pub async fn serve_notifier_html(State(state): State<ServerState>) -> impl IntoResponse {
    let html_path = state.resource_path.join("notifier.html");
    tracing::info!("[Server] Serving notifier.html from: {:?}", html_path);

    match std::fs::read_to_string(&html_path) {
        Ok(html) => Html(html).into_response(),
        Err(e) => {
            eprintln!(
                "[Server] notifier.html not found: {:?}, error: {}",
                html_path, e
            );
            (StatusCode::NOT_FOUND, "notifier.html not found").into_response()
        }
    }
}

// Handler for GET /followers (Polling)
pub async fn get_followers(State(state): State<ServerState>) -> impl IntoResponse {
    let app_state = &state.app_state;
    let mut real_followers: Vec<crate::chzzk::FollowerItem> = Vec::new();

    // 1. Fetch from Chzzk API
    let (cookies, user_id_hash) = {
        let cookies_lock = app_state.cookies.lock().unwrap();
        let hash_lock = app_state.user_id_hash.lock().unwrap();
        (cookies_lock.clone(), hash_lock.clone())
    };

    if let (Some(cookies), Some(hash)) = (cookies, user_id_hash) {
        match chzzk::get_followers(&app_state.client, &cookies, &hash).await {
            Ok(response) => {
                if let Some(content) = response.content {
                    real_followers = content.data;
                }
            }
            Err(e) => {
                tracing::warn!("[Server] Failed to fetch followers: {}", e);
                // Continue to serve test queue even if API fails
            }
        }
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();

    // 2. Process New Followers
    if !real_followers.is_empty() {
        let mut known = app_state.known_followers.lock().unwrap();
        let mut real_queue = app_state.real_queue.lock().unwrap();

        let current_hashes: std::collections::HashSet<String> = real_followers
            .iter()
            .map(|f| f.user.user_id_hash.clone())
            .collect();

        // Remove old known followers not in current list
        known.retain(|h| current_hashes.contains(h));

        // Add new ones
        for follower in &real_followers {
            tracing::info!("[Debug] Real Follower Item: {:?}", follower); // Check following_since value
            if !known.contains(&follower.user.user_id_hash) {
                known.insert(follower.user.user_id_hash.clone());
                tracing::info!("[Server] New follower detected: {}", follower.user.nickname);

                real_queue.push_back(crate::state::RealFollowerQueueItem {
                    follower: follower.clone(),
                    created_at: now,
                });
            }
        }
    }

    // 3. Cleanup Queues
    {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();

        // Clean Real Queue
        let mut real_queue = app_state.real_queue.lock().unwrap();
        while let Some(item) = real_queue.front() {
            if now - item.created_at > 30000 {
                real_queue.pop_front();
            } else {
                break;
            }
        }

        // Clean Test Queue
        let mut test_queue = app_state.test_queue.lock().unwrap();
        while let Some(item) = test_queue.front() {
            // Test queue items are removed after 30 seconds.
            // Parsing "test_{ts}" from userIdHash
            if let Some(ts_str) = item.user.user_id_hash.strip_prefix("test_") {
                if let Ok(ts) = ts_str.parse::<u128>() {
                    if now - ts > 30000 {
                        test_queue.pop_front();
                        continue;
                    }
                }
            }
            break;
        }
    }

    // 4. Combine Queues (Test + Real)
    let mut combined_data = Vec::new();
    let mut seen = std::collections::HashSet::new();

    // Add Test Queue (Iterate instead of Pop)
    {
        let test_queue = app_state.test_queue.lock().unwrap();
        for item in test_queue.iter() {
            if !seen.contains(&item.user.user_id_hash) {
                seen.insert(item.user.user_id_hash.clone());
                combined_data.push(item.clone());
            }
        }
    }

    // Add Real Queue
    {
        let real_queue = app_state.real_queue.lock().unwrap();
        for item in real_queue.iter() {
            if !seen.contains(&item.follower.user.user_id_hash) {
                seen.insert(item.follower.user.user_id_hash.clone());
                combined_data.push(item.follower.clone());
            }
        }
    }

    // Add remaining history from API (if not seen)
    for f in real_followers {
        if !seen.contains(&f.user.user_id_hash) {
            combined_data.push(f);
        }
    }

    Json(json!({
        "code": 200,
        "message": "Success",
        "content": {
            "page": 0,
            "size": 10,
            "data": combined_data
        }
    }))
}

// Handler for POST /test-follower
pub async fn test_follower(State(state): State<ServerState>) -> impl IntoResponse {
    let app_state = &state.app_state;
    // ...
    let now_str = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis()
        .to_string();
    let test_item = crate::chzzk::FollowerItem {
        user: crate::chzzk::User {
            user_id_hash: format!("test_{}_{}", now_str, uuid::Uuid::new_v4()),
            nickname: "테스트 유저".to_string(),
            profile_image_url: None,
        },
        following_since: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    tracing::info!("[Server] Test follower added: {}", test_item.user.nickname);

    let mut queue = app_state.test_queue.lock().unwrap();
    queue.push_back(test_item);

    Json(json!({
        "success": true,
        "message": "Test follower added to queue"
    }))
}
