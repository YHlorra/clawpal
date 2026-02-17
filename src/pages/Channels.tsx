import { useEffect, useMemo, useState } from "react";
import type { AgentOverview, DiscordGuildChannel, ModelProfile } from "../lib/types";
import { api } from "../lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Binding {
  agentId: string;
  match: { channel: string; peer?: { id: string; kind: string } };
}

interface AgentGroup {
  identity: string;
  emoji?: string;
  agents: AgentOverview[];
}

function groupAgents(agents: AgentOverview[]): AgentGroup[] {
  const map = new Map<string, AgentGroup>();
  for (const a of agents) {
    const key = a.workspace || a.id;
    if (!map.has(key)) {
      map.set(key, {
        identity: a.name || a.id,
        emoji: a.emoji,
        agents: [],
      });
    }
    map.get(key)!.agents.push(a);
  }
  return Array.from(map.values());
}

export function Channels({
  discordGuildChannels,
  onRefresh,
}: {
  discordGuildChannels: DiscordGuildChannel[];
  onRefresh: () => void;
}) {
  const [agents, setAgents] = useState<AgentOverview[]>([]);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [modelProfiles, setModelProfiles] = useState<ModelProfile[]>([]);

  // Create agent dialog
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [pendingChannelId, setPendingChannelId] = useState<string | null>(null);
  const [newAgentId, setNewAgentId] = useState("");
  const [newAgentModel, setNewAgentModel] = useState("");
  const [newAgentIndependent, setNewAgentIndependent] = useState(false);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [createAgentError, setCreateAgentError] = useState("");

  const refreshAgents = () => {
    api.listAgentsOverview().then(setAgents).catch(() => {});
  };

  useEffect(() => {
    refreshAgents();
    api.listBindings().then((b) => setBindings(b as unknown as Binding[])).catch(() => {});
    api.listModelProfiles().then((p) => setModelProfiles(p.filter((m) => m.enabled))).catch(() => {});
  }, []);

  // Map channelId → agentId from bindings
  const channelAgentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of bindings) {
      if (b.match?.channel === "discord" && b.match?.peer?.id) {
        map.set(b.match.peer.id, b.agentId);
      }
    }
    return map;
  }, [bindings]);

  const grouped = useMemo(() => {
    const map = new Map<string, { guildName: string; channels: DiscordGuildChannel[] }>();
    for (const gc of discordGuildChannels) {
      if (!map.has(gc.guildId)) {
        map.set(gc.guildId, { guildName: gc.guildName, channels: [] });
      }
      map.get(gc.guildId)!.channels.push(gc);
    }
    return Array.from(map.entries());
  }, [discordGuildChannels]);

  const agentGroups = useMemo(() => groupAgents(agents), [agents]);

  const handleAssign = async (channelId: string, agentId: string) => {
    if (agentId === "__new__") {
      setPendingChannelId(channelId);
      setShowCreateAgent(true);
      return;
    }
    setSaving(channelId);
    try {
      await api.assignChannelAgent(
        "discord",
        channelId,
        agentId === "__default__" ? null : agentId,
      );
      const updated = await api.listBindings();
      setBindings(updated as unknown as Binding[]);
    } catch {
      // silently fail
    } finally {
      setSaving(null);
    }
  };

  const handleCreateAgent = () => {
    const id = newAgentId.trim();
    if (!id) {
      setCreateAgentError("Agent ID is required");
      return;
    }
    setCreatingAgent(true);
    setCreateAgentError("");
    api.createAgent(id, newAgentModel || undefined, newAgentIndependent || undefined)
      .then((created) => {
        setShowCreateAgent(false);
        setNewAgentId("");
        setNewAgentModel("");
        setNewAgentIndependent(false);
        refreshAgents();
        if (pendingChannelId) {
          handleAssign(pendingChannelId, created.id);
          setPendingChannelId(null);
        }
      })
      .catch((e) => setCreateAgentError(String(e)))
      .finally(() => setCreatingAgent(false));
  };

  // Build the agent label shown in the trigger when selected
  function agentDisplayLabel(agentId: string): string {
    const a = agents.find((ag) => ag.id === agentId);
    if (!a) return agentId;
    const name = a.name || a.id;
    const emoji = a.emoji ? `${a.emoji} ` : "";
    const model = a.model ? ` (${a.model})` : "";
    return `${emoji}${name}: ${a.id}${model}`;
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Channels</h2>
        <Button onClick={onRefresh}>
          Refresh Discord channels
        </Button>
      </div>

      {grouped.length === 0 ? (
        <p className="text-muted-foreground">
          No Discord channels cached. Click "Refresh Discord channels" to load.
        </p>
      ) : (
        <div className="space-y-4">
          {grouped.map(([guildId, { guildName, channels }]) => (
            <Card key={guildId}>
              <CardContent>
                <div className="flex items-center gap-2 mb-3">
                  <strong className="text-lg">{guildName}</strong>
                  <Badge variant="secondary">{guildId}</Badge>
                  <Badge variant="outline" className="ml-auto">Discord</Badge>
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2">
                  {channels.map((ch) => {
                    const currentAgent = channelAgentMap.get(ch.channelId);
                    return (
                      <div
                        key={ch.channelId}
                        className="rounded-md border px-3 py-2"
                      >
                        <div className="text-sm font-medium">{ch.channelName}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 mb-1.5">{ch.channelId}</div>
                        <Select
                          value={currentAgent || "__default__"}
                          onValueChange={(val) => handleAssign(ch.channelId, val)}
                          disabled={saving === ch.channelId}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue>
                              {currentAgent ? agentDisplayLabel(currentAgent) : "main (default)"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__default__">
                              <span className="text-muted-foreground">main (default)</span>
                            </SelectItem>
                            {agentGroups.map((group, gi) => (
                              <SelectGroup key={group.agents[0].workspace || group.agents[0].id}>
                                {gi > 0 && <SelectSeparator />}
                                <SelectLabel>
                                  {group.emoji ? `${group.emoji} ` : ""}{group.identity}
                                </SelectLabel>
                                {group.agents.map((a) => (
                                  <SelectItem key={a.id} value={a.id}>
                                    <code className="text-xs">{a.id}</code>
                                    <span className="text-muted-foreground ml-1.5 text-xs">
                                      {a.model || "default model"}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            ))}
                            <SelectSeparator />
                            <SelectItem value="__new__">
                              <span className="text-primary">+ New agent...</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Agent Dialog */}
      <Dialog open={showCreateAgent} onOpenChange={(open) => {
        setShowCreateAgent(open);
        if (!open) setPendingChannelId(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Agent ID</Label>
              <Input
                placeholder="e.g. my-agent"
                value={newAgentId}
                onChange={(e) => setNewAgentId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Letters, numbers, hyphens, and underscores only.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Model</Label>
              <Select
                value={newAgentModel || "__default__"}
                onValueChange={(val) => setNewAgentModel(val === "__default__" ? "" : val)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">
                    <span className="text-muted-foreground">use global default</span>
                  </SelectItem>
                  {modelProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.provider}/{p.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="ch-independent-agent"
                checked={newAgentIndependent}
                onCheckedChange={(checked) => setNewAgentIndependent(checked === true)}
              />
              <Label htmlFor="ch-independent-agent">Independent agent (separate workspace)</Label>
            </div>
            {createAgentError && (
              <p className="text-sm text-destructive">{createAgentError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateAgent(false); setPendingChannelId(null); }}>
              Cancel
            </Button>
            <Button onClick={handleCreateAgent} disabled={creatingAgent}>
              {creatingAgent ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
