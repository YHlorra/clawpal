use crate::commands::{
    apply_recipe, fix_issues, get_system_status, get_status_light, list_history, list_recipes, preview_apply,
    list_model_profiles, upsert_model_profile, delete_model_profile,
    list_model_catalog, get_cached_model_catalog, refresh_model_catalog,
    check_openclaw_update, extract_model_profiles_from_config,
    list_agent_ids, list_agents_overview, list_memory_files, delete_memory_file, clear_memory, list_session_files,
    delete_session_file, clear_all_sessions, clear_agent_sessions,
    preview_rollback, rollback, run_doctor_command,
    resolve_api_keys, read_raw_config, resolve_full_api_key, open_url, chat_via_openclaw,
};

pub mod commands;
pub mod config_io;
pub mod doctor;
pub mod history;
pub mod models;
pub mod recipe;

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
            list_agent_ids,
            list_agents_overview,
            list_memory_files,
            delete_memory_file,
            clear_memory,
            list_session_files,
            delete_session_file,
            clear_all_sessions,
            clear_agent_sessions,
            check_openclaw_update,
            extract_model_profiles_from_config,
            preview_apply,
            apply_recipe,
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
        ])
        .run(tauri::generate_context!())
        .expect("failed to run app");
}
