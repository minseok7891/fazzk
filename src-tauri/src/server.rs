use axum::{
    extract::{State, Json},
    response::{IntoResponse, Html},
    routing::{get, post},
    Router,
    http::{Method, StatusCode},
};
use std::sync::Arc;
use tokio::net::TcpListener;
use tauri::{AppHandle, Manager, Emitter};
use crate::state::{AppState, CookieData};
use crate::chzzk;
use tower_http::services::ServeDir;
use std::time::{SystemTime, UNIX_EPOCH};
use serde_json::json;

#[derive(Clone)]
struct ServerState {
    app_state: Arc<AppState>,
    app_handle: AppHandle,
    resource_path: std::path::PathBuf,
}

use tower_http::cors::CorsLayer;

pub async fn start_server(app_state: Arc<AppState>, app_handle: AppHandle) {
    // Find available port starting from 3000
    let port = find_available_port(3000).await;
    // let port = 3000; // Legacy static port
    
    // Save port to state
    if let Ok(mut p) = app_state.port.lock() {
        *p = port;
    }
    
    // 정적 파일 경로 (개발 vs 빌드 환경)
    // 가능한 리소스 경로들을 시도
    let resource_base = app_handle.path().resource_dir().ok();
    
    let possible_paths = vec![
        // 개발 환경
        std::path::PathBuf::from("../pages"),
        // 빌드 환경 - 직접 pages
        resource_base.as_ref().map(|p| p.join("pages")).unwrap_or_default(),
        // 빌드 환경 - _up_ 폴더 내 pages
        resource_base.as_ref().map(|p| p.join("_up_").join("pages")).unwrap_or_default(),
        // 빌드 환경 - 리소스 루트에 직접
        resource_base.clone().unwrap_or_default(),
    ];
    
    let resource_path = possible_paths.iter()
        .find(|p| p.join("notifier.html").exists())
        .cloned()
        .unwrap_or_else(|| std::path::PathBuf::from("../pages"));
    
    let public_path = resource_path.join("public");
    
    println!("[Server] Resource path: {:?}", resource_path);
    println!("[Server] Public path: {:?}", public_path);
    
    // Build router
    let state = ServerState { 
        app_state: app_state.clone(),
        app_handle: app_handle.clone(),
        resource_path: resource_path.clone(),
    };
    
    let app = Router::new()
        .nest_service("/public", ServeDir::new(&public_path))
        .route("/auth/cookies", post(receive_cookies))
        .route("/cookies", get(get_cookies)) // For debugging
        .route("/settings", get(load_settings).post(save_settings))
        .route("/followers", get(get_followers))
        .route("/test-follower", post(test_follower))
        .route("/follower", get(serve_notifier_html))
        .fallback_service(ServeDir::new(&resource_path))
        .with_state(state)
        .layer(
            CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods([Method::GET, Method::POST])
                .allow_headers(tower_http::cors::Any)
        );

    println!("Starting server on port {}", port);
    
    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).await.unwrap();
    
    axum::serve(listener, app).await.unwrap();
}

async fn find_available_port(start: u16) -> u16 {
    for port in start..start + 100 {
        if TcpListener::bind(format!("0.0.0.0:{}", port)).await.is_ok() {
            return port;
        }
    }
    start // Fallback
}

// Handler for POST /auth/cookies (from Extension)
async fn receive_cookies(
    State(state): State<ServerState>,
    Json(payload): Json<CookieData>,
) -> impl IntoResponse {
    println!("[Server] Received cookies from extension");
    
    // 1. Verify cookies & Fetch User Info
    match chzzk::get_profile_id(&payload).await {
        Ok((hash, nickname)) => {
            println!("[Server] Verified User: {} ({})", nickname, hash);
            
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
            use tauri_plugin_store::StoreExt;
            if let Ok(store) = state.app_handle.store("session.json") {
                store.set("NID_AUT", serde_json::json!(payload.nid_aut));
                store.set("NID_SES", serde_json::json!(payload.nid_ses));
                // Optional: Save caching info
                store.set("nickname", serde_json::json!(nickname));
                
                if let Err(e) = store.save() {
                    eprintln!("[Server] Failed to save session: {}", e);
                } else {
                    println!("[Server] Session saved to store");
                }
            } else {
                eprintln!("[Server] Failed to open Store");
            }

            // 4. Emit event to frontend (Update UI immediately)
            if let Err(e) = state.app_handle.emit("manual-login-success", serde_json::json!({
                "nickname": nickname,
                "userIdHash": hash
            })) {
                eprintln!("[Server] Failed to emit event: {}", e);
            }
            
            Json(serde_json::json!({ 
                "code": 200, 
                "message": "Success", 
                "nickname": nickname 
            }))
        },
        Err(e) => {
            eprintln!("[Server] Cookie verification failed: {}", e);
            Json(serde_json::json!({ 
                "code": 401, 
                "message": format!("Verification failed: {}", e) 
            }))
        }
    }
}

// Handler for GET /cookies (Debug)
async fn get_cookies(State(state): State<ServerState>) -> impl IntoResponse {
    let cookies = state.app_state.cookies.lock().unwrap().clone();
    Json(cookies)
}

