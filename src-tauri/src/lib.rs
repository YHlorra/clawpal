use crate::commands::{
    apply_config_patch, fix_issues, get_system_status, get_status_light, list_history, list_recipes,
    list_model_profiles, upsert_model_profile, delete_model_profile,
    list_model_catalog, get_cached_model_catalog, refresh_model_catalog, resolve_provider_auth,
    check_openclaw_update, extract_model_profiles_from_config,
    list_agent_ids, list_agents_overview, create_agent, delete_agent, setup_agent_identity, list_memory_files, delete_memory_file, clear_memory, list_session_files,
    delete_session_file, clear_all_sessions, clear_agent_sessions, analyze_sessions, delete_sessions_by_ids, preview_session,
    preview_rollback, rollback, run_doctor_command,
    resolve_api_keys, read_raw_config, resolve_full_api_key, open_url, chat_via_openclaw,
    backup_before_upgrade, list_backups, restore_from_backup, delete_backup,
    list_channels_minimal,
    list_discord_guild_channels,
    refresh_discord_guild_channels,
    restart_gateway,
    set_global_model,
    list_bindings,
    assign_channel_agent,
    save_config_baseline, check_config_dirty, discard_config_changes, apply_pending_changes,
};

pub mod commands;
pub mod config_io;
pub mod doctor;
pub mod history;
pub mod models;
pub mod recipe;
pub mod ssh;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_system_status,
            get_status_light,
            list_recipes,
            list_model_profiles,
            list_model_catalog,
            get_cached_model_catalog,
            refresh_model_catalog,
            upsert_model_profile,
            delete_model_profile,
            resolve_provider_auth,
            list_agent_ids,
            list_agents_overview,
            create_agent,
            delete_agent,
            setup_agent_identity,
            list_memory_files,
            delete_memory_file,
            clear_memory,
            list_session_files,
            delete_session_file,
            clear_all_sessions,
            clear_agent_sessions,
            analyze_sessions,
            delete_sessions_by_ids,
            preview_session,
            check_openclaw_update,
            extract_model_profiles_from_config,
            apply_config_patch,
            list_history,
            preview_rollback,
            rollback,
            run_doctor_command,
            fix_issues,
            resolve_api_keys,
            read_raw_config,
            resolve_full_api_key,
            open_url,
            chat_via_openclaw,
            backup_before_upgrade,
            list_backups,
            restore_from_backup,
            delete_backup,
            list_channels_minimal,
            list_discord_guild_channels,
            refresh_discord_guild_channels,
            restart_gateway,
            set_global_model,
            list_bindings,
            assign_channel_agent,
            save_config_baseline,
            check_config_dirty,
            discard_config_changes,
            apply_pending_changes,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run app");
}
