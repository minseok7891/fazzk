pub mod server;
pub mod state;
pub mod chzzk;
pub mod updater;

use tauri::Manager;
use std::sync::Arc;
use state::AppState;
use tauri_plugin_store::StoreExt;

/// 앱 시작 시 저장된 쿠키를 로드하고 검증합니다.
#[tauri::command]
async fn check_auto_login(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<serde_json::Value, String> {
    println!("[Command] check_auto_login called");
    
    // 1. Load cookies from Store
    let store = app.store("session.json").map_err(|e| {
        println!("[Command] Failed to open store: {}", e);
        format!("Store 열기 실패: {}", e)
    })?;
    
    // Store에서 값 가져오기
    let nid_aut_value = store.get("NID_AUT");
    let nid_ses_value = store.get("NID_SES");
    
    if nid_aut_value.is_none() || nid_ses_value.is_none() {
        println!("[Command] No stored cookies found");
        return Err("저장된 쿠키 없음".to_string());
    }
    
    // serde_json::Value를 String으로 변환
    let nid_aut_str = match nid_aut_value {
        Some(value) => value.as_str()
            .ok_or("NID_AUT가 문자열이 아닙니다")?
            .to_string(),
        None => return Err("NID_AUT가 없습니다".to_string()),
    };
    
    let nid_ses_str = match nid_ses_value {
        Some(value) => value.as_str()
            .ok_or("NID_SES가 문자열이 아닙니다")?
            .to_string(),
        None => return Err("NID_SES가 없습니다".to_string()),
    };
    
    // 2. Verify cookies with Chzzk API
    let cookie_data = state::CookieData {
        nid_aut: nid_aut_str.clone(),
        nid_ses: nid_ses_str.clone(),
    };

    match chzzk::get_profile_id(&cookie_data).await {
        Ok((user_id_hash, nickname)) => {
            println!("[Command] Auto-login successful: {} ({})", nickname, user_id_hash);

            // 3. Update Global State
            {
                let mut cookies = state.cookies.lock().unwrap();
                *cookies = Some(cookie_data);
            }
            {
                let mut status = state.login_status.lock().unwrap();
                *status = true;
            }
            {
                let mut hash = state.user_id_hash.lock().unwrap();
                *hash = Some(user_id_hash.clone());
            }

            // 4. Return user info
            Ok(serde_json::json!({
                "success": true,
                "nickname": nickname,
                "userIdHash": user_id_hash
            }))
        },
        Err(e) => {
            println!("[Command] Auto-login verification failed: {}", e);
            // Clear invalid cookies
            let _ = store.delete("NID_AUT");
            let _ = store.delete("NID_SES");
            let _ = store.save();
            Err(format!("자동 로그인 실패: {}", e))
        }
    }
}

/// 쿠키를 Store에 저장합니다.
#[tauri::command]
async fn save_cookies(
    app: tauri::AppHandle,
    nid_aut: String,
    nid_ses: String,
) -> Result<(), String> {
    println!("[Command] save_cookies called");
    
    let store = app.store("session.json").map_err(|e| {
        format!("Store 열기 실패: {}", e)
    })?;
    
    store.set("NID_AUT", serde_json::json!(nid_aut));
    store.set("NID_SES", serde_json::json!(nid_ses));
    
    store.save().map_err(|e| {
        format!("Store 저장 실패: {}", e)
    })?;
    
    println!("[Command] Cookies saved successfully");
    Ok(())
}

/// Store에서 저장된 쿠키를 가져옵니다.
#[tauri::command]
async fn get_stored_cookies(
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let store = app.store("session.json").map_err(|e| {
        format!("Store 열기 실패: {}", e)
    })?;
    
    let nid_aut = store.get("NID_AUT");
    let nid_ses = store.get("NID_SES");
    
    if nid_aut.is_none() || nid_ses.is_none() {
        return Err("저장된 쿠키 없음".to_string());
    }
    
    Ok(serde_json::json!({
        "NID_AUT": nid_aut,
        "NID_SES": nid_ses
    }))
}

#[tauri::command]
async fn manual_login(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    nid_aut: String,
    nid_ses: String,
) -> Result<(), String> {
    println!("[Command] manual_login called");
    
    // 1. Verify cookies with Chzzk API
    let cookie_data = state::CookieData {
        nid_aut: nid_aut.clone(),
        nid_ses: nid_ses.clone(),
    };

    match chzzk::get_profile_id(&cookie_data).await {
        Ok((user_id_hash, nickname)) => {
            println!("[Command] Login verified: {} ({})", nickname, user_id_hash);

            // 2. Update Global State
            {
                let mut cookies = state.cookies.lock().unwrap();
                *cookies = Some(cookie_data);
            }
            {
                let mut status = state.login_status.lock().unwrap();
                *status = true;
            }
            {
                let mut hash = state.user_id_hash.lock().unwrap();
                *hash = Some(user_id_hash.clone());
            }

            // 3. Emit Success Event
            use tauri::Emitter;
            app.emit("manual-login-success", serde_json::json!({
                "nickname": nickname,
                "userIdHash": user_id_hash
            })).map_err(|e| e.to_string())?;
            
            Ok(())
        },
        Err(e) => {
            println!("[Command] Login verification failed: {}", e);
            Err(format!("로그인 검증 실패: {}", e))
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = Arc::new(AppState::default());
    let server_state = app_state.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 중복 실행 시 기존 창 포커스
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(app_state)
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // 윈도우 닫기 요청 시(X 버튼 등) 앱을 종료하지 않고 숨김
                // 트레이 아이콘을 통해서만 완전히 종료 가능
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            let state = server_state.clone();
            
            // 서버 시작
            tauri::async_runtime::spawn(async move {
                server::start_server(state, handle).await;
            });
            
            // 트레이 아이콘 설정
            use tauri::tray::TrayIconBuilder;
            use tauri::menu::{Menu, MenuItem};
            
            let show_item = MenuItem::with_id(app, "show", "보이기", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            std::process::exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    use tauri::tray::{TrayIconEvent, MouseButton, MouseButtonState};
                    match event {
                        TrayIconEvent::Click { button, button_state, .. } => {
                            if button == MouseButton::Left && button_state == MouseButtonState::Up {
                                if let Some(window) = tray.app_handle().get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)?;
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            check_auto_login,
            save_cookies,
            get_stored_cookies,
            manual_login,
            get_server_port,
            get_app_version,
            updater::check_for_updates,
            updater::open_download_page,
            updater::download_and_install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn get_server_port(state: tauri::State<'_, Arc<AppState>>) -> Result<u16, String> {
    let port = state.port.lock().map_err(|e| e.to_string())?;
    Ok(*port)
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
