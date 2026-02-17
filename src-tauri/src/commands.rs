use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::{fs, process::Command, time::{SystemTime, UNIX_EPOCH}};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::config_io::{ensure_dirs, read_openclaw_config, write_json, write_text};
use crate::doctor::{apply_auto_fixes, run_doctor, DoctorReport};
use crate::history::{add_snapshot, list_snapshots, read_snapshot};
use crate::models::resolve_paths;
use crate::recipe::{
    load_recipes_with_fallback,
    collect_change_paths,
    build_candidate_config,
    find_recipe_with_source,
    format_diff,
    ApplyResult,
    PreviewResult,
    validate,
};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatus {
    pub healthy: bool,
    pub config_path: String,
    pub openclaw_dir: String,
    pub clawpal_dir: String,
    pub openclaw_version: String,
    pub active_agents: u32,
    pub snapshots: usize,
    pub channels: ChannelSummary,
    pub models: ModelSummary,
    pub memory: MemorySummary,
    pub sessions: SessionSummary,
    pub openclaw_update: OpenclawUpdateCheck,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenclawUpdateCheck {
    pub installed_version: String,
    pub latest_version: Option<String>,
    pub upgrade_available: bool,
    pub channel: Option<String>,
    pub details: Option<String>,
    pub source: String,
    pub checked_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCatalogProviderCache {
    pub cli_version: String,
    pub updated_at: u64,
    pub providers: Vec<ModelCatalogProvider>,
    pub source: String,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenclawCommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractModelProfilesResult {
    pub created: usize,
    pub reused: usize,
    pub skipped_invalid: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractModelProfileEntry {
    pub provider: String,
    pub model: String,
    pub source: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenclawUpdateCache {
    pub checked_at: u64,
    pub latest_version: Option<String>,
    pub channel: Option<String>,
    pub details: Option<String>,
    pub source: String,
    pub installed_version: Option<String>,
    pub ttl_seconds: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSummary {
    pub global_default_model: Option<String>,
    pub agent_overrides: Vec<String>,
    pub channel_overrides: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelSummary {
    pub configured_channels: usize,
    pub channel_model_overrides: usize,
    pub channel_examples: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryFileSummary {
    pub path: String,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySummary {
    pub file_count: usize,
    pub total_bytes: u64,
    pub files: Vec<MemoryFileSummary>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryFile {
    pub path: String,
    pub relative_path: String,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionSummary {
    pub agent: String,
    pub session_files: usize,
    pub archive_files: usize,
    pub total_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionFile {
    pub path: String,
    pub relative_path: String,
    pub agent: String,
    pub kind: String,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub total_session_files: usize,
    pub total_archive_files: usize,
    pub total_bytes: u64,
    pub by_agent: Vec<AgentSessionSummary>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModelProfile {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub model: String,
    #[serde(default)]
    pub auth_ref: String,
    #[serde(default)]
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub description: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModelCatalogModel {
    pub id: String,
    pub name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModelCatalogProvider {
    pub provider: String,
    pub base_url: Option<String>,
    pub models: Vec<ModelCatalogModel>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelNode {
    pub path: String,
    pub channel_type: Option<String>,
    pub mode: Option<String>,
    pub allowlist: Vec<String>,
    pub model: Option<String>,
    pub has_model_field: bool,
    pub display_name: Option<String>,
    pub name_status: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordGuildChannel {
    pub guild_id: String,
    pub guild_name: String,
    pub channel_id: String,
    pub channel_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderAuthSuggestion {
    pub auth_ref: Option<String>,
    pub has_key: bool,
    pub source: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelBinding {
    pub scope: String,
    pub scope_id: String,
    pub model_profile_id: Option<String>,
    pub model_value: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    pub id: String,
    pub recipe_id: Option<String>,
    pub created_at: String,
    pub source: String,
    pub can_rollback: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rollback_of: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPage {
    pub items: Vec<HistoryItem>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FixResult {
    pub ok: bool,
    pub applied: Vec<String>,
    pub remaining_issues: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentOverview {
    pub id: String,
    pub name: Option<String>,
    pub emoji: Option<String>,
    pub model: Option<String>,
    pub channels: Vec<String>,
    pub online: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusLight {
    pub healthy: bool,
    pub active_agents: u32,
    pub global_default_model: Option<String>,
}

/// Fast status: reads config + quick TCP probe of gateway port.
#[tauri::command]
pub fn get_status_light() -> Result<StatusLight, String> {
    let paths = resolve_paths();
    let cfg = read_openclaw_config(&paths)?;
    let active_agents = cfg
        .get("agents")
        .and_then(|a| a.get("list"))
        .and_then(|a| a.as_array())
        .map(|a| a.len() as u32)
        .unwrap_or(0);
    let global_default_model = cfg
        .pointer("/agents/defaults/model")
        .and_then(read_model_value)
        .or_else(|| cfg.pointer("/agents/default/model").and_then(read_model_value));

    // Quick gateway health: TCP connect to gateway port
    let gateway_port = cfg.pointer("/gateway/port")
        .and_then(Value::as_u64)
        .unwrap_or(8080) as u16;
    let healthy = std::net::TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], gateway_port)),
        std::time::Duration::from_millis(500),
    ).is_ok();

    Ok(StatusLight {
        healthy,
        active_agents,
        global_default_model,
    })
}

/// Returns cached catalog instantly without calling CLI. Returns empty if no cache.
#[tauri::command]
pub fn get_cached_model_catalog() -> Result<Vec<ModelCatalogProvider>, String> {
    let paths = resolve_paths();
    let cache_path = model_catalog_cache_path(&paths);
    if let Some(cached) = read_model_catalog_cache(&cache_path) {
        if cached.error.is_none() && !cached.providers.is_empty() {
            return Ok(cached.providers);
        }
    }
    Ok(Vec::new())
}

/// Refresh catalog from CLI and update cache. Returns the fresh catalog.
#[tauri::command]
pub fn refresh_model_catalog() -> Result<Vec<ModelCatalogProvider>, String> {
    let paths = resolve_paths();
    let cfg = read_openclaw_config(&paths)?;
    load_model_catalog(&paths, &cfg)
}

#[tauri::command]
pub fn get_system_status() -> Result<SystemStatus, String> {
    let paths = resolve_paths();
    ensure_dirs(&paths)?;
    let cfg = read_openclaw_config(&paths)?;
    let active_agents = cfg
        .get("agents")
        .and_then(|a| a.get("list"))
        .and_then(|a| a.as_array())
        .map(|a| a.len() as u32)
        .unwrap_or(0);
    let snapshots = list_snapshots(&paths.metadata_path).unwrap_or_default().items.len();
    let model_summary = collect_model_summary(&cfg);
    let channel_summary = collect_channel_summary(&cfg);
    let memory = collect_memory_overview(&paths.base_dir);
    let sessions = collect_session_overview(&paths.base_dir);
    let openclaw_version = resolve_openclaw_version();
    let openclaw_update = check_openclaw_update_cached(&paths, false).unwrap_or_else(|_| OpenclawUpdateCheck {
        installed_version: openclaw_version.clone(),
        latest_version: None,
        upgrade_available: false,
        channel: None,
        details: Some("update status unavailable".into()),
        source: "unknown".into(),
        checked_at: format_timestamp_from_unix(unix_timestamp_secs()),
    });
    Ok(SystemStatus {
        healthy: true,
        config_path: paths.config_path.to_string_lossy().to_string(),
        openclaw_dir: paths.openclaw_dir.to_string_lossy().to_string(),
        clawpal_dir: paths.clawpal_dir.to_string_lossy().to_string(),
        openclaw_version,
        active_agents,
        snapshots,
        channels: channel_summary,
        models: model_summary,
        memory,
        sessions,
        openclaw_update,
    })
}

#[tauri::command]
pub fn list_model_profiles() -> Result<Vec<ModelProfile>, String> {
    let paths = resolve_paths();
    Ok(load_model_profiles(&paths))
}

#[tauri::command]
pub fn list_model_catalog() -> Result<Vec<ModelCatalogProvider>, String> {
    let paths = resolve_paths();
    let cfg = read_openclaw_config(&paths)?;
    load_model_catalog(&paths, &cfg)
}

#[tauri::command]
pub fn check_openclaw_update() -> Result<OpenclawUpdateCheck, String> {
    let paths = resolve_paths();
    check_openclaw_update_cached(&paths, true)
}

#[tauri::command]
pub fn extract_model_profiles_from_config() -> Result<ExtractModelProfilesResult, String> {
    let paths = resolve_paths();
    let cfg = read_openclaw_config(&paths)?;
    let profiles = load_model_profiles(&paths);
    let bindings = collect_model_bindings(&cfg, &profiles);
    let mut created = 0usize;
    let mut reused = 0usize;
    let mut skipped_invalid = 0usize;
    let mut seen = HashSet::new();

    let mut next_profiles = profiles;
    let mut model_profile_map: HashMap<String, String> = HashMap::new();
    for profile in &next_profiles {
        model_profile_map.insert(normalize_model_ref(&profile_to_model_value(profile)), profile.id.clone());
    }

    for binding in bindings {
        let scope_label = match binding.scope.as_str() {
            "global" => "global".to_string(),
            "agent" => format!("agent:{}", binding.scope_id),
            "channel" => format!("channel:{}", binding.scope_id),
            _ => binding.scope_id,
        };
        let Some(model_ref) = binding.model_value else {
            continue;
        };
        let model_ref = normalize_model_ref(&model_ref);
        if model_ref.trim().is_empty() {
            continue;
        }
        if model_profile_map.contains_key(&model_ref) || seen.contains(&model_ref) {
            reused += 1;
            continue;
        }
        let mut parts = model_ref.splitn(2, '/');
        let provider = parts.next().unwrap_or("").trim();
        let model = parts.next().unwrap_or("").trim();
        if provider.is_empty() || model.is_empty() {
            skipped_invalid += 1;
            continue;
        }
        let auth_ref = resolve_auth_ref_for_provider(&cfg, provider)
            .unwrap_or_else(|| format!("{provider}:default"));
        let base_url = resolve_model_provider_base_url(&cfg, provider);
        let profile = ModelProfile {
            id: uuid::Uuid::new_v4().to_string(),
            name: format!("{scope_label} model profile"),
            provider: provider.to_string(),
            model: model.to_string(),
            auth_ref,
            api_key: None,
            base_url,
            description: Some(format!("Extracted from config ({scope_label})")),
            enabled: true,
        };
        let key = profile_to_model_value(&profile);
        model_profile_map.insert(normalize_model_ref(&key), profile.id.clone());
        next_profiles.push(profile);
        seen.insert(model_ref);
        created += 1;
    }

    if created > 0 {
        save_model_profiles(&paths, &next_profiles)?;
    }

    Ok(ExtractModelProfilesResult {
        created,
        reused,
        skipped_invalid,
    })
}

#[tauri::command]
pub fn upsert_model_profile(mut profile: ModelProfile) -> Result<ModelProfile, String> {
    if profile.provider.trim().is_empty() || profile.model.trim().is_empty() {
        return Err("provider and model are required".into());
    }
    if profile.name.trim().is_empty() {
        profile.name = format!("{}/{}", profile.provider, profile.model);
    }
    let has_api_key = profile.api_key.as_ref().is_some_and(|k| !k.trim().is_empty());
    if profile.auth_ref.trim().is_empty() && !has_api_key {
        // Auto-resolve auth ref from openclaw config or env vars
        let paths_tmp = resolve_paths();
        if let Ok(cfg) = read_openclaw_config(&paths_tmp) {
            if let Some(auth_ref) = resolve_auth_ref_for_provider(&cfg, &profile.provider) {
                profile.auth_ref = auth_ref;
            }
        }
        if profile.auth_ref.trim().is_empty() {
            // Try env var convention
            let provider_upper = profile.provider.trim().to_uppercase().replace('-', "_");
            for suffix in ["_API_KEY", "_KEY", "_TOKEN"] {
                let env_name = format!("{provider_upper}{suffix}");
                if std::env::var(&env_name).map(|v| !v.trim().is_empty()).unwrap_or(false) {
                    profile.auth_ref = env_name;
                    break;
                }
            }
        }
        if profile.auth_ref.trim().is_empty() {
            return Err("API key or auth env var is required".into());
        }
    }
    let paths = resolve_paths();
    let mut profiles = load_model_profiles(&paths);
    if profile.id.trim().is_empty() {
        profile.id = uuid::Uuid::new_v4().to_string();
    }
    let id = profile.id.clone();
    if let Some(existing) = profiles.iter_mut().find(|p| p.id == id) {
        *existing = profile.clone();
    } else {
        profiles.push(profile.clone());
    }
    save_model_profiles(&paths, &profiles)?;
    Ok(profile)
}

#[tauri::command]
pub fn delete_model_profile(profile_id: String) -> Result<bool, String> {
    let paths = resolve_paths();
    let mut profiles = load_model_profiles(&paths);
    let before = profiles.len();
    profiles.retain(|p| p.id != profile_id);
    if profiles.len() == before {
        return Ok(false);
    }
    save_model_profiles(&paths, &profiles)?;
    Ok(true)
}

#[tauri::command]
pub fn resolve_provider_auth(provider: String) -> Result<ProviderAuthSuggestion, String> {
    let provider_trimmed = provider.trim();
    if provider_trimmed.is_empty() {
        return Ok(ProviderAuthSuggestion { auth_ref: None, has_key: false, source: String::new() });
    }
    let paths = resolve_paths();
    let cfg = read_openclaw_config(&paths)?;

    // 1. Check openclaw config auth profiles
    if let Some(auth_ref) = resolve_auth_ref_for_provider(&cfg, provider_trimmed) {
        return Ok(ProviderAuthSuggestion {
            auth_ref: Some(auth_ref),
            has_key: true,
            source: "openclaw auth profile".into(),
        });
    }

    // 2. Check env vars
    let provider_upper = provider_trimmed.to_uppercase().replace('-', "_");
    for suffix in ["_API_KEY", "_KEY", "_TOKEN"] {
        let env_name = format!("{provider_upper}{suffix}");
        if std::env::var(&env_name).map(|v| !v.trim().is_empty()).unwrap_or(false) {
            return Ok(ProviderAuthSuggestion {
                auth_ref: Some(env_name),
                has_key: true,
                source: "environment variable".into(),
            });
        }
    }

    // 3. Check existing model profiles for this provider
    let profiles = load_model_profiles(&paths);
    for p in &profiles {
        if p.provider.eq_ignore_ascii_case(provider_trimmed) {
            let key = resolve_profile_api_key(p, &paths.base_dir);
            if !key.is_empty() {
                let auth_ref = if !p.auth_ref.trim().is_empty() {
                    Some(p.auth_ref.clone())
                } else {
                    None
                };
                return Ok(ProviderAuthSuggestion {
                    auth_ref,
                    has_key: true,
                    source: format!("existing profile {}/{}", p.provider, p.model),
                });
            }
        }
    }

    Ok(ProviderAuthSuggestion { auth_ref: None, has_key: false, source: String::new() })
}

#[tauri::command]
pub fn list_channels() -> Result<Vec<ChannelNode>, String> {
    let paths = resolve_paths();
    let cfg = read_openclaw_config(&paths)?;
    let mut nodes = collect_channel_nodes(&cfg);
    enrich_channel_display_names(&paths, &cfg, &mut nodes)?;
    Ok(nodes)
}

#[tauri::command]
pub fn list_channels_minimal() -> Result<Vec<ChannelNode>, String> {
    let paths = resolve_paths();
    let cfg = read_openclaw_config(&paths)?;
    let nodes = collect_channel_nodes(&cfg);
    Ok(nodes)
}

/// Read Discord guild/channels from persistent cache. Fast, no subprocess.
#[tauri::command]
pub fn list_discord_guild_channels() -> Result<Vec<DiscordGuildChannel>, String> {
    let paths = resolve_paths();
    let cache_file = paths.clawpal_dir.join("discord-guild-channels.json");
    if cache_file.exists() {
        let text = fs::read_to_string(&cache_file).map_err(|e| e.to_string())?;
        let entries: Vec<DiscordGuildChannel> = serde_json::from_str(&text).unwrap_or_default();
        return Ok(entries);
    }
    Ok(Vec::new())
}

/// Resolve Discord guild/channel names via openclaw CLI and persist to cache.
#[tauri::command]
pub async fn refresh_discord_guild_channels() -> Result<Vec<DiscordGuildChannel>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let paths = resolve_paths();
        ensure_dirs(&paths)?;
        let cfg = read_openclaw_config(&paths)?;

        let guilds = cfg
            .get("channels")
            .and_then(|c| c.get("discord"))
            .and_then(|d| d.get("guilds"))
            .and_then(Value::as_object);

        let Some(guilds) = guilds else {
            return Ok(Vec::new());
        };

        let mut entries: Vec<DiscordGuildChannel> = Vec::new();
        let mut channel_ids: Vec<String> = Vec::new();

        for (guild_id, guild_val) in guilds {
            let guild_name = guild_val
                .get("slug")
                .or_else(|| guild_val.get("name"))
                .and_then(Value::as_str)
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| guild_id.clone());

            if let Some(channels) = guild_val.get("channels").and_then(Value::as_object) {
                for (channel_id, _channel_val) in channels {
                    channel_ids.push(channel_id.clone());
                    entries.push(DiscordGuildChannel {
                        guild_id: guild_id.clone(),
                        guild_name: guild_name.clone(),
                        channel_id: channel_id.clone(),
                        channel_name: channel_id.clone(),
                    });
                }
            }
        }

        if !channel_ids.is_empty() {
            let mut args = vec![
                "channels", "resolve", "--json",
                "--channel", "discord",
                "--kind", "auto",
            ];
            let id_refs: Vec<&str> = channel_ids.iter().map(String::as_str).collect();
            args.extend_from_slice(&id_refs);

            if let Ok(output) = run_openclaw_raw(&args) {
                if let Some(name_map) = parse_resolve_name_map(&output.stdout) {
                    for entry in &mut entries {
                        if let Some(name) = name_map.get(&entry.channel_id) {
                            entry.channel_name = name.clone();
                        }
                    }
                }
            }
        }

        // Persist to cache
        let cache_file = paths.clawpal_dir.join("discord-guild-channels.json");
        let json = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
        write_text(&cache_file, &json)?;

        Ok(entries)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn update_channel_config(
    path: String,
    channel_type: Option<String>,
    mode: Option<String>,
    allowlist: Vec<String>,
    model: Option<String>,
) -> Result<bool, String> {
    if path.trim().is_empty() {
        return Err("channel path is required".into());
    }
    let paths = resolve_paths();
    let mut cfg = read_openclaw_config(&paths)?;
    let current = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    set_nested_value(&mut cfg, &format!("{path}.type"), channel_type.map(Value::String))?;
    set_nested_value(&mut cfg, &format!("{path}.mode"), mode.map(Value::String))?;
    let allowlist_values = allowlist
        .into_iter()
        .map(Value::String)
        .collect::<Vec<_>>();
    set_nested_value(&mut cfg, &format!("{path}.allowlist"), Some(Value::Array(allowlist_values)))?;
    set_nested_value(&mut cfg, &format!("{path}.model"), model.map(Value::String))?;
    write_config_with_snapshot(&paths, &current, &cfg, "update-channel")?;
    Ok(true)
}

/// List current channel→agent bindings from config.
#[tauri::command]
pub fn list_bindings() -> Result<Vec<Value>, String> {
    let paths = resolve_paths();
    let cfg = read_openclaw_config(&paths)?;
    let bindings = cfg
        .get("bindings")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(bindings)
}

/// Assign a Discord channel to an agent (modifies the `bindings` array).
/// Pass `agent_id = None` or empty to remove the binding (revert to default agent).
#[tauri::command]
pub fn assign_channel_agent(
    channel_type: String,
    peer_id: String,
    agent_id: Option<String>,
) -> Result<bool, String> {
    let paths = resolve_paths();
    let mut cfg = read_openclaw_config(&paths)?;
    let current = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;

    let bindings = cfg
        .get_mut("bindings")
        .and_then(Value::as_array_mut);

    let agent_id = agent_id
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    if let Some(arr) = bindings {
        // Remove existing binding for this peer
        arr.retain(|b| {
            let m = b.get("match");
            let ch = m.and_then(|m| m.get("channel")).and_then(Value::as_str);
            let pid = m.and_then(|m| m.pointer("/peer/id")).and_then(Value::as_str);
            !(ch == Some(&channel_type) && pid == Some(&peer_id))
        });

        // Add new binding if agent_id is provided
        if let Some(ref aid) = agent_id {
            arr.push(serde_json::json!({
                "agentId": aid,
                "match": {
                    "channel": channel_type,
                    "peer": {
                        "id": peer_id,
                        "kind": "channel"
                    }
                }
            }));
        }
    } else if let Some(ref aid) = agent_id {
        // No bindings array yet — create one
        cfg.as_object_mut()
            .ok_or("config is not an object")?
            .insert("bindings".into(), serde_json::json!([
                {
                    "agentId": aid,
                    "match": {
                        "channel": channel_type,
                        "peer": {
                            "id": peer_id,
                            "kind": "channel"
                        }
                    }
                }
            ]));
    }

    write_config_with_snapshot(&paths, &current, &cfg, "assign-channel-agent")?;
    Ok(true)
}

#[tauri::command]
pub fn delete_channel_node(path: String) -> Result<bool, String> {
    if path.trim().is_empty() {
        return Err("channel path is required".into());
    }
    let paths = resolve_paths();
    let mut cfg = read_openclaw_config(&paths)?;
    let current = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    let before = cfg.to_string();
    set_nested_value(&mut cfg, &path, None)?;
    if cfg.to_string() == before {
        return Ok(false);
    }
    write_config_with_snapshot(&paths, &current, &cfg, "delete-channel")?;
    Ok(true)
}

#[tauri::command]
pub fn set_global_model(profile_id: Option<String>) -> Result<bool, String> {
    let paths = resolve_paths();
    let mut cfg = read_openclaw_config(&paths)?;
    let current = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    let model = resolve_profile_model_value(&paths, profile_id)?;
    set_nested_value(
        &mut cfg,
        "agents.defaults.model",
        model.map(Value::String),
    )?;
    write_config_with_snapshot(&paths, &current, &cfg, "set-global-model")?;
    Ok(true)
}

#[tauri::command]
pub fn set_agent_model(agent_id: String, profile_id: Option<String>) -> Result<bool, String> {
    if agent_id.trim().is_empty() {
        return Err("agent id is required".into());
    }
    let paths = resolve_paths();
    let mut cfg = read_openclaw_config(&paths)?;
    let current = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    let value = resolve_profile_model_value(&paths, profile_id)?;
    set_agent_model_value(&mut cfg, &agent_id, value)?;
    write_config_with_snapshot(&paths, &current, &cfg, "set-agent-model")?;
    Ok(true)
}

#[tauri::command]
pub fn set_channel_model(path: String, profile_id: Option<String>) -> Result<bool, String> {
    if path.trim().is_empty() {
        return Err("channel path is required".into());
    }
    let paths = resolve_paths();
    let mut cfg = read_openclaw_config(&paths)?;
    let current = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    let value = resolve_profile_model_value(&paths, profile_id)?;
    set_nested_value(&mut cfg, &format!("{path}.model"), value.map(Value::String))?;
    write_config_with_snapshot(&paths, &current, &cfg, "set-channel-model")?;
    Ok(true)
}

#[tauri::command]
pub fn list_model_bindings() -> Result<Vec<ModelBinding>, String> {
    let paths = resolve_paths();
    let cfg = read_openclaw_config(&paths)?;
    let profiles = load_model_profiles(&paths);
    Ok(collect_model_bindings(&cfg, &profiles))
}

#[tauri::command]
pub fn list_agent_ids() -> Result<Vec<String>, String> {
    let paths = resolve_paths();
    let cfg = read_openclaw_config(&paths)?;
    Ok(collect_agent_ids(&cfg))
}

#[tauri::command]
pub fn list_agents_overview() -> Result<Vec<AgentOverview>, String> {
    let paths = resolve_paths();
    let cfg = read_openclaw_config(&paths)?;
    let mut agents = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    let default_workspace = cfg.pointer("/agents/defaults/workspace")
        .and_then(Value::as_str)
        .map(|s| expand_tilde(s));

    if let Some(list) = cfg.pointer("/agents/list").and_then(Value::as_array) {
        let channel_nodes = collect_channel_nodes(&cfg);
        for agent in list {
            let id = agent.get("id").and_then(Value::as_str).unwrap_or("agent").to_string();

            // Deduplicate by ID
            if !seen_ids.insert(id.clone()) {
                continue;
            }

            // Read name/emoji from IDENTITY.md in the agent's workspace
            let workspace = agent.get("workspace").and_then(Value::as_str)
                .map(|s| expand_tilde(s))
                .or_else(|| default_workspace.clone());
            let (name, emoji) = workspace.as_ref()
                .and_then(|ws| parse_identity_md(ws))
                .unwrap_or((None, None));

            let model = agent.get("model").and_then(read_model_value)
                .or_else(|| cfg.pointer("/agents/defaults/model").and_then(read_model_value))
                .or_else(|| cfg.pointer("/agents/default/model").and_then(read_model_value));
            let channels: Vec<String> = channel_nodes.iter()
                .map(|ch| ch.path.clone())
                .collect();
            let has_sessions = paths.base_dir.join("agents").join(&id).join("sessions").exists();
            agents.push(AgentOverview {
                id,
                name,
                emoji,
                model,
                channels,
                online: has_sessions,
                workspace,
            });
        }
    }
    Ok(agents)
}

#[tauri::command]
pub fn create_agent(
    agent_id: String,
    model_profile_id: Option<String>,
    independent: Option<bool>,
) -> Result<AgentOverview, String> {
    let agent_id = agent_id.trim().to_string();
    if agent_id.is_empty() {
        return Err("Agent ID is required".into());
    }
    if !agent_id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err("Agent ID may only contain letters, numbers, hyphens, and underscores".into());
    }

    let paths = resolve_paths();
    let mut cfg = read_openclaw_config(&paths)?;
    let current = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;

    let existing_ids = collect_agent_ids(&cfg);
    if existing_ids.iter().any(|id| id.eq_ignore_ascii_case(&agent_id)) {
        return Err(format!("Agent '{}' already exists", agent_id));
    }

    // Resolve model value from profile if provided
    let model_value = if let Some(ref pid) = model_profile_id {
        let pid = pid.trim();
        if pid.is_empty() { None } else {
            Some(resolve_profile_model_value(&paths, Some(pid.to_string()))?)
        }
    } else { None };
    let model_display = model_value.flatten();

    // If independent, create a workspace directory for this agent
    let workspace = if independent.unwrap_or(false) {
        let ws_dir = paths.base_dir.join("workspaces").join(&agent_id);
        fs::create_dir_all(&ws_dir).map_err(|e| e.to_string())?;
        let ws_path = ws_dir.to_string_lossy().to_string();
        Some(ws_path)
    } else { None };

    // Build agent entry
    let mut agent_obj = serde_json::Map::new();
    agent_obj.insert("id".into(), Value::String(agent_id.clone()));
    if let Some(ref model_str) = model_display {
        agent_obj.insert("model".into(), Value::String(model_str.clone()));
    }
    if let Some(ref ws) = workspace {
        agent_obj.insert("workspace".into(), Value::String(ws.clone()));
    }

    let agents = cfg
        .as_object_mut()
        .ok_or("config is not an object")?
        .entry("agents")
        .or_insert_with(|| Value::Object(serde_json::Map::new()))
        .as_object_mut()
        .ok_or("agents is not an object")?;
    let list = agents
        .entry("list")
        .or_insert_with(|| Value::Array(Vec::new()))
        .as_array_mut()
        .ok_or("agents.list is not an array")?;
    list.push(Value::Object(agent_obj));

    write_config_with_snapshot(&paths, &current, &cfg, "create-agent")?;
    Ok(AgentOverview {
        id: agent_id,
        name: None,
        emoji: None,
        model: model_display,
        channels: vec![],
        online: false,
        workspace,
    })
}

#[tauri::command]
pub fn delete_agent(agent_id: String) -> Result<bool, String> {
    let agent_id = agent_id.trim().to_string();
    if agent_id.is_empty() {
        return Err("Agent ID is required".into());
    }
    if agent_id == "main" {
        return Err("Cannot delete the main agent".into());
    }

    let paths = resolve_paths();
    let mut cfg = read_openclaw_config(&paths)?;
    let current = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;

    let list = cfg
        .pointer_mut("/agents/list")
        .and_then(Value::as_array_mut)
        .ok_or("agents.list not found")?;

    let before = list.len();
    list.retain(|agent| {
        agent.get("id").and_then(Value::as_str) != Some(&agent_id)
    });

    if list.len() == before {
        return Err(format!("Agent '{}' not found", agent_id));
    }

    // Also remove any bindings that reference this agent
    if let Some(bindings) = cfg.pointer_mut("/bindings").and_then(Value::as_array_mut) {
        bindings.retain(|b| {
            b.get("agentId").and_then(Value::as_str) != Some(&agent_id)
        });
    }

    write_config_with_snapshot(&paths, &current, &cfg, "delete-agent")?;
    Ok(true)
}

#[tauri::command]
pub fn setup_agent_identity(
    agent_id: String,
    name: String,
    emoji: Option<String>,
) -> Result<bool, String> {
    let agent_id = agent_id.trim().to_string();
    let name = name.trim().to_string();
    if agent_id.is_empty() {
        return Err("Agent ID is required".into());
    }
    if name.is_empty() {
        return Err("Name is required".into());
    }

    let paths = resolve_paths();
    let cfg = read_openclaw_config(&paths)?;

    // Find the agent's workspace
    let agents_list = cfg.pointer("/agents/list")
        .and_then(Value::as_array)
        .ok_or("agents.list not found")?;

    let agent = agents_list.iter()
        .find(|a| a.get("id").and_then(Value::as_str) == Some(&agent_id))
        .ok_or_else(|| format!("Agent '{}' not found", agent_id))?;

    let default_workspace = cfg.pointer("/agents/defaults/workspace")
        .or_else(|| cfg.pointer("/agents/default/workspace"))
        .and_then(Value::as_str)
        .map(|s| expand_tilde(s));

    let workspace = agent.get("workspace")
        .and_then(Value::as_str)
        .map(|s| expand_tilde(s))
        .or(default_workspace)
        .ok_or_else(|| format!("Agent '{}' has no workspace configured", agent_id))?;

    // Build IDENTITY.md content
    let mut content = format!("- Name: {}\n", name);
    if let Some(ref e) = emoji {
        let e = e.trim();
        if !e.is_empty() {
            content.push_str(&format!("- Emoji: {}\n", e));
        }
    }

    let ws_path = std::path::Path::new(&workspace);
    fs::create_dir_all(ws_path).map_err(|e| format!("Failed to create workspace dir: {}", e))?;
    let identity_path = ws_path.join("IDENTITY.md");
    fs::write(&identity_path, &content)
        .map_err(|e| format!("Failed to write IDENTITY.md: {}", e))?;

    Ok(true)
}

fn expand_tilde(path: &str) -> String {
    if path.starts_with("~/") {
        if let Some(home) = std::env::var("HOME").ok() {
            return format!("{}{}", home, &path[1..]);
        }
    }
    path.to_string()
}

fn parse_identity_md(workspace: &str) -> Option<(Option<String>, Option<String>)> {
    let identity_path = std::path::Path::new(workspace).join("IDENTITY.md");
    let content = fs::read_to_string(&identity_path).ok()?;
    let mut name = None;
    let mut emoji = None;
    for line in content.lines() {
        let trimmed = line.trim().trim_start_matches('-').trim();
        // Handle both "Name: X" and "**Name:** X"
        let trimmed = trimmed.replace("**", "");
        if let Some(val) = trimmed.strip_prefix("Name:") {
            let val = val.trim();
            if !val.is_empty() {
                name = Some(val.to_string());
            }
        } else if let Some(val) = trimmed.strip_prefix("Emoji:") {
            let val = val.trim();
            if !val.is_empty() {
                emoji = Some(val.to_string());
            }
        }
    }
    Some((name, emoji))
}

#[tauri::command]
pub fn list_memory_files() -> Result<Vec<MemoryFile>, String> {
    let paths = resolve_paths();
    list_memory_files_detailed(&paths.base_dir.join("memory"))
}

#[tauri::command]
pub fn delete_memory_file(path: String) -> Result<bool, String> {
    let paths = resolve_paths();
    let root = paths.base_dir.join("memory");
    let target = resolve_child_path(&root, &path)?;
    if !target.exists() {
        return Ok(false);
    }
    if !target.is_file() {
        return Err("target is not a file".into());
    }
    fs::remove_file(&target).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn clear_memory() -> Result<usize, String> {
    let paths = resolve_paths();
    let root = paths.base_dir.join("memory");
    if !root.exists() {
        return Ok(0);
    }
    let count = count_files_recursive(&root);
    fs::remove_dir_all(&root).map_err(|e| e.to_string())?;
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(count)
}

#[tauri::command]
pub fn list_session_files() -> Result<Vec<SessionFile>, String> {
    let paths = resolve_paths();
    list_session_files_detailed(&paths.base_dir)
}

#[tauri::command]
pub fn delete_session_file(path: String) -> Result<bool, String> {
    let paths = resolve_paths();
    let target = resolve_child_path(&paths.base_dir, &path)?;
    if !target.exists() {
        return Ok(false);
    }
    if !target.is_file() {
        return Err("target is not a file".into());
    }
    fs::remove_file(&target).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn clear_all_sessions() -> Result<usize, String> {
    let paths = resolve_paths();
    clear_agent_and_global_sessions(&paths.base_dir.join("agents"), None)
}

#[tauri::command]
pub fn clear_agent_sessions(agent_id: String) -> Result<usize, String> {
    if agent_id.trim().is_empty() {
        return Err("agent id is required".into());
    }
    if agent_id.contains("..") || agent_id.contains('/') || agent_id.contains('\\') {
        return Err("invalid agent id".into());
    }
    let paths = resolve_paths();
    clear_agent_and_global_sessions(&paths.base_dir.join("agents"), Some(agent_id.as_str()))
}

#[tauri::command]
pub fn list_recipes(source: Option<String>) -> Result<Vec<crate::recipe::Recipe>, String> {
    let paths = resolve_paths();
    let default_path = paths.clawpal_dir.join("recipes").join("recipes.json");
    Ok(load_recipes_with_fallback(source, &default_path))
}

#[tauri::command]
pub fn preview_apply(
    recipe_id: String,
    params: Map<String, Value>,
    source: Option<String>,
) -> Result<PreviewResult, String> {
    let recipe =
        find_recipe_with_source(&recipe_id, source).ok_or_else(|| "unknown recipe".to_string())?;
    let errors = validate(&recipe, &params);
    if !errors.is_empty() {
        return Err(format!("validation failed: {}", errors.join(",")));
    }
    let paths = resolve_paths();
    ensure_dirs(&paths)?;
    let current = read_openclaw_config(&paths)?;
    let (candidate, changes) = build_candidate_config(&current, &recipe, &params)?;
    let before_text = serde_json::to_string_pretty(&current).unwrap_or_else(|_| "{}".into());
    let after_text = serde_json::to_string_pretty(&candidate).unwrap_or_else(|_| "{}".into());
    Ok(PreviewResult {
        recipe_id: recipe_id.clone(),
        diff: format_diff(&current, &candidate),
        config_before: before_text,
        config_after: after_text,
        changes,
        overwrites_existing: true,
        can_rollback: true,
        impact_level: recipe.impact_category,
        warnings: Vec::new(),
    })
}

#[tauri::command]
pub fn apply_recipe(
    recipe_id: String,
    params: Map<String, Value>,
    source: Option<String>,
) -> Result<ApplyResult, String> {
    let recipe =
        find_recipe_with_source(&recipe_id, source).ok_or_else(|| "unknown recipe".to_string())?;
    let errors = validate(&recipe, &params);
    if !errors.is_empty() {
        return Ok(ApplyResult {
            ok: false,
            snapshot_id: None,
            config_path: String::new(),
            backup_path: None,
            warnings: errors,
            errors: vec!["validation failed".into()],
        });
    }
    let paths = resolve_paths();
    ensure_dirs(&paths)?;
    let current = read_openclaw_config(&paths)?;
    let current_text = serde_json::to_string_pretty(&current).map_err(|e| e.to_string())?;
    let snapshot = add_snapshot(
        &paths.history_dir,
        &paths.metadata_path,
        Some(recipe_id.clone()),
        "apply",
        true,
        &current_text,
        None,
    )?;
    let (candidate, _changes) = build_candidate_config(&current, &recipe, &params)?;
    write_json(&paths.config_path, &candidate)?;
    Ok(ApplyResult {
        ok: true,
        snapshot_id: Some(snapshot.id),
        config_path: paths.config_path.to_string_lossy().to_string(),
        backup_path: Some(snapshot.config_path),
        warnings: Vec::new(),
        errors: Vec::new(),
    })
}

#[tauri::command]
pub async fn restart_gateway() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_openclaw_raw(&["gateway", "restart"])?;
        Ok(true)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn list_history(limit: usize, offset: usize) -> Result<HistoryPage, String> {
    let paths = resolve_paths();
    let index = list_snapshots(&paths.metadata_path)?;
    let items = index
        .items
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(|item| HistoryItem {
            id: item.id,
            recipe_id: item.recipe_id,
            created_at: item.created_at,
            source: item.source,
            can_rollback: item.can_rollback,
            rollback_of: item.rollback_of,
        })
        .collect();
    Ok(HistoryPage { items })
}

#[tauri::command]
pub fn preview_rollback(snapshot_id: String) -> Result<PreviewResult, String> {
    let paths = resolve_paths();
    let index = list_snapshots(&paths.metadata_path)?;
    let target = index
        .items
        .into_iter()
        .find(|s| s.id == snapshot_id)
        .ok_or_else(|| "snapshot not found".to_string())?;
    if !target.can_rollback {
        return Err("snapshot is not rollbackable".to_string());
    }

    let current = read_openclaw_config(&paths)?;
    let target_text = read_snapshot(&target.config_path)?;
    let target_json: Value = json5::from_str(&target_text).unwrap_or(Value::Object(Default::default()));
    let before_text = serde_json::to_string_pretty(&current).unwrap_or_else(|_| "{}".into());
    let after_text = serde_json::to_string_pretty(&target_json).unwrap_or_else(|_| "{}".into());
    Ok(PreviewResult {
        recipe_id: "rollback".into(),
        diff: format_diff(&current, &target_json),
        config_before: before_text,
        config_after: after_text,
        changes: collect_change_paths(&current, &target_json),
        overwrites_existing: true,
        can_rollback: true,
        impact_level: "medium".into(),
        warnings: vec!["Rollback will replace current configuration".into()],
    })
}

#[tauri::command]
pub fn rollback(snapshot_id: String) -> Result<ApplyResult, String> {
    let paths = resolve_paths();
    ensure_dirs(&paths)?;
    let index = list_snapshots(&paths.metadata_path)?;
    let target = index
        .items
        .into_iter()
        .find(|s| s.id == snapshot_id)
        .ok_or_else(|| "snapshot not found".to_string())?;
    if !target.can_rollback {
        return Err("snapshot is not rollbackable".to_string());
    }
    let target_text = read_snapshot(&target.config_path)?;
    let backup = read_openclaw_config(&paths)?;
    let backup_text = serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())?;
    let _ = add_snapshot(
        &paths.history_dir,
        &paths.metadata_path,
        target.recipe_id.clone(),
        "rollback",
        true,
        &backup_text,
        Some(target.id.clone()),
    )?;
    write_text(&paths.config_path, &target_text)?;
    Ok(ApplyResult {
        ok: true,
        snapshot_id: Some(target.id),
        config_path: paths.config_path.to_string_lossy().to_string(),
        backup_path: None,
        warnings: vec!["rolled back".into()],
        errors: Vec::new(),
    })
}

#[tauri::command]
pub fn run_doctor_command() -> Result<DoctorReport, String> {
    let paths = resolve_paths();
    Ok(run_doctor(&paths))
}

#[tauri::command]
pub fn fix_issues(ids: Vec<String>) -> Result<FixResult, String> {
    let paths = resolve_paths();
    let issues = run_doctor(&paths);
    let mut fixable = Vec::new();
    for issue in issues.issues {
        if ids.contains(&issue.id) && issue.auto_fixable {
            fixable.push(issue.id);
        }
    }
    let auto_applied = apply_auto_fixes(&paths, &fixable);
    let mut remaining = Vec::new();
    let mut applied = Vec::new();
    for id in ids {
        if fixable.contains(&id) && auto_applied.iter().any(|x| x == &id) {
            applied.push(id);
        } else {
            remaining.push(id);
        }
    }
    Ok(FixResult {
        ok: true,
        applied,
        remaining_issues: remaining,
    })
}

fn collect_model_summary(cfg: &Value) -> ModelSummary {
    let global_default_model = cfg
        .pointer("/agents/defaults/model")
        .and_then(|value| read_model_value(value))
        .or_else(|| cfg.pointer("/agents/default/model").and_then(|value| read_model_value(value)));

    let mut agent_overrides = Vec::new();
    if let Some(agents) = cfg.pointer("/agents/list").and_then(Value::as_array) {
        for agent in agents {
            if let Some(model_value) = agent.get("model").and_then(read_model_value) {
                let should_emit = global_default_model
                    .as_ref()
                    .map(|global| global != &model_value)
                    .unwrap_or(true);
                if should_emit {
                    let id = agent
                        .get("id")
                        .and_then(Value::as_str)
                        .unwrap_or("agent");
                    agent_overrides.push(format!("{id} => {model_value}"));
                }
            }
        }
    }
    ModelSummary {
        global_default_model,
        agent_overrides,
        channel_overrides: collect_channel_model_overrides(cfg),
    }
}

fn run_external_command_raw(parts: &[&str]) -> Result<OpenclawCommandOutput, String> {
    if parts.is_empty() {
        return Err("no command specified".into());
    }
    let mut command = Command::new(parts[0]);
    if parts.len() > 1 {
        command.args(&parts[1..]);
    }
    let output = command
        .output()
        .map_err(|error| format!("failed to run {}: {error}", parts[0]))?;
    let exit_code = output.status.code().unwrap_or(-1);
    Ok(OpenclawCommandOutput {
        stdout: String::from_utf8_lossy(&output.stdout).trim_end().to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).trim_end().to_string(),
        exit_code,
    })
}

fn run_openclaw_raw(args: &[&str]) -> Result<OpenclawCommandOutput, String> {
    let mut command = Command::new("openclaw");
    command.args(args);
    let output = command
        .output()
        .map_err(|error| format!("failed to run openclaw: {error}"))?;
    let exit_code = output.status.code().unwrap_or(-1);
    let result = OpenclawCommandOutput {
        stdout: String::from_utf8_lossy(&output.stdout).trim_end().to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).trim_end().to_string(),
        exit_code,
    };
    if exit_code != 0 {
        let details = if !result.stderr.is_empty() {
            result.stderr.clone()
        } else {
            result.stdout.clone()
        };
        return Err(format!("openclaw command failed ({exit_code}): {details}"));
    }
    Ok(result)
}

/// Strip leading non-JSON lines from CLI output (plugin logs, ANSI codes, etc.)
fn extract_json_from_output(raw: &str) -> Option<&str> {
    let start = raw.find('{').or_else(|| raw.find('['))?;
    Some(&raw[start..])
}

/// Extract the last JSON array from CLI output that may contain ANSI codes and plugin logs.
/// Scans from the end to find the last `]`, then finds its matching `[`.
fn extract_last_json_array(raw: &str) -> Option<&str> {
    let bytes = raw.as_bytes();
    let end = bytes.iter().rposition(|&b| b == b']')?;
    let mut depth = 0;
    for i in (0..=end).rev() {
        match bytes[i] {
            b']' => depth += 1,
            b'[' => {
                depth -= 1;
                if depth == 0 {
                    return Some(&raw[i..=end]);
                }
            }
            _ => {}
        }
    }
    None
}

/// Parse `openclaw channels resolve --json` output into a map of id -> name.
fn parse_resolve_name_map(stdout: &str) -> Option<HashMap<String, String>> {
    let json_str = extract_last_json_array(stdout)?;
    let parsed: Vec<Value> = serde_json::from_str(json_str).ok()?;
    let mut map = HashMap::new();
    for item in parsed {
        let resolved = item.get("resolved").and_then(Value::as_bool).unwrap_or(false);
        if !resolved {
            continue;
        }
        if let (Some(input), Some(name)) = (
            item.get("input").and_then(Value::as_str),
            item.get("name").and_then(Value::as_str),
        ) {
            let name = name.trim().to_string();
            if !name.is_empty() {
                map.insert(input.to_string(), name);
            }
        }
    }
    Some(map)
}

fn extract_version_from_text(input: &str) -> Option<String> {
    let re = regex::Regex::new(r"\d+\.\d+(?:\.\d+){1,3}(?:[-+._a-zA-Z0-9]*)?").ok()?;
    re.find(input).map(|mat| mat.as_str().to_string())
}

fn compare_semver(installed: &str, latest: Option<&str>) -> bool {
    let installed = normalize_semver_components(installed);
    let latest = latest.and_then(normalize_semver_components);
    let (mut installed, mut latest) = match (installed, latest) {
        (Some(installed), Some(latest)) => (installed, latest),
        _ => return false,
    };

    let len = installed.len().max(latest.len());
    while installed.len() < len {
        installed.push(0);
    }
    while latest.len() < len {
        latest.push(0);
    }
    installed < latest
}

fn normalize_semver_components(raw: &str) -> Option<Vec<u32>> {
    let mut parts = Vec::new();
    for bit in raw.split('.') {
        let filtered = bit.trim_start_matches(|c: char| c == 'v' || c == 'V');
        let head = filtered.split(|c: char| !c.is_ascii_digit()).next().unwrap_or("");
        if head.is_empty() {
            continue;
        }
        parts.push(head.parse::<u32>().ok()?);
    }
    if parts.is_empty() {
        return None;
    }
    Some(parts)
}

fn unix_timestamp_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |delta| delta.as_secs())
}

fn format_timestamp_from_unix(timestamp: u64) -> String {
    let Some(utc) = chrono::DateTime::<chrono::Utc>::from_timestamp(timestamp as i64, 0) else {
        return "unknown".into();
    };
    utc.to_rfc3339()
}

fn openclaw_update_cache_path(paths: &crate::models::OpenClawPaths) -> PathBuf {
    paths.clawpal_dir.join("openclaw-update-cache.json")
}

fn read_openclaw_update_cache(
    path: &Path,
) -> Option<OpenclawUpdateCache> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str::<OpenclawUpdateCache>(&text).ok()
}

fn save_openclaw_update_cache(
    path: &Path,
    cache: &OpenclawUpdateCache,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let text = serde_json::to_string_pretty(cache).map_err(|error| error.to_string())?;
    write_text(path, &text)
}

fn read_model_catalog_cache(path: &Path) -> Option<ModelCatalogProviderCache> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str::<ModelCatalogProviderCache>(&text).ok()
}

fn save_model_catalog_cache(
    path: &Path,
    cache: &ModelCatalogProviderCache,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let text = serde_json::to_string_pretty(cache).map_err(|error| error.to_string())?;
    write_text(path, &text)
}

fn model_catalog_cache_path(paths: &crate::models::OpenClawPaths) -> PathBuf {
    paths.clawpal_dir.join("model-catalog-cache.json")
}

fn normalize_model_ref(raw: &str) -> String {
    raw.trim().to_lowercase().replace('\\', "/")
}

fn resolve_openclaw_version() -> String {
    match run_openclaw_raw(&["--version"]) {
        Ok(output) => extract_version_from_text(&output.stdout).unwrap_or_else(|| "unknown".into()),
        Err(_) => "unknown".into(),
    }
}

fn check_openclaw_update_cached(paths: &crate::models::OpenClawPaths, force: bool) -> Result<OpenclawUpdateCheck, String> {
    let cache_path = openclaw_update_cache_path(paths);
    let now = unix_timestamp_secs();
    if !force {
        if let Some(cached) = read_openclaw_update_cache(&cache_path) {
            if now.saturating_sub(cached.checked_at) < cached.ttl_seconds {
                let installed_version = cached.installed_version.unwrap_or_else(resolve_openclaw_version);
                let upgrade_available = compare_semver(&installed_version, cached.latest_version.as_deref());
                return Ok(OpenclawUpdateCheck {
                    installed_version,
                    latest_version: cached.latest_version,
                    upgrade_available,
                    channel: cached.channel,
                    details: cached.details,
                    source: cached.source,
                    checked_at: format_timestamp_from_unix(now),
                });
            }
        }
    }

    let installed_version = resolve_openclaw_version();
    let (latest_version, channel, details, source, upgrade_available) = detect_openclaw_update_cached(&installed_version)
        .unwrap_or((None, None, Some("failed to detect update status".into()), "openclaw-command".into(), false));
    let checked_at = format_timestamp_from_unix(now);
    let cache = OpenclawUpdateCache {
        checked_at: now,
        latest_version: latest_version.clone(),
        channel,
        details: details.clone(),
        source: source.clone(),
        installed_version: Some(installed_version.clone()),
        ttl_seconds: 60 * 60 * 6,
    };
    save_openclaw_update_cache(&cache_path, &cache)?;
    let upgrade = compare_semver(&installed_version, latest_version.as_deref());
    Ok(OpenclawUpdateCheck {
        installed_version,
        latest_version,
        upgrade_available: upgrade || upgrade_available,
        channel: cache.channel,
        details,
        source,
        checked_at,
    })
}

fn detect_openclaw_update_cached(installed_version: &str) -> Option<(Option<String>, Option<String>, Option<String>, String, bool)> {
    let output = run_openclaw_raw(&["update", "status"]).ok()?;
    if let Some((latest_version, channel, details, upgrade_available)) =
        parse_openclaw_update_json(&output.stdout, installed_version)
    {
        return Some((latest_version, Some(channel), Some(details), "openclaw update status --json".into(), upgrade_available));
    }
    let parsed = parse_openclaw_update_text(&output.stdout);
    if let Some((latest_version, channel, details)) = parsed {
        let source = "openclaw update status".into();
        let available = latest_version
            .as_ref()
            .is_some_and(|latest| compare_semver(installed_version, Some(latest)));
        return Some((latest_version, Some(channel), Some(details), source, available));
    }
    let latest_version = query_openclaw_latest_npm().ok().flatten();
    let details = latest_version
        .as_ref()
        .map(|value| format!("npm latest {value}"))
        .unwrap_or_else(|| "update status not available".into());
    let upgrade = latest_version
        .as_ref()
        .is_some_and(|latest| compare_semver(installed_version, Some(latest.as_str())));
    Some((latest_version, None, Some(details), "npm".into(), upgrade))
}

fn parse_openclaw_update_json(raw: &str, installed_version: &str) -> Option<(Option<String>, String, String, bool)> {
    let json_str = extract_json_from_output(raw)?;
    let payload: Value = serde_json::from_str(json_str).ok()?;
    let channel = payload
        .pointer("/channel/value")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string();

    let latest_from_update = payload
        .pointer("/update/registry/latestVersion")
        .and_then(Value::as_str)
        .map(|value| value.to_string());
    let latest = payload
        .pointer("/availability/latestVersion")
        .and_then(Value::as_str)
        .map(|value| value.to_string())
        .or(latest_from_update);
    let has_update = payload
        .pointer("/availability/available")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let details = payload
        .pointer("/availability/latestVersion")
        .and_then(Value::as_str)
        .map(|value| format!("npm latest {value}"))
        .or_else(|| {
            if has_update {
                Some("update available".into())
            } else {
                Some("up to date".into())
            }
        })
        .unwrap_or_else(|| "update status unavailable".into());

    let upgrade_available = if let Some(latest_version) = latest.as_deref() {
        compare_semver(installed_version, Some(latest_version))
    } else {
        has_update
    };

    Some((latest, channel, details, upgrade_available))
}

fn parse_openclaw_update_text(raw: &str) -> Option<(Option<String>, String, String)> {
    let mut channel = String::from("unknown");
    for line in raw.lines() {
        if line.contains("Channel") {
            let right = line.split('│').last().or_else(|| line.split('|').last())?;
            channel = right.trim().to_string();
        }
        if line.to_lowercase().contains("update") && line.contains("npm latest") {
            if let Some(token) = extract_version_from_text(line) {
                return Some((Some(token), channel, line.trim().to_string()));
            }
            return Some((None, channel, line.trim().to_string()));
        }
        if line.to_lowercase().contains("update") && line.contains("unknown") {
            return Some((None, channel, line.trim().to_string()));
        }
    }
    None
}

fn query_openclaw_latest_npm() -> Result<Option<String>, String> {
    let output = run_external_command_raw(&["npm", "view", "openclaw", "version"]);
    let output = match output {
        Ok(output) => output,
        Err(_) => return Ok(None),
    };
    if output.stdout.trim().is_empty() {
        return Ok(None);
    }
    let trimmed = output.stdout.trim().trim_matches(['\"', '\''].as_ref());
    Ok(Some(trimmed.to_string()))
}

fn collect_channel_summary(cfg: &Value) -> ChannelSummary {
    let examples = collect_channel_model_overrides_list(cfg);
    let configured_channels = cfg
        .get("channels")
        .and_then(|v| v.as_object())
        .map(|channels| channels.len())
        .unwrap_or(0);

    ChannelSummary {
        configured_channels,
        channel_model_overrides: examples.len(),
        channel_examples: examples,
    }
}

fn read_model_value(value: &Value) -> Option<String> {
    if let Some(value) = value.as_str() {
        return Some(value.to_string());
    }

    if let Some(model_obj) = value.as_object() {
        if let Some(primary) = model_obj.get("primary").and_then(Value::as_str) {
            return Some(primary.to_string());
        }
        if let Some(name) = model_obj.get("name").and_then(Value::as_str) {
            return Some(name.to_string());
        }
        if let Some(model) = model_obj.get("model").and_then(Value::as_str) {
            return Some(model.to_string());
        }
        if let Some(model) = model_obj.get("default").and_then(Value::as_str) {
            return Some(model.to_string());
        }
        if let Some(v) = model_obj.get("provider").and_then(Value::as_str) {
            if let Some(inner) = model_obj.get("id").and_then(Value::as_str) {
                return Some(format!("{v}/{inner}"));
            }
        }
    }
    None
}

fn collect_channel_model_overrides(cfg: &Value) -> Vec<String> {
    collect_channel_model_overrides_list(cfg)
}

fn collect_channel_model_overrides_list(cfg: &Value) -> Vec<String> {
    let mut out = Vec::new();
    if let Some(channels) = cfg.get("channels").and_then(Value::as_object) {
        for (name, entry) in channels {
            let mut branch = Vec::new();
            collect_channel_paths(name, entry, &mut branch);
            out.extend(branch);
        }
    }
    out
}

fn collect_channel_paths(prefix: &str, node: &Value, out: &mut Vec<String>) {
    if let Some(obj) = node.as_object() {
        if let Some(model) = obj.get("model").and_then(read_model_value) {
            out.push(format!("{prefix} => {model}"));
        }
        for (key, child) in obj {
            if key == "model" {
                continue;
            }
            let next = format!("{prefix}.{key}");
            collect_channel_paths(&next, child, out);
        }
    }
}

fn collect_memory_overview(base_dir: &Path) -> MemorySummary {
    let memory_root = base_dir.join("memory");
    collect_file_inventory(&memory_root, Some(80))
}

fn collect_file_inventory(path: &Path, max_files: Option<usize>) -> MemorySummary {
    let mut queue = VecDeque::new();
    let mut file_count = 0usize;
    let mut total_bytes = 0u64;
    let mut files = Vec::new();

    if !path.exists() {
        return MemorySummary {
            file_count: 0,
            total_bytes: 0,
            files,
        };
    }

    queue.push_back(path.to_path_buf());
    while let Some(current) = queue.pop_front() {
        let entries = match fs::read_dir(&current) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_dir() {
                    queue.push_back(entry_path);
                    continue;
                }
                if metadata.is_file() {
                    file_count += 1;
                    total_bytes = total_bytes.saturating_add(metadata.len());
                    if max_files.is_none_or(|limit| files.len() < limit) {
                        files.push(MemoryFileSummary {
                            path: entry_path.to_string_lossy().to_string(),
                            size_bytes: metadata.len(),
                        });
                    }
                }
            }
        }
    }

    files.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    MemorySummary {
        file_count,
        total_bytes,
        files,
    }
}

fn collect_session_overview(base_dir: &Path) -> SessionSummary {
    let agents_dir = base_dir.join("agents");
    let mut by_agent = Vec::new();
    let mut total_session_files = 0usize;
    let mut total_archive_files = 0usize;
    let mut total_bytes = 0u64;

    if !agents_dir.exists() {
        return SessionSummary {
            total_session_files,
            total_archive_files,
            total_bytes,
            by_agent,
        };
    }

    if let Ok(entries) = fs::read_dir(agents_dir) {
        for entry in entries.flatten() {
            let agent_path = entry.path();
            if !agent_path.is_dir() {
                continue;
            }
            let agent = entry.file_name().to_string_lossy().to_string();
            let sessions_dir = agent_path.join("sessions");
            let archive_dir = agent_path.join("sessions_archive");

            let session_info = collect_file_inventory_with_limit(&sessions_dir);
            let archive_info = collect_file_inventory_with_limit(&archive_dir);

            if session_info.files > 0 || archive_info.files > 0 {
                by_agent.push(AgentSessionSummary {
                    agent: agent.clone(),
                    session_files: session_info.files,
                    archive_files: archive_info.files,
                    total_bytes: session_info.total_bytes.saturating_add(archive_info.total_bytes),
                });
            }

            total_session_files = total_session_files.saturating_add(session_info.files);
            total_archive_files = total_archive_files.saturating_add(archive_info.files);
            total_bytes = total_bytes
                .saturating_add(session_info.total_bytes)
                .saturating_add(archive_info.total_bytes);
        }
    }

    by_agent.sort_by(|a, b| b.total_bytes.cmp(&a.total_bytes));
    SessionSummary {
        total_session_files,
        total_archive_files,
        total_bytes,
        by_agent,
    }
}

struct InventorySummary {
    files: usize,
    total_bytes: u64,
}

fn collect_file_inventory_with_limit(path: &Path) -> InventorySummary {
    if !path.exists() {
        return InventorySummary {
            files: 0,
            total_bytes: 0,
        };
    }
    let mut queue = VecDeque::new();
    let mut files = 0usize;
    let mut total_bytes = 0u64;
    queue.push_back(path.to_path_buf());
    while let Some(current) = queue.pop_front() {
        let entries = match fs::read_dir(&current) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                let p = entry.path();
                if metadata.is_dir() {
                    queue.push_back(p);
                } else if metadata.is_file() {
                    files += 1;
                    total_bytes = total_bytes.saturating_add(metadata.len());
                }
            }
        }
    }
    InventorySummary {
        files,
        total_bytes,
    }
}

fn list_memory_files_detailed(memory_root: &Path) -> Result<Vec<MemoryFile>, String> {
    if !memory_root.exists() {
        return Ok(Vec::new());
    }
    let mut queue = VecDeque::new();
    let mut files = Vec::new();
    queue.push_back(memory_root.to_path_buf());
    while let Some(current) = queue.pop_front() {
        let entries = match fs::read_dir(&current) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let entry_path = entry.path();
            let metadata = match entry.metadata() {
                Ok(meta) => meta,
                Err(_) => continue,
            };
            if metadata.is_dir() {
                queue.push_back(entry_path);
                continue;
            }
            if metadata.is_file() {
                let relative_path = entry_path
                    .strip_prefix(memory_root)
                    .unwrap_or(&entry_path)
                    .to_string_lossy()
                    .to_string();
                files.push(MemoryFile {
                    path: entry_path.to_string_lossy().to_string(),
                    relative_path,
                    size_bytes: metadata.len(),
                });
            }
        }
    }
    files.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    Ok(files)
}

fn list_session_files_detailed(base_dir: &Path) -> Result<Vec<SessionFile>, String> {
    let agents_root = base_dir.join("agents");
    if !agents_root.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    let entries = fs::read_dir(&agents_root).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let entry_path = entry.path();
        if !entry_path.is_dir() {
            continue;
        }
        let agent = entry.file_name().to_string_lossy().to_string();
        let sessions_root = entry_path.join("sessions");
        let archive_root = entry_path.join("sessions_archive");

        collect_session_files_in_scope(&sessions_root, &agent, "sessions", base_dir, &mut out)?;
        collect_session_files_in_scope(&archive_root, &agent, "archive", base_dir, &mut out)?;
    }
    out.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(out)
}

fn collect_session_files_in_scope(
    scope_root: &Path,
    agent: &str,
    kind: &str,
    base_dir: &Path,
    out: &mut Vec<SessionFile>,
) -> Result<(), String> {
    if !scope_root.exists() {
        return Ok(());
    }
    let mut queue = VecDeque::new();
    queue.push_back(scope_root.to_path_buf());
    while let Some(current) = queue.pop_front() {
        let entries = match fs::read_dir(&current) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let entry_path = entry.path();
            let metadata = match entry.metadata() {
                Ok(meta) => meta,
                Err(_) => continue,
            };
            if metadata.is_dir() {
                queue.push_back(entry_path);
                continue;
            }
            if metadata.is_file() {
                let relative_path = entry_path
                    .strip_prefix(base_dir)
                    .unwrap_or(&entry_path)
                    .to_string_lossy()
                    .to_string();
                out.push(SessionFile {
                    path: entry_path.to_string_lossy().to_string(),
                    relative_path,
                    agent: agent.to_string(),
                    kind: kind.to_string(),
                    size_bytes: metadata.len(),
                });
            }
        }
    }
    Ok(())
}

fn resolve_child_path(root: &Path, target: &str) -> Result<PathBuf, String> {
    if target.trim().is_empty() {
        return Err("path is required".into());
    }
    let candidate = if Path::new(target).is_absolute() {
        PathBuf::from(target)
    } else {
        root.join(target)
    };
    let root_abs = if root.exists() {
        fs::canonicalize(root).map_err(|e| e.to_string())?
    } else {
        return Err("root directory not found".into());
    };
    let target_abs = fs::canonicalize(&candidate).map_err(|e| e.to_string())?;
    if !target_abs.starts_with(&root_abs) {
        return Err("path is outside managed directory".into());
    }
    Ok(target_abs)
}

fn count_files_recursive(root: &Path) -> usize {
    if !root.exists() {
        return 0;
    }
    let mut queue = VecDeque::new();
    let mut total = 0usize;
    queue.push_back(root.to_path_buf());
    while let Some(current) = queue.pop_front() {
        let entries = match fs::read_dir(&current) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                let entry_path = entry.path();
                if metadata.is_dir() {
                    queue.push_back(entry_path);
                } else if metadata.is_file() {
                    total = total.saturating_add(1);
                }
            }
        }
    }
    total
}

fn clear_agent_and_global_sessions(agents_root: &Path, agent_id: Option<&str>) -> Result<usize, String> {
    if !agents_root.exists() {
        return Ok(0);
    }
    let mut total = 0usize;
    let mut targets = Vec::new();

    match agent_id {
        Some(agent) => targets.push(agents_root.join(agent)),
        None => {
            for entry in fs::read_dir(agents_root).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                if entry
                    .file_type()
                    .map_err(|e| e.to_string())?
                    .is_dir()
                {
                    targets.push(entry.path());
                }
            }
        }
    }

    for agent_path in targets {
        let sessions = agent_path.join("sessions");
        let archive = agent_path.join("sessions_archive");
        total = total.saturating_add(clear_directory_contents(&sessions)?);
        total = total.saturating_add(clear_directory_contents(&archive)?);
        fs::create_dir_all(&sessions).map_err(|e| e.to_string())?;
        fs::create_dir_all(&archive).map_err(|e| e.to_string())?;
    }
    Ok(total)
}

fn clear_directory_contents(target: &Path) -> Result<usize, String> {
    if !target.exists() {
        return Ok(0);
    }
    let mut total = 0usize;
    let entries = fs::read_dir(target).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|e| e.to_string())?;
        if metadata.is_dir() {
            total = total.saturating_add(clear_directory_contents(&path)?);
            fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
            continue;
        }
        if metadata.is_file() || metadata.is_symlink() {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
            total = total.saturating_add(1);
        }
    }
    Ok(total)
}

