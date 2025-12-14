//! GitHub API 기반 자동 업데이트 모듈
//! 
//! GitHub Releases에서 최신 버전을 확인하고 업데이트 알림을 제공합니다.

use serde::{Deserialize, Serialize};
use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};

/// GitHub 저장소 정보
const GITHUB_OWNER: &str = "minseok7891";
const GITHUB_REPO: &str = "fazzk";

/// 현재 앱 버전 (Cargo.toml에서 가져옴)
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// GitHub Release 응답 구조체
#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    published_at: Option<String>,
    assets: Vec<GitHubAsset>,
}

/// GitHub Asset 구조체
#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

/// 업데이트 확인 결과
#[derive(Debug, Serialize)]
pub struct UpdateCheckResult {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub download_url: Option<String>,
    pub release_url: Option<String>,
    pub release_notes: Option<String>,
    pub published_at: Option<String>,
    pub error: Option<String>,
}

/// Semantic Version 비교
/// 
/// v1 > v2 이면 1, v1 < v2 이면 -1, 같으면 0
fn compare_versions(v1: &str, v2: &str) -> i32 {
    let parse = |v: &str| -> Vec<u32> {
        v.trim_start_matches('v')
            .split('.')
            .filter_map(|s| s.parse().ok())
            .collect()
    };
    
    let parts1 = parse(v1);
    let parts2 = parse(v2);
    
    for i in 0..3 {
        let p1 = parts1.get(i).copied().unwrap_or(0);
        let p2 = parts2.get(i).copied().unwrap_or(0);
        
        if p1 > p2 { return 1; }
        if p1 < p2 { return -1; }
    }
    0
}

/// GitHub에서 최신 릴리즈 정보 가져오기
async fn get_latest_release() -> Result<GitHubRelease, String> {
    let url = format!(
        "https://api.github.com/repos/{}/{}/releases/latest",
        GITHUB_OWNER, GITHUB_REPO
    );
    
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static("Fazzk-Tauri-Updater"));
    headers.insert(
        "Accept",
        HeaderValue::from_static("application/vnd.github.v3+json"),
    );
    
    let client = reqwest::Client::new();
    let res = client
        .get(&url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| format!("네트워크 오류: {}", e))?;
    
    if !res.status().is_success() {
        return Err(format!("GitHub API 오류: {}", res.status()));
    }
    
    res.json::<GitHubRelease>()
        .await
        .map_err(|e| format!("응답 파싱 오류: {}", e))
}

/// 업데이트 확인 (Tauri Command)
#[tauri::command]
pub async fn check_for_updates() -> UpdateCheckResult {
    let current_version = format!("v{}", CURRENT_VERSION);
    
    match get_latest_release().await {
        Ok(release) => {
            let latest_version = release.tag_name.clone();
            
            if compare_versions(&latest_version, &current_version) > 0 {
                // 업데이트 있음
                let download_url = release
                    .assets
                    .iter()
                    .find(|a| a.name.ends_with(".exe") || a.name.ends_with(".msi"))
                    .map(|a| a.browser_download_url.clone())
                    .unwrap_or_else(|| release.html_url.clone());
                
                println!("[Updater] 업데이트 발견: {} -> {}", current_version, latest_version);
                
                UpdateCheckResult {
                    has_update: true,
                    current_version,
                    latest_version: Some(latest_version),
                    download_url: Some(download_url),
                    release_url: Some(release.html_url),
                    release_notes: release.body,
                    published_at: release.published_at,
                    error: None,
                }
            } else {
                // 최신 버전 사용 중
                println!("[Updater] 최신 버전 사용 중: {}", current_version);
                
                UpdateCheckResult {
                    has_update: false,
                    current_version,
                    latest_version: Some(latest_version),
                    download_url: None,
                    release_url: None,
                    release_notes: None,
                    published_at: None,
                    error: None,
                }
            }
        }
        Err(e) => {
            eprintln!("[Updater] 업데이트 확인 실패: {}", e);
            
            UpdateCheckResult {
                has_update: false,
                current_version,
                latest_version: None,
                download_url: None,
                release_url: None,
                release_notes: None,
                published_at: None,
                error: Some(e),
            }
        }
    }
}

/// 다운로드 페이지 열기 (Tauri Command)
#[tauri::command]
pub async fn open_download_page(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/C", "start", &url])
        .spawn()
        .map_err(|e| format!("브라우저 열기 실패: {}", e))?;
    
    #[cfg(not(target_os = "windows"))]
    std::process::Command::new("xdg-open")
        .arg(&url)
        .spawn()
        .map_err(|e| format!("브라우저 열기 실패: {}", e))?;
    
    Ok(())
}


use tauri::{AppHandle, Emitter};


#[derive(Clone, Serialize)]
struct ProgressPayload {
    percent: u64,
    total: u64,
    current: u64,
}

/// 앱 내에서 업데이트 직접 다운로드 및 설치
#[tauri::command]
pub async fn download_and_install_update(app: AppHandle, url: String) -> Result<(), String> {
    println!("[Updater] 다운로드 시작: {}", url);
    
    // 1. Temp 파일 생성
    let temp_dir = std::env::temp_dir();
    let file_name = url.split('/').last().unwrap_or("fazzk_update.exe");
    let file_path = temp_dir.join(file_name);
    
    println!("[Updater] 저장 경로: {:?}", file_path);
    
    // 2. reqwest로 다운로드
    let client = reqwest::Client::new();
    let res = client.get(&url)
        .header(USER_AGENT, "Fazzk-Updater")
        .send()
        .await
        .map_err(|e| format!("네트워크 요청 실패: {}", e))?;
        
    let total_size = res.content_length().unwrap_or(0);
    let bytes = res.bytes().await.map_err(|e| format!("다운로드 실패: {}", e))?;
    
    std::fs::write(&file_path, &bytes).map_err(|e| format!("파일 쓰기 실패: {}", e))?;
    
    app.emit("update-progress", ProgressPayload { 
        percent: 100, 
        total: total_size, 
        current: bytes.len() as u64 
    }).unwrap_or_default();
    
    // 단순하게 std::process::Command 사용 (Windows)
    std::process::Command::new(&file_path)
        .spawn()
        .map_err(|e| format!("설치 프로그램 실행 실패: {}", e))?;
        
    // 4. 앱 종료 (설치 진행을 위해)
    std::process::exit(0);
}
