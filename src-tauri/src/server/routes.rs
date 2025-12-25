use super::handlers;
use super::state::ServerState;
use crate::state::AppState;
use axum::{
    http::Method,
    routing::{get, post},
    Router,
};
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

pub async fn start_server(app_state: Arc<AppState>, app_handle: AppHandle) {
    // Find available port starting from 3000
    let port = find_available_port(3000).await;

    // Save port to state
    if let Ok(mut p) = app_state.port.lock() {
        *p = port;
    }

    // 정적 파일 경로 (개발 vs 빌드 환경)
    let resource_base = app_handle.path().resource_dir().ok();

    let possible_paths = [
        // 개발 환경
        std::path::PathBuf::from("../pages"),
        // 빌드 환경 - 직접 pages
        resource_base
            .as_ref()
            .map(|p| p.join("pages"))
            .unwrap_or_default(),
        // 빌드 환경 - _up_ 폴더 내 pages
        resource_base
            .as_ref()
            .map(|p| p.join("_up_").join("pages"))
            .unwrap_or_default(),
        // 빌드 환경 - 리소스 루트에 직접
        resource_base.clone().unwrap_or_default(),
    ];

    let resource_path = possible_paths
        .iter()
        .find(|p| p.join("notifier.html").exists())
        .cloned()
        .unwrap_or_else(|| std::path::PathBuf::from("../pages"));

    let public_path = resource_path.join("public");

    tracing::info!("[Server] Resource path: {:?}", resource_path);
    tracing::info!("[Server] Public path: {:?}", public_path);

    // Build router
    let state = ServerState {
        app_state: app_state.clone(),
        app_handle: app_handle.clone(),
        resource_path: resource_path.clone(),
    };

    let app = Router::new()
        .nest_service("/public", ServeDir::new(&public_path))
        .route("/auth/cookies", post(handlers::receive_cookies))
        .route("/cookies", get(handlers::get_cookies)) // For debugging
        .route(
            "/settings",
            get(handlers::load_settings).post(handlers::save_settings),
        )
        .route("/followers", get(handlers::get_followers))
        .route("/test-follower", post(handlers::test_follower))
        .route("/follower", get(handlers::serve_notifier_html))
        .fallback_service(ServeDir::new(&resource_path))
        .with_state(state)
        .layer(
            CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods([Method::GET, Method::POST])
                .allow_headers(tower_http::cors::Any),
        );

    tracing::info!("Starting server on port {}", port);

    let addr = format!("0.0.0.0:{}", port);
    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            tracing::error!("Failed to bind to port {}: {}", port, e);
            return;
        }
    };

    if let Err(e) = axum::serve(listener, app).await {
        tracing::error!("Server error: {}", e);
    }
}

async fn find_available_port(start: u16) -> u16 {
    for port in start..start + 100 {
        if TcpListener::bind(format!("0.0.0.0:{}", port)).await.is_ok() {
            return port;
        }
    }
    start // Fallback
}