fn model_profiles_path(paths: &crate::models::OpenClawPaths) -> std::path::PathBuf {
    paths.clawpal_dir.join("model-profiles.json")
}

fn resolve_profile_model_value(
    paths: &crate::models::OpenClawPaths,
    profile_id: Option<String>,
) -> Result<Option<String>, String> {
    let profile_id = profile_id.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });
    if profile_id.is_none() {
        return Ok(None);
    }
    let target = profile_id.expect("checked");
    let profiles = load_model_profiles(paths);
    for profile in profiles {
        if profile.id == target {
            return Ok(Some(profile_to_model_value(&profile)));
        }
    }
    Err(format!("model profile not found: {target}"))
}

fn profile_to_model_value(profile: &ModelProfile) -> String {
    if profile.model.contains('/') {
        profile.model.clone()
    } else {
        format!("{}/{}", profile.provider, profile.model)
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedApiKey {
    pub profile_id: String,
    pub masked_key: String,
}

#[tauri::command]
pub fn resolve_api_keys() -> Result<Vec<ResolvedApiKey>, String> {
    let paths = resolve_paths();
    let profiles = load_model_profiles(&paths);
    let mut out = Vec::new();
    for profile in &profiles {
        let key = resolve_profile_api_key(profile, &paths.base_dir);
        let masked = mask_api_key(&key);
        out.push(ResolvedApiKey {
            profile_id: profile.id.clone(),
            masked_key: masked,
        });
    }
    Ok(out)
}

fn resolve_profile_api_key(profile: &ModelProfile, base_dir: &Path) -> String {
    // 1. Direct api_key field (user entered key directly in ClawPal)
    if let Some(ref key) = profile.api_key {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    // 2. Try auth_ref as env var name directly (e.g. "OPENAI_API_KEY")
    let auth_ref = profile.auth_ref.trim();
    if !auth_ref.is_empty() {
        if let Ok(val) = std::env::var(auth_ref) {
            if !val.trim().is_empty() {
                return val;
            }
        }
    }

    // 3. Look up auth_ref in agent-level auth-profiles.json files
    //    Keys are stored at: {base_dir}/agents/{agent}/agent/auth-profiles.json
    if !auth_ref.is_empty() {
        if let Some(key) = resolve_key_from_agent_auth_profiles(base_dir, auth_ref) {
            return key;
        }
    }

    // 4. Try common env var naming conventions based on provider
    let provider = profile.provider.trim().to_uppercase().replace('-', "_");
    if !provider.is_empty() {
        for suffix in ["_API_KEY", "_KEY", "_TOKEN"] {
            let env_name = format!("{provider}{suffix}");
            if let Ok(val) = std::env::var(&env_name) {
                if !val.trim().is_empty() {
                    return val;
                }
            }
        }
    }

    String::new()
}

/// Reads agent-level auth-profiles.json to find the actual API key/token.
/// Scans all agents and returns the first match.
fn resolve_key_from_agent_auth_profiles(base_dir: &Path, auth_ref: &str) -> Option<String> {
    let agents_dir = base_dir.join("agents");
    if !agents_dir.exists() {
        return None;
    }
    let entries = fs::read_dir(&agents_dir).ok()?;
    for entry in entries.flatten() {
        let auth_file = entry.path().join("agent").join("auth-profiles.json");
        if !auth_file.exists() {
            continue;
        }
        let text = fs::read_to_string(&auth_file).ok()?;
        let data: Value = serde_json::from_str(&text).ok()?;
        if let Some(profiles) = data.get("profiles").and_then(Value::as_object) {
            if let Some(auth_entry) = profiles.get(auth_ref) {
                if let Some(key) = extract_token_from_auth_entry(auth_entry) {
                    return Some(key);
                }
            }
        }
    }
    None
}

/// Extract the actual key/token from an agent auth-profiles entry.
/// Handles different auth types: token, api_key, oauth.
fn extract_token_from_auth_entry(entry: &Value) -> Option<String> {
    // "token" type → "token" field (e.g. anthropic)
    // "api_key" type → "key" field (e.g. kimi-coding)
    // "oauth" type → "access" field (e.g. minimax-portal, openai-codex)
    for field in ["token", "key", "apiKey", "api_key", "access"] {
        if let Some(val) = entry.get(field).and_then(Value::as_str) {
            let trimmed = val.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

fn mask_api_key(key: &str) -> String {
    let key = key.trim();
    if key.is_empty() {
        return "not set".to_string();
    }
    if key.len() <= 8 {
        return "***".to_string();
    }
    let prefix = &key[..4.min(key.len())];
    let suffix = &key[key.len().saturating_sub(4)..];
    format!("{prefix}...{suffix}")
}

fn load_model_profiles(paths: &crate::models::OpenClawPaths) -> Vec<ModelProfile> {
    let path = model_profiles_path(paths);
    let text = std::fs::read_to_string(&path).unwrap_or_else(|_| r#"{"profiles":[]}"#.to_string());
    #[derive(serde::Deserialize)]
    struct Storage {
        #[serde(default)]
        profiles: Vec<ModelProfile>,
    }
    let parsed = serde_json::from_str::<Storage>(&text).unwrap_or(Storage {
        profiles: Vec::new(),
    });
    parsed.profiles
}

fn save_model_profiles(paths: &crate::models::OpenClawPaths, profiles: &[ModelProfile]) -> Result<(), String> {
    let path = model_profiles_path(paths);
    #[derive(serde::Serialize)]
    struct Storage<'a> {
        profiles: &'a [ModelProfile],
        #[serde(rename = "version")]
        version: u8,
    }
    let payload = Storage {
        profiles,
        version: 1,
    };
    let text = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
    crate::config_io::write_text(&path, &text)
}

fn write_config_with_snapshot(
    paths: &crate::models::OpenClawPaths,
    current_text: &str,
    next: &Value,
    source: &str,
) -> Result<(), String> {
    let _ = add_snapshot(
        &paths.history_dir,
        &paths.metadata_path,
        Some(source.to_string()),
        source,
        true,
        current_text,
        None,
    )?;
    write_json(&paths.config_path, next)
}

fn set_nested_value(root: &mut Value, path: &str, value: Option<Value>) -> Result<(), String> {
    let path = path.trim().trim_matches('.');
    if path.is_empty() {
        return Err("invalid path".into());
    }
    let mut cur = root;
    let mut parts = path.split('.').peekable();
    while let Some(part) = parts.next() {
        let is_last = parts.peek().is_none();
        let obj = cur
            .as_object_mut()
            .ok_or_else(|| "path must point to object".to_string())?;
        if is_last {
            if let Some(v) = value {
                obj.insert(part.to_string(), v);
            } else {
                obj.remove(part);
            }
            return Ok(());
        }
        let child = obj
            .entry(part.to_string())
            .or_insert_with(|| Value::Object(Default::default()));
        if !child.is_object() {
            *child = Value::Object(Default::default());
        }
        cur = child;
    }
    unreachable!("path should have at least one segment");
}

fn set_agent_model_value(
    root: &mut Value,
    agent_id: &str,
    model: Option<String>,
) -> Result<(), String> {
    if let Some(agents) = root.pointer_mut("/agents").and_then(Value::as_object_mut) {
        if let Some(list) = agents.get_mut("list").and_then(Value::as_array_mut) {
            for agent in list {
                if agent.get("id").and_then(Value::as_str) == Some(agent_id) {
                    if let Some(v) = model {
                        if let Some(agent_obj) = agent.as_object_mut() {
                            agent_obj.insert("model".into(), Value::String(v));
                        }
                    } else if let Some(agent_obj) = agent.as_object_mut() {
                        agent_obj.remove("model");
                    }
                    return Ok(());
                }
            }
        }
    }
    Err(format!("agent not found: {agent_id}"))
}

fn load_model_catalog(
    paths: &crate::models::OpenClawPaths,
    cfg: &Value,
) -> Result<Vec<ModelCatalogProvider>, String> {
    let now = unix_timestamp_secs();
    let cache_path = model_catalog_cache_path(paths);
    let current_version = resolve_openclaw_version();
    let ttl_seconds = 60 * 60 * 12;
    if let Some(cached) = read_model_catalog_cache(&cache_path)
        .filter(|cache| cache.cli_version == current_version)
    {
        if now.saturating_sub(cached.updated_at) < ttl_seconds && cached.error.is_none() {
            return Ok(cached.providers);
        }
        if cached.error.is_none() {
            if let Some(fresh) = extract_model_catalog_from_cli(paths) {
                if !fresh.is_empty() {
                    return Ok(fresh);
                }
            }
            if !cached.providers.is_empty() {
                return Ok(cached.providers);
            }
        }
    }

    if let Some(catalog) = extract_model_catalog_from_cli(paths) {
        if !catalog.is_empty() {
            let cache = ModelCatalogProviderCache {
                cli_version: current_version,
                updated_at: now,
                providers: catalog.clone(),
                source: "openclaw models list --all --json".into(),
                error: None,
            };
            let _ = save_model_catalog_cache(&cache_path, &cache);
            return Ok(catalog);
        }
    }

    let fallback = collect_model_catalog(cfg);
    if let Some(cached) = read_model_catalog_cache(&cache_path) {
        if !cached.providers.is_empty() {
            let catalog = if fallback.is_empty() {
                cached.providers
            } else {
                fallback
            };
            return Ok(catalog);
        }
    }
    Ok(fallback)
}

fn extract_model_catalog_from_cli(
    paths: &crate::models::OpenClawPaths,
) -> Option<Vec<ModelCatalogProvider>> {
    let output = run_openclaw_raw(&["models", "list", "--all", "--json", "--no-color"]).ok()?;
    if output.stdout.trim().is_empty() {
        return None;
    }

    // The CLI may prefix JSON with plugin log lines — strip them.
    let json_str = extract_json_from_output(&output.stdout)?;
    let response: Value = serde_json::from_str(json_str).ok()?;
    let models: Vec<Value> = response
        .as_array()
        .map(|values| values.to_vec())
        .or_else(|| {
            response
                .get("models")
                .and_then(Value::as_array)
                .map(|values| values.to_vec())
        })
        .or_else(|| {
            response
                .get("items")
                .and_then(Value::as_array)
                .map(|values| values.to_vec())
        })
        .or_else(|| {
            response
                .get("data")
                .and_then(Value::as_array)
                .map(|values| values.to_vec())
        })
        .unwrap_or_default();
    if models.is_empty() {
        return None;
    }
    let mut providers: BTreeMap<String, ModelCatalogProvider> = BTreeMap::new();
    for model in models {
        let key = model
            .get("key")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| {
                let provider = model.get("provider").and_then(Value::as_str)?;
                let model_id = model.get("id").and_then(Value::as_str)?;
                Some(format!("{provider}/{model_id}"))
            })?;
        let mut parts = key.splitn(2, '/');
        let provider = parts.next()?.trim().to_lowercase();
        let id = parts.next().unwrap_or("").trim().to_string();
        if provider.is_empty() || id.is_empty() {
            continue;
        }
        let name = model
            .get("name")
            .and_then(Value::as_str)
            .or_else(|| model.get("model").and_then(Value::as_str))
            .or_else(|| model.get("title").and_then(Value::as_str))
            .map(str::to_string);
        let base_url = model
            .get("baseUrl")
            .or_else(|| model.get("base_url"))
            .or_else(|| model.get("apiBase"))
            .or_else(|| model.get("api_base"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| {
                response
                    .get("providers")
                    .and_then(Value::as_object)
                    .and_then(|providers| providers.get(&provider))
                    .and_then(Value::as_object)
                    .and_then(|provider_cfg| {
                        provider_cfg
                            .get("baseUrl")
                            .or_else(|| provider_cfg.get("base_url"))
                            .or_else(|| provider_cfg.get("apiBase"))
                            .or_else(|| provider_cfg.get("api_base"))
                            .and_then(Value::as_str)
                    })
                    .map(str::to_string)
            });
        let entry = providers.entry(provider.clone()).or_insert(ModelCatalogProvider {
            provider: provider.clone(),
            base_url,
            models: Vec::new(),
        });
        if !entry.models.iter().any(|existing| existing.id == id) {
            entry.models.push(ModelCatalogModel {
                id: id.clone(),
                name: name.clone(),
            });
        }
    }

    if providers.is_empty() {
        return None;
    }

    let _ = cache_model_catalog(paths, providers.values().cloned().collect());
    let mut out: Vec<ModelCatalogProvider> = providers.into_values().collect();
    for provider in &mut out {
        provider.models.sort_by(|a, b| a.id.cmp(&b.id));
    }
    out.sort_by(|a, b| a.provider.cmp(&b.provider));
    Some(out)
}

fn cache_model_catalog(paths: &crate::models::OpenClawPaths, providers: Vec<ModelCatalogProvider>) -> Option<()> {
    let cache_path = model_catalog_cache_path(paths);
    let now = unix_timestamp_secs();
    let cache = ModelCatalogProviderCache {
        cli_version: resolve_openclaw_version(),
        updated_at: now,
        providers,
        source: "openclaw models list --all --json".into(),
        error: None,
    };
    let _ = save_model_catalog_cache(&cache_path, &cache);
    Some(())
}

fn collect_model_catalog(cfg: &Value) -> Vec<ModelCatalogProvider> {
    let mut providers: BTreeMap<String, ModelCatalogProvider> = BTreeMap::new();

    if let Some(configured) = cfg.pointer("/models/providers").and_then(Value::as_object) {
        for (provider_name, provider_cfg) in configured {
            let provider_model_map = extract_catalog_models(provider_cfg).unwrap_or_default();
            let base_url = provider_cfg
                .get("baseUrl")
                .or_else(|| provider_cfg.get("base_url"))
                .and_then(Value::as_str)
                .map(str::to_string);

            providers.entry(provider_name.clone())
                .and_modify(|entry| {
                    if entry.base_url.is_none() {
                        entry.base_url = base_url.clone();
                    }
                    for model in provider_model_map.iter() {
                        if !entry.models.iter().any(|item| item.id == model.id) {
                            entry.models.push(model.clone());
                        }
                    }
                })
                .or_insert(ModelCatalogProvider {
                    provider: provider_name.clone(),
                    base_url,
                    models: provider_model_map,
                });
        }
    }

    if let Some(auth_profiles) = cfg.pointer("/auth/profiles").and_then(Value::as_object) {
        for profile in auth_profiles.values() {
            if let Some(provider_name) = profile
                .get("provider")
                .or_else(|| profile.get("name"))
                .and_then(Value::as_str)
            {
                providers.entry(provider_name.to_string())
                    .or_insert(ModelCatalogProvider {
                        provider: provider_name.to_string(),
                        base_url: None,
                        models: Vec::new(),
                    });
            }
        }
    }

    providers.into_values().collect()
}

fn extract_catalog_models(provider_cfg: &Value) -> Option<Vec<ModelCatalogModel>> {
    let mut model_items: BTreeMap<String, String> = BTreeMap::new();
    let raw_models = provider_cfg.get("models")?.as_array()?;
    for model in raw_models {
        let id = model.as_str().map(str::to_string).or_else(|| {
            model
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_string)
        });
        if let Some(id) = id {
            let name = model
                .get("name")
                .and_then(Value::as_str)
                .map(str::to_string);
            model_items.entry(id).or_insert(name.unwrap_or_default());
        }
    }
    if model_items.is_empty() {
        return None;
    }
    let models = model_items
        .into_iter()
        .map(|(id, name)| ModelCatalogModel {
            id,
            name: (!name.is_empty()).then_some(name),
        })
        .collect();
    Some(models)
}

fn collect_channel_nodes(cfg: &Value) -> Vec<ChannelNode> {
    let mut out = Vec::new();
    if let Some(channels) = cfg.get("channels") {
        walk_channel_nodes("channels", channels, &mut out);
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    out
}

fn walk_channel_nodes(prefix: &str, node: &Value, out: &mut Vec<ChannelNode>) {
    let Some(obj) = node.as_object() else {
        return;
    };

    if is_channel_like_node(prefix, obj) {
        let channel_type = resolve_channel_type(prefix, obj);
        let mode = resolve_channel_mode(obj);
        let allowlist = collect_channel_allowlist(obj);
        let has_model_field = obj.contains_key("model");
        let model = obj.get("model").and_then(read_model_value);
        out.push(ChannelNode {
            path: prefix.to_string(),
            channel_type,
            mode,
            allowlist,
            model,
            has_model_field,
            display_name: None,
            name_status: None,
        });
    }

    for (key, child) in obj {
        if key == "allowlist" || key == "model" || key == "mode" {
            continue;
        }
        if let Value::Object(_) = child {
            walk_channel_nodes(&format!("{prefix}.{key}"), child, out);
        }
    }
}

fn enrich_channel_display_names(
    paths: &crate::models::OpenClawPaths,
    cfg: &Value,
    nodes: &mut [ChannelNode],
) -> Result<(), String> {
    let mut grouped: BTreeMap<String, Vec<(usize, String, String)>> = BTreeMap::new();
    let mut local_names: Vec<(usize, String)> = Vec::new();

    for (index, node) in nodes.iter().enumerate() {
        if let Some((plugin, identifier, kind)) = resolve_channel_node_identity(cfg, node) {
            grouped
                .entry(plugin)
                .or_default()
                .push((index, identifier, kind));
        }
        if node.display_name.is_none() {
            if let Some(local_name) = channel_node_local_name(cfg, &node.path) {
                local_names.push((index, local_name));
            }
        }
    }
    for (index, local_name) in local_names {
        if let Some(node) = nodes.get_mut(index) {
            node.display_name = Some(local_name);
            node.name_status = Some("local".into());
        }
    }

    let cache_file = paths.base_dir.join(".clawpal-channel-name-cache.json");
    if nodes.is_empty() {
        if cache_file.exists() {
            let _ = fs::remove_file(&cache_file);
        }
        return Ok(());
    }

    for (plugin, entries) in grouped {
        if entries.is_empty() {
            continue;
        }
        let ids: Vec<String> = entries.iter().map(|(_, identifier, _)| identifier.clone()).collect();
        let kind = &entries[0].2;
        let mut args = vec![
            "channels".to_string(),
            "resolve".to_string(),
            "--json".to_string(),
            "--channel".to_string(),
            plugin.clone(),
            "--kind".to_string(),
            kind.clone(),
        ];
        for entry in &ids {
            args.push(entry.clone());
        }
        let args: Vec<&str> = args.iter().map(String::as_str).collect();
        let output = match run_openclaw_raw(&args) {
            Ok(output) => output,
            Err(_) => {
                for (index, _, _) in entries {
                    nodes[index].name_status = Some("resolve failed".into());
                }
                continue;
            }
        };
        if output.stdout.trim().is_empty() {
            for (index, _, _) in entries {
                nodes[index].name_status = Some("unresolved".into());
            }
            continue;
        }
        let json_str = extract_json_from_output(&output.stdout).unwrap_or("[]");
        let parsed: Vec<Value> = serde_json::from_str(json_str).unwrap_or_default();
        let mut name_map = HashMap::new();
        for item in parsed {
            let input = item.get("input").and_then(Value::as_str).unwrap_or_default().to_string();
            let resolved = item.get("resolved").and_then(Value::as_bool).unwrap_or(false);
            let name = item
                .get("name")
                .and_then(Value::as_str)
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty());
            let note = item.get("note").and_then(Value::as_str).map(|value| value.to_string());
            if !input.is_empty() {
                name_map.insert(input, (resolved, name, note));
            }
        }

        for (index, identifier, _) in entries {
            if let Some((resolved, name, note)) = name_map.get(&identifier) {
                if *resolved {
                    if let Some(name) = name {
                        nodes[index].display_name = Some(name.clone());
                        nodes[index].name_status = Some("resolved".into());
                    } else {
                        nodes[index].name_status = Some("resolved".into());
                    }
                } else if let Some(note) = note {
                    nodes[index].name_status = Some(note.clone());
                } else {
                    nodes[index].name_status = Some("unresolved".into());
                }
            } else {
                nodes[index].name_status = Some("unresolved".into());
            }
        }
    }

    let _ = save_json_cache(&cache_file, nodes);
    Ok(())
}

#[derive(Serialize, Deserialize)]
struct ChannelNameCacheEntry {
    path: String,
    display_name: Option<String>,
    name_status: Option<String>,
}

fn save_json_cache(cache_file: &Path, nodes: &[ChannelNode]) -> Result<(), String> {
    let payload: Vec<ChannelNameCacheEntry> = nodes
        .iter()
        .map(|node| ChannelNameCacheEntry {
            path: node.path.clone(),
            display_name: node.display_name.clone(),
            name_status: node.name_status.clone(),
        })
        .collect();
    write_text(cache_file, &serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?)
}

fn resolve_channel_node_identity(cfg: &Value, node: &ChannelNode) -> Option<(String, String, String)> {
    let parts: Vec<&str> = node.path.split('.').collect();
    if parts.len() < 2 || parts[0] != "channels" {
        return None;
    }
    let plugin = parts[1].to_string();
    let identifier = channel_last_segment(node.path.as_str())?;
    let config_node = channel_lookup_node(cfg, &node.path);
    let kind = if node.channel_type.as_deref() == Some("dm") || node.path.ends_with(".dm") {
        "user".to_string()
    } else if config_node
        .and_then(|value| value.get("users").or(value.get("members")).or_else(|| value.get("peerIds")))
        .is_some()
    {
        "user".to_string()
    } else {
        "group".to_string()
    };
    Some((plugin, identifier, kind))
}

fn channel_last_segment(path: &str) -> Option<String> {
    path.split('.').next_back().map(|value| value.to_string())
}

fn channel_node_local_name(cfg: &Value, path: &str) -> Option<String> {
    channel_lookup_node(cfg, path).and_then(|node| {
        if let Some(slug) = node.get("slug").and_then(Value::as_str) {
            let trimmed = slug.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
        if let Some(name) = node.get("name").and_then(Value::as_str) {
            let trimmed = name.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
        None
    })
}

fn channel_lookup_node<'a>(cfg: &'a Value, path: &str) -> Option<&'a Value> {
    let mut current = cfg;
    for part in path.split('.') {
        current = current.get(part)?;
    }
    Some(current)
}

fn is_channel_like_node(prefix: &str, obj: &serde_json::Map<String, Value>) -> bool {
    if prefix == "channels" {
        return false;
    }
    if obj.contains_key("model")
        || obj.contains_key("type")
        || obj.contains_key("mode")
        || obj.contains_key("policy")
        || obj.contains_key("allowlist")
        || obj.contains_key("allowFrom")
        || obj.contains_key("groupAllowFrom")
        || obj.contains_key("dmPolicy")
        || obj.contains_key("groupPolicy")
        || obj.contains_key("guilds")
        || obj.contains_key("accounts")
        || obj.contains_key("dm")
        || obj.contains_key("users")
        || obj.contains_key("enabled")
        || obj.contains_key("token")
        || obj.contains_key("botToken")
    {
        return true;
    }
    if prefix.contains(".accounts.") || prefix.contains(".guilds.") || prefix.contains(".channels.") {
        return true;
    }
    if prefix.ends_with(".dm") || prefix.ends_with(".default") {
        return true;
    }
    false
}

fn resolve_channel_type(prefix: &str, obj: &serde_json::Map<String, Value>) -> Option<String> {
    obj.get("type")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            if prefix.ends_with(".dm") {
                Some("dm".into())
            } else if prefix.contains(".accounts.") {
                Some("account".into())
            } else if prefix.contains(".channels.") && prefix.contains(".guilds.") {
                Some("channel".into())
            } else if prefix.contains(".guilds.") {
                Some("guild".into())
            } else if obj.contains_key("guilds") {
                Some("platform".into())
            } else if obj.contains_key("accounts") {
                Some("platform".into())
            } else {
                None
            }
        })
}

fn resolve_channel_mode(obj: &serde_json::Map<String, Value>) -> Option<String> {
    let mut modes: Vec<String> = Vec::new();
    if let Some(v) = obj.get("mode").and_then(Value::as_str) {
        modes.push(v.to_string());
    }
    if let Some(v) = obj.get("policy").and_then(Value::as_str) {
        if !modes.iter().any(|m| m == v) {
            modes.push(v.to_string());
        }
    }
    if let Some(v) = obj.get("dmPolicy").and_then(Value::as_str) {
        if !modes.iter().any(|m| m == v) {
            modes.push(v.to_string());
        }
    }
    if let Some(v) = obj.get("groupPolicy").and_then(Value::as_str) {
        if !modes.iter().any(|m| m == v) {
            modes.push(v.to_string());
        }
    }
    if modes.is_empty() {
        None
    } else {
        Some(modes.join(" / "))
    }
}

fn collect_channel_allowlist(obj: &serde_json::Map<String, Value>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut uniq = HashSet::<String>::new();
    for key in ["allowlist", "allowFrom", "groupAllowFrom"] {
        if let Some(values) = obj.get(key).and_then(Value::as_array) {
            for value in values.iter().filter_map(Value::as_str) {
                let next = value.to_string();
                if uniq.insert(next.clone()) {
                    out.push(next);
                }
            }
        }
    }
    if let Some(values) = obj.get("users").and_then(Value::as_array) {
        for value in values.iter().filter_map(Value::as_str) {
            let next = value.to_string();
            if uniq.insert(next.clone()) {
                out.push(next);
            }
        }
    }
    out
}

fn collect_agent_ids(cfg: &Value) -> Vec<String> {
    let mut ids = Vec::new();
    if let Some(agents) = cfg.get("agents").and_then(|v| v.get("list")).and_then(Value::as_array) {
        for agent in agents {
            if let Some(id) = agent.get("id").and_then(Value::as_str) {
                ids.push(id.to_string());
            }
        }
    }
    ids
}

fn collect_model_bindings(cfg: &Value, profiles: &[ModelProfile]) -> Vec<ModelBinding> {
    let mut out = Vec::new();
    let global = cfg
        .pointer("/agents/defaults/model")
        .or_else(|| cfg.pointer("/agents/default/model"))
        .and_then(read_model_value);
    out.push(ModelBinding {
        scope: "global".into(),
        scope_id: "global".into(),
        model_profile_id: find_profile_by_model(profiles, global.as_deref()),
        model_value: global,
        path: Some("agents.defaults.model".into()),
    });

    if let Some(agents) = cfg.get("agents").and_then(|v| v.get("list")).and_then(Value::as_array) {
        for agent in agents {
            let id = agent.get("id").and_then(Value::as_str).unwrap_or("agent");
            let model = agent.get("model").and_then(read_model_value);
            out.push(ModelBinding {
                scope: "agent".into(),
                scope_id: id.to_string(),
                model_profile_id: find_profile_by_model(profiles, model.as_deref()),
                model_value: model,
                path: Some(format!("agents.list.{id}.model")),
            });
        }
    }

    fn walk_channel_binding(prefix: &str, node: &Value, out: &mut Vec<ModelBinding>, profiles: &[ModelProfile]) {
        if let Some(obj) = node.as_object() {
            if let Some(model) = obj.get("model").and_then(read_model_value) {
                out.push(ModelBinding {
                    scope: "channel".into(),
                    scope_id: prefix.to_string(),
                    model_profile_id: find_profile_by_model(profiles, Some(&model)),
                    model_value: Some(model),
                    path: Some(format!("{}.model", prefix)),
                });
            }
            for (k, child) in obj {
                if let Value::Object(_) = child {
                    walk_channel_binding(&format!("{}.{}", prefix, k), child, out, profiles);
                }
            }
        }
    }

    if let Some(channels) = cfg.get("channels") {
        walk_channel_binding("channels", channels, &mut out, profiles);
    }

    out
}

fn find_profile_by_model(profiles: &[ModelProfile], value: Option<&str>) -> Option<String> {
    let value = value?;
    let normalized = normalize_model_ref(value);
    for profile in profiles {
        if normalize_model_ref(&profile_to_model_value(profile)) == normalized
            || normalize_model_ref(&profile.model) == normalized
        {
            return Some(profile.id.clone());
        }
    }
    None
}

fn resolve_auth_ref_for_provider(cfg: &Value, provider: &str) -> Option<String> {
    let provider = provider.trim().to_lowercase();
    if provider.is_empty() {
        return None;
    }
    if let Some(auth_profiles) = cfg.pointer("/auth/profiles").and_then(Value::as_object) {
        let mut fallback = None;
        for (profile_id, profile) in auth_profiles {
            let entry_provider = profile.get("provider").or_else(|| profile.get("name"));
            if let Some(entry_provider) = entry_provider.and_then(Value::as_str) {
                if entry_provider.trim().eq_ignore_ascii_case(&provider) {
                    if profile_id.ends_with(":default") {
                        return Some(profile_id.clone());
                    }
                    if fallback.is_none() {
                        fallback = Some(profile_id.clone());
                    }
                }
            }
        }
        if fallback.is_some() {
            return fallback;
        }
    }
    None
}

#[tauri::command]
pub fn read_raw_config() -> Result<String, String> {
    let paths = resolve_paths();
    let cfg = read_openclaw_config(&paths)?;
    serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())
}

// ---- Config baseline for dirty tracking ----

fn baseline_path(paths: &crate::models::OpenClawPaths) -> std::path::PathBuf {
    paths.clawpal_dir.join("config-baseline.json")
}

#[tauri::command]
pub fn save_config_baseline() -> Result<bool, String> {
    let paths = resolve_paths();
    let cfg = read_openclaw_config(&paths)?;
    let text = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    let bp = baseline_path(&paths);
    fs::create_dir_all(bp.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::write(&bp, text).map_err(|e| e.to_string())?;
    Ok(true)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigDirtyState {
    pub dirty: bool,
    pub baseline: String,
    pub current: String,
}

#[tauri::command]
pub fn check_config_dirty() -> Result<ConfigDirtyState, String> {
    let paths = resolve_paths();
    let cfg = read_openclaw_config(&paths)?;
    let current = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    let bp = baseline_path(&paths);
    let baseline = if bp.exists() {
        fs::read_to_string(&bp).map_err(|e| e.to_string())?
    } else {
        // No baseline yet — treat current as clean, save it
        fs::create_dir_all(bp.parent().unwrap()).map_err(|e| e.to_string())?;
        fs::write(&bp, &current).map_err(|e| e.to_string())?;
        current.clone()
    };
    let dirty = baseline.trim() != current.trim();
    Ok(ConfigDirtyState { dirty, baseline, current })
}

#[tauri::command]
pub fn discard_config_changes() -> Result<bool, String> {
    let paths = resolve_paths();
    let bp = baseline_path(&paths);
    if !bp.exists() {
        return Err("No baseline config found".into());
    }
    let baseline_text = fs::read_to_string(&bp).map_err(|e| e.to_string())?;
    let baseline: Value = serde_json::from_str(&baseline_text).map_err(|e| e.to_string())?;

    // Save current as snapshot before discarding
    let cfg = read_openclaw_config(&paths)?;
    let current_text = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    let _ = add_snapshot(
        &paths.history_dir,
        &paths.metadata_path,
        None,
        "discard-changes",
        true,
        &current_text,
        None,
    );

    write_json(&paths.config_path, &baseline)?;
    Ok(true)
}

#[tauri::command]
pub async fn apply_pending_changes() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let paths = resolve_paths();
        // Save current config as new baseline
        let cfg = read_openclaw_config(&paths)?;
        let text = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
        let bp = baseline_path(&paths);
        fs::create_dir_all(bp.parent().unwrap()).map_err(|e| e.to_string())?;
        fs::write(&bp, &text).map_err(|e| e.to_string())?;

        // Restart gateway
        run_openclaw_raw(&["gateway", "restart"])?;
        Ok(true)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn resolve_full_api_key(profile_id: String) -> Result<String, String> {
    let paths = resolve_paths();
    let profiles = load_model_profiles(&paths);
    let profile = profiles.iter().find(|p| p.id == profile_id)
        .ok_or_else(|| "Profile not found".to_string())?;
    let key = resolve_profile_api_key(profile, &paths.base_dir);
    if key.is_empty() {
        return Err("No API key configured for this profile".to_string());
    }
    Ok(key)
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    if url.trim().is_empty() {
        return Err("URL is required".into());
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(&url).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open").arg(&url).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd").args(["/c", "start", &url]).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn chat_via_openclaw(agent_id: String, message: String, session_id: Option<String>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut args = vec![
            "agent".to_string(),
            "--local".to_string(),
            "--agent".to_string(),
            agent_id,
            "--message".to_string(),
            message,
            "--json".to_string(),
            "--no-color".to_string(),
        ];
        if let Some(sid) = session_id {
            args.push("--session-id".to_string());
            args.push(sid);
        }

        let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        let output = run_openclaw_raw(&arg_refs)?;
        let json_str = extract_json_from_output(&output.stdout)
            .ok_or_else(|| format!("No JSON in openclaw output: {}", output.stdout))?;
        serde_json::from_str(json_str)
            .map_err(|e| format!("Parse openclaw response failed: {}", e))
    })
    .await
    .map_err(|e| format!("Task join failed: {}", e))?
}

// ---- Backup / Restore ----

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub path: String,
    pub created_at: String,
    pub size_bytes: u64,
}

#[tauri::command]
pub fn backup_before_upgrade() -> Result<BackupInfo, String> {
    let paths = resolve_paths();
    let backups_dir = paths.clawpal_dir.join("backups");
    fs::create_dir_all(&backups_dir).map_err(|e| format!("Failed to create backups dir: {e}"))?;

    let now_secs = unix_timestamp_secs();
    let now_dt = chrono::DateTime::<chrono::Utc>::from_timestamp(now_secs as i64, 0);
    let name = now_dt
        .map(|dt| dt.format("%Y-%m-%d_%H%M%S").to_string())
        .unwrap_or_else(|| format!("{now_secs}"));
    let backup_dir = backups_dir.join(&name);
    fs::create_dir_all(&backup_dir).map_err(|e| format!("Failed to create backup dir: {e}"))?;

    let mut total_bytes = 0u64;

    // Copy config file
    if paths.config_path.exists() {
        let dest = backup_dir.join("openclaw.json");
        fs::copy(&paths.config_path, &dest).map_err(|e| format!("Failed to copy config: {e}"))?;
        total_bytes += fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
    }

    // Copy directories, excluding sessions and archive
    let skip_dirs: HashSet<&str> = ["sessions", "archive", ".clawpal"].iter().copied().collect();
    copy_dir_recursive(&paths.base_dir, &backup_dir, &skip_dirs, &mut total_bytes)?;

    Ok(BackupInfo {
        name: name.clone(),
        path: backup_dir.to_string_lossy().to_string(),
        created_at: format_timestamp_from_unix(now_secs),
        size_bytes: total_bytes,
    })
}

fn copy_dir_recursive(src: &Path, dst: &Path, skip_dirs: &HashSet<&str>, total: &mut u64) -> Result<(), String> {
    let entries = fs::read_dir(src).map_err(|e| format!("Failed to read dir {}: {e}", src.display()))?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        // Skip the config file (already copied separately) and skip dirs
        if name_str == "openclaw.json" {
            continue;
        }

        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        let dest = dst.join(&name);

        if file_type.is_dir() {
            if skip_dirs.contains(name_str.as_ref()) {
                continue;
            }
            fs::create_dir_all(&dest).map_err(|e| format!("Failed to create dir {}: {e}", dest.display()))?;
            copy_dir_recursive(&entry.path(), &dest, skip_dirs, total)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), &dest).map_err(|e| format!("Failed to copy {}: {e}", name_str))?;
            *total += fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn list_backups() -> Result<Vec<BackupInfo>, String> {
    let paths = resolve_paths();
    let backups_dir = paths.clawpal_dir.join("backups");
    if !backups_dir.exists() {
        return Ok(Vec::new());
    }
    let mut backups = Vec::new();
    let entries = fs::read_dir(&backups_dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();
        let size = dir_size(&path);
        let created_at = fs::metadata(&path)
            .and_then(|m| m.created())
            .map(|t| {
                let secs = t.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
                format_timestamp_from_unix(secs)
            })
            .unwrap_or_else(|_| name.clone());
        backups.push(BackupInfo {
            name,
            path: path.to_string_lossy().to_string(),
            created_at,
            size_bytes: size,
        });
    }
    backups.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(backups)
}

fn dir_size(path: &Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                total += dir_size(&entry.path());
            } else {
                total += fs::metadata(entry.path()).map(|m| m.len()).unwrap_or(0);
            }
        }
    }
    total
}

