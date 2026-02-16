use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;

use chrono::Utc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SnapshotMeta {
    pub id: String,
    pub recipe_id: Option<String>,
    pub created_at: String,
    pub config_path: String,
    pub source: String,
    pub can_rollback: bool,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct SnapshotIndex {
    pub items: Vec<SnapshotMeta>,
}

pub fn list_snapshots(path: &std::path::Path) -> Result<SnapshotIndex, String> {
    if !path.exists() {
        return Ok(SnapshotIndex { items: Vec::new() });
    }
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut text = String::new();
    file.read_to_string(&mut text).map_err(|e| e.to_string())?;
    if text.trim().is_empty() {
        return Ok(SnapshotIndex { items: Vec::new() });
    }
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

pub fn write_snapshots(path: &std::path::Path, index: &SnapshotIndex) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "invalid metadata path".to_string())?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut file = File::create(path).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(index).map_err(|e| e.to_string())?;
    file.write_all(text.as_bytes()).map_err(|e| e.to_string())
}

pub fn add_snapshot(
    paths: &PathBuf,
    metadata_path: &PathBuf,
    recipe_id: Option<String>,
    source: &str,
    rollbackable: bool,
    current_config: &str,
) -> Result<SnapshotMeta, String> {
    fs::create_dir_all(paths).map_err(|e| e.to_string())?;

    let index = list_snapshots(metadata_path).unwrap_or_default();
    let ts = Utc::now().format("%Y-%m-%dT%H-%M-%S").to_string();
    let snapshot_recipe_id = recipe_id.clone().unwrap_or_else(|| "manual".into());
    let id = format!("{}-{}", ts, snapshot_recipe_id);
    let snapshot_path = paths.join(format!("{}.json", id.replace(':', "-")));
    fs::write(&snapshot_path, current_config).map_err(|e| e.to_string())?;

    let mut next = index;
    next.items.push(SnapshotMeta {
        id: id.clone(),
        recipe_id,
        created_at: ts.clone(),
        config_path: snapshot_path.to_string_lossy().to_string(),
        source: source.to_string(),
        can_rollback: rollbackable,
    });
    next.items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    if next.items.len() > 200 {
        next.items.truncate(200);
    }
    write_snapshots(metadata_path, &next)?;

    let returned = Some(snapshot_recipe_id.clone());

    Ok(SnapshotMeta {
        id,
        recipe_id: returned,
        created_at: ts,
        config_path: snapshot_path.to_string_lossy().to_string(),
        source: source.to_string(),
        can_rollback: rollbackable,
    })
}

pub fn read_snapshot(path: &str) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}
