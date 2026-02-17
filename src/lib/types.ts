export type Severity = "low" | "medium" | "high";

export interface DiscordGuildChannel {
  guildId: string;
  guildName: string;
  channelId: string;
  channelName: string;
}

export interface RecipeParam {
  id: string;
  label: string;
  type: "string" | "number" | "boolean" | "textarea" | "discord_guild" | "discord_channel" | "model_profile" | "agent";
  required: boolean;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  version: string;
  tags: string[];
  difficulty: "easy" | "normal" | "advanced";
  params: RecipeParam[];
  action?: string;
  patchTemplate: string;
  impactCategory: string;
  impactSummary: string;
}

export interface ChangeItem {
  path: string;
  op: string;
  risk: string;
  reason?: string;
}

export interface PreviewResult {
  recipeId: string;
  diff: string;
  configBefore: string;
  configAfter: string;
  changes: ChangeItem[];
  overwritesExisting: boolean;
  canRollback: boolean;
  impactLevel: string;
  warnings: string[];
}

export interface ApplyResult {
  ok: boolean;
  snapshotId?: string;
  configPath: string;
  backupPath?: string;
  warnings: string[];
  errors: string[];
}

export interface SystemStatus {
  healthy: boolean;
  configPath: string;
  openclawDir: string;
  clawpalDir: string;
  openclawVersion: string;
  activeAgents: number;
  snapshots: number;
  openclawUpdate?: {
    installedVersion: string;
    latestVersion?: string;
    upgradeAvailable: boolean;
    channel?: string;
    details?: string;
    source: string;
    checkedAt: string;
  };
  channels: {
    configuredChannels: number;
    channelModelOverrides: number;
    channelExamples: string[];
  };
  models: {
    globalDefaultModel?: string;
    agentOverrides: string[];
    channelOverrides: string[];
  };
  memory: {
    fileCount: number;
    totalBytes: number;
    files: { path: string; sizeBytes: number }[];
  };
  sessions: {
    totalSessionFiles: number;
    totalArchiveFiles: number;
    totalBytes: number;
    byAgent: { agent: string; sessionFiles: number; archiveFiles: number; totalBytes: number }[];
  };
}

export interface MemoryFile {
  path: string;
  relativePath: string;
  sizeBytes: number;
}

export interface SessionFile {
  path: string;
  relativePath: string;
  agent: string;
  kind: "sessions" | "archive";
  sizeBytes: number;
}

export interface ModelProfile {
  id: string;
  name: string;
  provider: string;
  model: string;
  authRef: string;
  apiKey?: string;
  baseUrl?: string;
  description?: string;
  enabled: boolean;
}

export interface ModelCatalogModel {
  id: string;
  name?: string;
}

export interface ModelCatalogProvider {
  provider: string;
  baseUrl?: string;
  models: ModelCatalogModel[];
}

export interface ProviderAuthSuggestion {
  authRef: string | null;
  hasKey: boolean;
  source: string;
}

export interface ResolvedApiKey {
  profileId: string;
  maskedKey: string;
}

export interface HistoryItem {
  id: string;
  recipeId?: string;
  createdAt: string;
  source: string;
  canRollback: boolean;
  rollbackOf?: string;
}

export interface DoctorIssue {
  id: string;
  code: string;
  severity: "error" | "warn" | "info";
  message: string;
  autoFixable: boolean;
  fixHint?: string;
}

export interface DoctorReport {
  ok: boolean;
  score: number;
  issues: DoctorIssue[];
}

export interface AgentOverview {
  id: string;
  name?: string;
  emoji?: string;
  model: string | null;
  channels: string[];
  online: boolean;
  workspace?: string;
}

export interface StatusLight {
  healthy: boolean;
  activeAgents: number;
  globalDefaultModel?: string;
}

export interface ConfigDirtyState {
  dirty: boolean;
  baseline: string;
  current: string;
}

export interface BackupInfo {
  name: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
}
