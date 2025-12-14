use crate::chzzk::FollowerItem;
use serde::{Deserialize, Serialize};
use std::collections::{HashSet, VecDeque};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CookieData {
    #[serde(rename = "NID_AUT")]
    pub nid_aut: String,
    #[serde(rename = "NID_SES")]
    pub nid_ses: String,
}

#[derive(Debug, Clone)]
pub struct RealFollowerQueueItem {
    pub follower: FollowerItem,
    pub created_at: u128, // Timestamp
}

pub struct AppState {
    pub cookies: Mutex<Option<CookieData>>,
    pub port: Mutex<u16>,
    pub login_status: Mutex<bool>,

    // Cache
    pub user_id_hash: Mutex<Option<String>>,

    // Follower Tracking
    pub test_queue: Mutex<VecDeque<FollowerItem>>,
    pub real_queue: Mutex<VecDeque<RealFollowerQueueItem>>,
    pub known_followers: Mutex<HashSet<String>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            cookies: Mutex::new(None),
            port: Mutex::new(3000),
            login_status: Mutex::new(false),
            user_id_hash: Mutex::new(None),
            test_queue: Mutex::new(VecDeque::new()),
            real_queue: Mutex::new(VecDeque::new()),
            known_followers: Mutex::new(HashSet::new()),
        }
    }
}