// Handler for GET /settings - Load settings from Tauri Store
async fn load_settings(State(state): State<ServerState>) -> impl IntoResponse {
    use tauri_plugin_store::StoreExt;
    
    println!("[Server] Loading settings from Store");
    
    if let Ok(store) = state.app_handle.store("settings.json") {
        // 설정 항목들을 가져오기
        let mut settings = serde_json::Map::new();
        
        let keys = vec![
            "volume", "pollingInterval", "displayDuration", 
            "enableTTS", "customSoundPath", "animationType", 
            "textColor", "textSize"
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
async fn save_settings(
    State(state): State<ServerState>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    use tauri_plugin_store::StoreExt;
    
    println!("[Server] Saving settings to Store");
    
    if let Ok(store) = state.app_handle.store("settings.json") {
        // payload가 객체인 경우 각 항목을 저장
        if let Some(obj) = payload.as_object() {
            for (key, value) in obj {
                store.set(key, value.clone());
            }
            
            if let Err(e) = store.save() {
                eprintln!("[Server] Failed to save settings: {}", e);
                return Json(serde_json::json!({ "success": false, "error": "Failed to save settings" }));
            }
            
            println!("[Server] Settings saved successfully");
            Json(serde_json::json!({ "success": true }))
        } else {
            Json(serde_json::json!({ "success": false, "error": "Invalid settings format" }))
        }
    } else {
        Json(serde_json::json!({ "success": false, "error": "Failed to open store" }))
    }
}

// Handler for GET /follower (OBS Widget)
async fn serve_notifier_html(State(state): State<ServerState>) -> impl IntoResponse {
    let html_path = state.resource_path.join("notifier.html");
    println!("[Server] Serving notifier.html from: {:?}", html_path);
    
    match std::fs::read_to_string(&html_path) {
        Ok(html) => Html(html).into_response(),
        Err(e) => {
            eprintln!("[Server] notifier.html not found: {:?}, error: {}", html_path, e);
            (StatusCode::NOT_FOUND, "notifier.html not found").into_response()
        }
    }
}

// Handler for GET /followers (Polling)
async fn get_followers(
    State(state): State<ServerState>,
) -> impl IntoResponse {
    let app_state = &state.app_state;
    let mut real_followers: Vec<crate::chzzk::FollowerItem> = Vec::new();
    
    // 1. Fetch from Chzzk API
    let (cookies, user_id_hash) = {
        let cookies_lock = app_state.cookies.lock().unwrap();
        let hash_lock = app_state.user_id_hash.lock().unwrap();
        (cookies_lock.clone(), hash_lock.clone())
    };
    
    // ... (rest of function logic needs app_state usage)

    if let (Some(cookies), Some(hash)) = (cookies, user_id_hash) {
        match chzzk::get_followers(&cookies, &hash).await {
            Ok(response) => {
                if let Some(content) = response.content {
                   real_followers = content.data;
                }
            },
            Err(e) => {
                println!("[Server] Failed to fetch followers: {}", e);
                // Continue to serve test queue even if API fails
            }
        }
    }

    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();

    // 2. Process New Followers
    if !real_followers.is_empty() {
        let mut known = app_state.known_followers.lock().unwrap();
        let mut real_queue = app_state.real_queue.lock().unwrap();
        
        let current_hashes: std::collections::HashSet<String> = real_followers.iter()
            .map(|f| f.user.user_id_hash.clone())
            .collect();

        // Remove old known followers not in current list
        known.retain(|h| current_hashes.contains(h));

        // Add new ones
        for follower in &real_followers {
            if !known.contains(&follower.user.user_id_hash) {
                known.insert(follower.user.user_id_hash.clone());
                println!("[Server] New follower detected: {}", follower.user.nickname);
                
                real_queue.push_back(crate::state::RealFollowerQueueItem {
                    follower: follower.clone(),
                    created_at: now,
                });
            }
        }
    }

    // 3. Cleanup Queues
    {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
        
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
            // Test queue items store raw FollowerItem, so checking timestamp is tricky
            // But we specifically added a timestamp in user_id_hash for test items: "test_{timestamp}"
            // Let's parse it or just use a simpler timeout since test items are ephemeral.
            // Actually, `test_queue` stores `FollowerItem` which has `following_since`.
            // Let's assume test items expire in 30 seconds too.
            // For simplicity, we can rely on the fact that test_follower adds items with current timestamp key.
            
            // Or simpler: Test items are removed after 30 seconds.
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
async fn test_follower(
    State(state): State<ServerState>,
) -> impl IntoResponse {
    let app_state = &state.app_state;
    // ...
    let now_str = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis().to_string();
    let test_item = crate::chzzk::FollowerItem {
        user: crate::chzzk::User {
            user_id_hash: format!("test_{}", now_str),
            nickname: "테스트 유저".to_string(),
            profile_image_url: None,
        },
        following_since: "2024-01-01T00:00:00".to_string(), // ISO String mock
    };

    println!("[Server] Test follower added: {}", test_item.user.nickname);
    
    let mut queue = app_state.test_queue.lock().unwrap();
    queue.push_back(test_item);

    Json(json!({
        "success": true,
        "message": "Test follower added to queue"
    }))
}
