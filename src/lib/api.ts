import { invoke } from "@tauri-apps/api/core";
import type { AgentOverview, AgentSessionAnalysis, ApplyResult, BackupInfo, ChannelNode, ConfigDirtyState, DiscordGuildChannel, HistoryItem, ModelCatalogProvider, ModelProfile, PreviewResult, ProviderAuthSuggestion, Recipe, ResolvedApiKey, StatusLight, SystemStatus, DoctorReport, MemoryFile, SessionFile, SshHost, SshExecResult, SftpEntry } from "./types";

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
  applyConfigPatch: (patchTemplate: string, params: Record<string, string>): Promise<ApplyResult> =>
    invoke("apply_config_patch", { patchTemplate, params }),
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
  resolveProviderAuth: (provider: string): Promise<ProviderAuthSuggestion> =>
    invoke("resolve_provider_auth", { provider }),
  resolveApiKeys: (): Promise<ResolvedApiKey[]> =>
    invoke("resolve_api_keys", {}),
  listAgentIds: (): Promise<string[]> =>
    invoke("list_agent_ids", {}),
  listAgentsOverview: (): Promise<AgentOverview[]> =>
    invoke("list_agents_overview", {}),
  createAgent: (agentId: string, modelProfileId?: string, independent?: boolean): Promise<AgentOverview> =>
    invoke("create_agent", { agentId, modelProfileId, independent }),
  deleteAgent: (agentId: string): Promise<boolean> =>
    invoke("delete_agent", { agentId }),
  setupAgentIdentity: (agentId: string, name: string, emoji?: string): Promise<boolean> =>
    invoke("setup_agent_identity", { agentId, name, emoji }),
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
  analyzeSessions: (): Promise<AgentSessionAnalysis[]> =>
    invoke("analyze_sessions", {}),
  deleteSessionsByIds: (agentId: string, sessionIds: string[]): Promise<number> =>
    invoke("delete_sessions_by_ids", { agentId, sessionIds }),
  previewSession: (agentId: string, sessionId: string): Promise<{ role: string; content: string }[]> =>
    invoke("preview_session", { agentId, sessionId }),
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
  backupBeforeUpgrade: (): Promise<BackupInfo> =>
    invoke("backup_before_upgrade", {}),
  listBackups: (): Promise<BackupInfo[]> =>
    invoke("list_backups", {}),
  restoreFromBackup: (backupName: string): Promise<string> =>
    invoke("restore_from_backup", { backupName }),
  deleteBackup: (backupName: string): Promise<boolean> =>
    invoke("delete_backup", { backupName }),
  listChannelsMinimal: (): Promise<ChannelNode[]> =>
    invoke("list_channels_minimal", {}),
  listDiscordGuildChannels: (): Promise<DiscordGuildChannel[]> =>
    invoke("list_discord_guild_channels", {}),
  refreshDiscordGuildChannels: (): Promise<DiscordGuildChannel[]> =>
    invoke("refresh_discord_guild_channels", {}),
  restartGateway: (): Promise<boolean> =>
    invoke("restart_gateway", {}),
  setGlobalModel: (profileId: string | null): Promise<boolean> =>
    invoke("set_global_model", { profileId }),
  listBindings: (): Promise<Record<string, unknown>[]> =>
    invoke("list_bindings", {}),
  assignChannelAgent: (channelType: string, peerId: string, agentId: string | null): Promise<boolean> =>
    invoke("assign_channel_agent", { channelType, peerId, agentId }),
  saveConfigBaseline: (): Promise<boolean> =>
    invoke("save_config_baseline", {}),
  checkConfigDirty: (): Promise<ConfigDirtyState> =>
    invoke("check_config_dirty", {}),
  discardConfigChanges: (): Promise<boolean> =>
    invoke("discard_config_changes", {}),
  applyPendingChanges: (): Promise<boolean> =>
    invoke("apply_pending_changes", {}),

  // SSH host management
  listSshHosts: (): Promise<SshHost[]> =>
    invoke("list_ssh_hosts", {}),
  upsertSshHost: (host: SshHost): Promise<SshHost> =>
    invoke("upsert_ssh_host", { host }),
  deleteSshHost: (hostId: string): Promise<boolean> =>
    invoke("delete_ssh_host", { hostId }),

  // SSH connection
  sshConnect: (hostId: string): Promise<boolean> =>
    invoke("ssh_connect", { hostId }),
  sshDisconnect: (hostId: string): Promise<boolean> =>
    invoke("ssh_disconnect", { hostId }),
  sshStatus: (hostId: string): Promise<string> =>
    invoke("ssh_status", { hostId }),

  // SSH primitives
  sshExec: (hostId: string, command: string): Promise<SshExecResult> =>
    invoke("ssh_exec", { hostId, command }),
  sftpReadFile: (hostId: string, path: string): Promise<string> =>
    invoke("sftp_read_file", { hostId, path }),
  sftpWriteFile: (hostId: string, path: string, content: string): Promise<boolean> =>
    invoke("sftp_write_file", { hostId, path, content }),
  sftpListDir: (hostId: string, path: string): Promise<SftpEntry[]> =>
    invoke("sftp_list_dir", { hostId, path }),
  sftpRemoveFile: (hostId: string, path: string): Promise<boolean> =>
    invoke("sftp_remove_file", { hostId, path }),

  // Remote business commands
  remoteReadRawConfig: (hostId: string): Promise<unknown> =>
    invoke("remote_read_raw_config", { hostId }),
  remoteGetSystemStatus: (hostId: string): Promise<Record<string, unknown>> =>
    invoke("remote_get_system_status", { hostId }),
};
