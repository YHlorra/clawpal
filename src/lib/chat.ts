import { api } from "./api";
import type { ModelProfile } from "./types";

export const SYSTEM_PROMPT = `You are ClawPal, an AI assistant that helps users configure OpenClaw.
You have tools to read the current config, preview changes, apply changes, list recipes, list agents, and run diagnostics.
When a user asks to change configuration:
1. Read the current config to understand what exists
2. Generate the appropriate config patch
3. Preview the change and show the diff to the user
4. Only apply after the user confirms

Always explain what you're about to do before doing it. Be concise.`;

export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "read_config",
      description: "Read the current OpenClaw configuration file",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_agents",
      description: "List all configured agents with their models and channels",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_recipes",
      description: "List available configuration recipes",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "preview_change",
      description: "Preview a configuration change by providing a recipe ID and parameters",
      parameters: {
        type: "object",
        properties: {
          recipe_id: { type: "string", description: "The recipe ID to preview" },
          params: { type: "object", description: "Parameters for the recipe" },
        },
        required: ["recipe_id", "params"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_doctor",
      description: "Run configuration diagnostics to check for issues",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

export async function executeToolCall(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "read_config":
      return await api.readRawConfig();
    case "list_agents":
      return JSON.stringify(await api.listAgentsOverview(), null, 2);
    case "list_recipes": {
      const recipes = await api.listRecipes();
      return JSON.stringify(recipes.map((r) => ({ id: r.id, name: r.name, description: r.description })), null, 2);
    }
    case "preview_change": {
      const recipeId = args.recipe_id as string;
      const params = args.params as Record<string, string>;
      const preview = await api.previewApply(recipeId, params);
      return JSON.stringify({ diff: preview.diff, warnings: preview.warnings, impactLevel: preview.impactLevel });
    }
    case "run_doctor": {
      const report = await api.runDoctor();
      return JSON.stringify(report, null, 2);
    }
    default:
      return `Unknown tool: ${name}`;
  }
}

export function getBaseUrl(profile: ModelProfile): string {
  // Always use provider defaults for chat; extracted baseUrls from config
  // may target a different API format (e.g. Anthropic proxy for MiniMax)
  return getDefaultBaseUrl(profile.provider);
}

function getDefaultBaseUrl(provider: string): string {
  switch (provider.toLowerCase()) {
    case "openai":
    case "openai-codex":
      return "https://api.openai.com/v1";
    case "anthropic":
      return "https://api.anthropic.com/v1";
    case "google":
    case "gemini":
      return "https://generativelanguage.googleapis.com/v1beta/openai";
    case "deepseek":
      return "https://api.deepseek.com/v1";
    case "groq":
      return "https://api.groq.com/openai/v1";
    case "mistral":
      return "https://api.mistral.ai/v1";
    case "kimi-coding":
    case "moonshot":
      return "https://api.moonshot.cn/v1";
    case "minimax":
    case "minimax-portal":
      return "https://api.minimax.chat/v1";
    default:
      return "https://api.openai.com/v1";
  }
}
