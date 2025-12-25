use crate::state::AppState;
use std::sync::Arc;
use tauri::AppHandle;

#[derive(Clone)]
pub struct ServerState {
    pub app_state: Arc<AppState>,
    pub app_handle: AppHandle,
    pub resource_path: std::path::PathBuf,
}
