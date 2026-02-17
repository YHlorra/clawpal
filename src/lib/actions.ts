import { api } from "./api";

export interface ActionDef {
  execute: (args: Record<string, unknown>) => Promise<unknown>;
  describe: (args: Record<string, unknown>) => string;
}

function renderArgs(
  args: Record<string, unknown>,
  params: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string") {
      // If the entire value is a single template like "{{param}}", resolve to native type
      const singleMatch = value.match(/^\{\{(\w+)\}\}$/);
      if (singleMatch) {
        const paramValue = params[singleMatch[1]] ?? "";
        if (paramValue === "true") result[key] = true;
        else if (paramValue === "false" || paramValue === "") result[key] = false;
        else result[key] = paramValue;
      } else {
        let rendered = value;
        for (const [paramId, paramValue] of Object.entries(params)) {
          rendered = rendered.split(`{{${paramId}}}`).join(paramValue);
        }
        result[key] = rendered;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

const registry: Record<string, ActionDef> = {
  create_agent: {
    execute: (args) => {
      const model = args.modelProfileId as string | undefined;
      return api.createAgent(
        args.agentId as string,
        model === "__default__" ? undefined : model,
        args.independent as boolean | undefined,
      );
    },
    describe: (args) => {
      const model = args.modelProfileId as string | undefined;
      const modelLabel = !model || model === "__default__" ? "default model" : model;
      return `Create ${args.independent ? "independent " : ""}agent "${args.agentId}" (${modelLabel})`;
    },
  },
  setup_identity: {
    execute: (args) =>
      api.setupAgentIdentity(
        args.agentId as string,
        args.name as string,
        args.emoji as string | undefined,
      ),
    describe: (args) => {
      const emoji = args.emoji ? ` ${args.emoji}` : "";
      return `Set identity: ${args.name}${emoji}`;
    },
  },
  bind_channel: {
    execute: (args) =>
      api.assignChannelAgent(
        args.channelType as string,
        args.peerId as string,
        args.agentId as string,
      ),
    describe: (args) =>
      `Bind ${args.channelType} channel → agent "${args.agentId}"`,
  },
  config_patch: {
    execute: (args) =>
      api.applyConfigPatch(
        args.patchTemplate as string,
        args.params as Record<string, string>,
      ),
    describe: () => "",
  },
  set_global_model: {
    execute: (args) => api.setGlobalModel(args.profileId as string),
    describe: (args) => `Set default model to ${args.profileId}`,
  },
};

export function getAction(actionType: string): ActionDef | undefined {
  return registry[actionType];
}

export interface ResolvedStep {
  index: number;
  action: string;
  label: string;
  args: Record<string, unknown>;
  description: string;
  skippable: boolean;
}

export function resolveSteps(
  steps: { action: string; label: string; args: Record<string, unknown> }[],
  params: Record<string, string>,
): ResolvedStep[] {
  return steps.map((step, index) => {
    const resolved = renderArgs(step.args, params);
    if (step.action === "config_patch") {
      resolved.params = params;
    }
    // A step is skippable if any of its template args resolved to empty string
    const skippable = Object.entries(step.args).some(([key, origValue]) => {
      if (typeof origValue === "string" && origValue.includes("{{")) {
        const rv = resolved[key];
        return typeof rv === "string" && rv.trim() === "";
      }
      return false;
    });
    const actionDef = getAction(step.action);
    const description = actionDef?.describe(resolved) || step.label;
    return {
      index,
      action: step.action,
      label: step.label,
      args: resolved,
      description: description || step.label,
      skippable,
    };
  });
}

export async function executeStep(step: ResolvedStep): Promise<void> {
  const actionDef = getAction(step.action);
  if (!actionDef) {
    throw new Error(`Unknown action type: ${step.action}`);
  }
  await actionDef.execute(step.args);
}
