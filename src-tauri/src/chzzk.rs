use reqwest::header::{HeaderMap, HeaderValue, COOKIE, USER_AGENT};
use serde::{Deserialize, Serialize};
use crate::state::CookieData;

#[derive(Debug, Deserialize)]
struct UserStatusResponse {
    code: i32,
    message: Option<String>,
    content: Option<UserStatusContent>,
}

#[derive(Debug, Deserialize)]
struct UserStatusContent {
    #[serde(rename = "userIdHash")]
    user_id_hash: String,
    nickname: String,
}

pub async fn get_profile_id(cookies: &CookieData) -> Result<(String, String), String> {
    let url = "https://comm-api.game.naver.com/nng_main/v1/user/getUserStatus";
    
    let cookie_str = format!("NID_AUT={}; NID_SES={}", cookies.nid_aut, cookies.nid_ses);
    
    let mut headers = HeaderMap::new();
    headers.insert(COOKIE, HeaderValue::from_str(&cookie_str).map_err(|e| e.to_string())?);
    headers.insert(USER_AGENT, HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"));

    let client = reqwest::Client::new();
    let res = client.get(url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| e.to_string())?;
        
    if !res.status().is_success() {
        return Err(format!("API Error: {}", res.status()));
    }
    
    let body: UserStatusResponse = res.json().await.map_err(|e| e.to_string())?;
    
    if body.code == 200 {
        if let Some(content) = body.content {
            return Ok((content.user_id_hash, content.nickname));
        }
    }
    
    Err(format!("Auth Failed: {:?}", body.message))
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(default)]
pub struct FollowerResponse {
    pub code: i32,
    pub message: Option<String>,
    pub content: Option<FollowerContent>,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(default)]
pub struct FollowerContent {
    pub data: Vec<FollowerItem>,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(default)]
pub struct FollowerItem {
    pub user: User,
    #[serde(rename = "followingSince")]
    pub following_since: String,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(default)]
pub struct User {
    #[serde(rename = "userIdHash")]
    pub user_id_hash: String,
    pub nickname: String,
    #[serde(rename = "profileImageUrl")]
    pub profile_image_url: Option<String>,
}

pub async fn get_followers(cookies: &CookieData, user_id_hash: &str) -> Result<FollowerResponse, String> {
    let url = format!("https://api.chzzk.naver.com/manage/v1/channels/{}/followers?page=0&size=10&userNickname=", user_id_hash);
    
    let cookie_str = format!("NID_AUT={}; NID_SES={}", cookies.nid_aut, cookies.nid_ses);
    
    let mut headers = HeaderMap::new();
    headers.insert(COOKIE, HeaderValue::from_str(&cookie_str).map_err(|e| e.to_string())?);
    headers.insert(USER_AGENT, HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"));

    let client = reqwest::Client::new();
    let res = client.get(url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| e.to_string())?;
        
    if !res.status().is_success() {
        return Err(format!("API Error: {}", res.status()));
    }
    
    let body_text = res.text().await.map_err(|e| e.to_string())?;
    println!("[Chzzk API] Raw Response: {}", &body_text.chars().take(500).collect::<String>());
    
    let body: FollowerResponse = serde_json::from_str(&body_text).map_err(|e| {
        eprintln!("[Chzzk API] Parse Error: {}", e);
        e.to_string()
    })?;
    Ok(body)
}