#[tauri::command]
pub fn restore_from_backup(backup_name: String) -> Result<String, String> {
    let paths = resolve_paths();
    let backup_dir = paths.clawpal_dir.join("backups").join(&backup_name);
    if !backup_dir.exists() {
        return Err(format!("Backup '{}' not found", backup_name));
    }

    // Restore config file
    let backup_config = backup_dir.join("openclaw.json");
    if backup_config.exists() {
        fs::copy(&backup_config, &paths.config_path)
            .map_err(|e| format!("Failed to restore config: {e}"))?;
    }

    // Restore other directories (agents except sessions/archive, memory, etc.)
    let skip_dirs: HashSet<&str> = ["sessions", "archive", ".clawpal"].iter().copied().collect();
    restore_dir_recursive(&backup_dir, &paths.base_dir, &skip_dirs)?;

    Ok(format!("Restored from backup '{}'", backup_name))
}

fn restore_dir_recursive(src: &Path, dst: &Path, skip_dirs: &HashSet<&str>) -> Result<(), String> {
    let entries = fs::read_dir(src).map_err(|e| format!("Failed to read backup dir: {e}"))?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        if name_str == "openclaw.json" {
            continue; // Already restored separately
        }

        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        let dest = dst.join(&name);

        if file_type.is_dir() {
            if skip_dirs.contains(name_str.as_ref()) {
                continue;
            }
            fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
            restore_dir_recursive(&entry.path(), &dest, skip_dirs)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), &dest).map_err(|e| format!("Failed to restore {}: {e}", name_str))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn delete_backup(backup_name: String) -> Result<bool, String> {
    let paths = resolve_paths();
    let backup_dir = paths.clawpal_dir.join("backups").join(&backup_name);
    if !backup_dir.exists() {
        return Ok(false);
    }
    fs::remove_dir_all(&backup_dir).map_err(|e| format!("Failed to delete backup: {e}"))?;
    Ok(true)
}

fn resolve_model_provider_base_url(cfg: &Value, provider: &str) -> Option<String> {
    let provider = provider.trim();
    if provider.is_empty() {
        return None;
    }
    cfg.pointer("/models/providers")
        .and_then(Value::as_object)
        .and_then(|providers| providers.get(provider))
        .and_then(Value::as_object)
        .and_then(|provider_cfg| {
            provider_cfg
                .get("baseUrl")
                .or_else(|| provider_cfg.get("base_url"))
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| {
                    provider_cfg
                        .get("apiBase")
                        .or_else(|| provider_cfg.get("api_base"))
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
        })
}
