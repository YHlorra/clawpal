use std::env;
use std::path::{Path, PathBuf};

use dirs::home_dir;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenClawPaths {
    pub openclaw_dir: PathBuf,
    pub config_path: PathBuf,
    pub base_dir: PathBuf,
    pub clawpal_dir: PathBuf,
    pub history_dir: PathBuf,
    pub metadata_path: PathBuf,
}

fn expand_user_path(raw: &str) -> PathBuf {
    if let Some(rest) = raw.strip_prefix("~/") {
        if let Some(home) = home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(raw)
}

fn env_path(name: &str) -> Option<PathBuf> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(|value| expand_user_path(&value))
}

pub fn resolve_paths() -> OpenClawPaths {
    let home = home_dir().unwrap_or_else(|| Path::new(".").to_path_buf());
    let openclaw_dir =
        env_path("CLAWPAL_OPENCLAW_DIR").or_else(|| env_path("OPENCLAW_HOME")).unwrap_or_else(|| home.join(".openclaw"));
    let clawpal_dir =
        env_path("CLAWPAL_DATA_DIR").unwrap_or_else(|| openclaw_dir.join(".clawpal"));
    let config_path = openclaw_dir.join("openclaw.json");
    let history_dir = clawpal_dir.join("history");
    let metadata_path = clawpal_dir.join("metadata.json");

    OpenClawPaths {
        openclaw_dir: openclaw_dir.clone(),
        config_path,
        base_dir: openclaw_dir.clone(),
        clawpal_dir,
        history_dir,
        metadata_path,
    }
}
