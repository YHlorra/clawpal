import { invoke } from "@tauri-apps/api/core";
import type { AgentOverview, ApplyResult, HistoryItem, ModelCatalogProvider, ModelProfile, PreviewResult, Recipe, ResolvedApiKey, StatusLight, SystemStatus, DoctorReport, MemoryFile, SessionFile } from "./types";

export const api = {
  getSystemStatus: (): Promise<SystemStatus> =>
    invoke("get_system_status", {}),
  getStatusLight: (): Promise<StatusLight> =>
    invoke("get_status_light", {}),
  getCachedModelCatalog: (): Promise<ModelCatalogProvider[]> =>
    invoke("get_cached_model_catalog", {}),
  refreshModelCatalog: (): Promise<ModelCatalogProvider[]> =>
    invoke("refresh_model_catalog", {}),
  listRecipes: (source?: string): Promise<Recipe[]> =>
    invoke("list_recipes", source ? { source } : {}),
  previewApply: (recipeId: string, params: Record<string, string>, source?: string): Promise<PreviewResult> =>
    invoke("preview_apply", { recipeId, params, source }),
  applyRecipe: (recipeId: string, params: Record<string, string>, source?: string): Promise<ApplyResult> =>
    invoke("apply_recipe", { recipeId, params, source }),
  listHistory: (limit = 20, offset = 0): Promise<{ items: HistoryItem[] }> =>
    invoke("list_history", { limit, offset }),
  previewRollback: (snapshotId: string): Promise<PreviewResult> =>
    invoke("preview_rollback", { snapshotId }),
  rollback: (snapshotId: string): Promise<ApplyResult> =>
    invoke("rollback", { snapshotId }),
  listModelProfiles: (): Promise<ModelProfile[]> =>
    invoke("list_model_profiles", {}),
  listModelCatalog: (): Promise<ModelCatalogProvider[]> =>
    invoke("list_model_catalog", {}),
  extractModelProfilesFromConfig: (): Promise<{ created: number; reused: number; skippedInvalid: number }> =>
    invoke("extract_model_profiles_from_config", {}),
  upsertModelProfile: (profile: ModelProfile): Promise<ModelProfile> =>
    invoke("upsert_model_profile", { profile }),
  deleteModelProfile: (profileId: string): Promise<boolean> =>
    invoke("delete_model_profile", { profile_id: profileId }),
  resolveApiKeys: (): Promise<ResolvedApiKey[]> =>
    invoke("resolve_api_keys", {}),
  listAgentIds: (): Promise<string[]> =>
    invoke("list_agent_ids", {}),
  listAgentsOverview: (): Promise<AgentOverview[]> =>
    invoke("list_agents_overview", {}),
  listMemoryFiles: (): Promise<MemoryFile[]> =>
    invoke("list_memory_files", {}),
  deleteMemoryFile: (filePath: string): Promise<boolean> =>
    invoke("delete_memory_file", { path: filePath }),
  clearMemory: (): Promise<number> =>
    invoke("clear_memory", {}),
  listSessionFiles: (): Promise<SessionFile[]> =>
    invoke("list_session_files", {}),
  deleteSessionFile: (filePath: string): Promise<boolean> =>
    invoke("delete_session_file", { path: filePath }),
  clearAllSessions: (): Promise<number> =>
    invoke("clear_all_sessions", {}),
  clearAgentSessions: (agentId: string): Promise<number> =>
    invoke("clear_agent_sessions", { agentId }),
  runDoctor: (): Promise<DoctorReport> =>
    invoke("run_doctor_command", {}),
  fixIssues: (ids: string[]): Promise<{ ok: boolean; applied: string[]; remainingIssues: string[] }> =>
    invoke("fix_issues", { ids }),
  readRawConfig: (): Promise<string> =>
    invoke("read_raw_config", {}),
  resolveFullApiKey: (profileId: string): Promise<string> =>
    invoke("resolve_full_api_key", { profileId }),
  openUrl: (url: string): Promise<void> =>
    invoke("open_url", { url }),
  chatViaOpenclaw: (agentId: string, message: string, sessionId?: string): Promise<Record<string, unknown>> =>
    invoke("chat_via_openclaw", { agentId, message, sessionId }),
};
