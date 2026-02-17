import { useEffect, useMemo, useState } from "react";
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
  SelectItem,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { StatusLight, AgentOverview, Recipe, HistoryItem, ModelProfile } from "../lib/types";

interface AgentGroup {
  identity: string;
  emoji?: string;
  agents: AgentOverview[];
}

function groupAgents(agents: AgentOverview[]): AgentGroup[] {
  const map = new Map<string, AgentGroup>();
  for (const a of agents) {
    // Group by workspace path (shared identity), fallback to agent id
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

export function Home({ onCook }: { onCook?: (recipeId: string, source?: string) => void }) {
  const [status, setStatus] = useState<StatusLight | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<{ available: boolean; latest?: string } | null>(null);
  const [agents, setAgents] = useState<AgentOverview[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [modelProfiles, setModelProfiles] = useState<ModelProfile[]>([]);
  const [savingModel, setSavingModel] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");

  // Create agent dialog
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [newAgentId, setNewAgentId] = useState("");
  const [newAgentModel, setNewAgentModel] = useState("");
  const [newAgentIndependent, setNewAgentIndependent] = useState(false);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [createAgentError, setCreateAgentError] = useState("");

  // Fast calls: render immediately
  useEffect(() => {
    api.getStatusLight().then(setStatus).catch(() => {});
  }, []);

  const refreshAgents = () => {
    api.listAgentsOverview().then(setAgents).catch(() => {});
  };
  useEffect(refreshAgents, []);

  useEffect(() => {
    api.listRecipes().then((r) => setRecipes(r.slice(0, 4))).catch(() => {});
  }, []);

  useEffect(() => {
    api.listHistory(5, 0).then((h) => setHistory(h.items)).catch(() => {});
  }, []);

  useEffect(() => {
    api.listModelProfiles().then((p) => setModelProfiles(p.filter((m) => m.enabled))).catch(() => {});
  }, []);

  // Match current global model value to a profile ID
  const currentModelProfileId = useMemo(() => {
    const modelVal = status?.globalDefaultModel;
    if (!modelVal) return null;
    const normalized = modelVal.toLowerCase();
    for (const p of modelProfiles) {
      const profileVal = p.model.includes("/") ? p.model : `${p.provider}/${p.model}`;
      if (profileVal.toLowerCase() === normalized || p.model.toLowerCase() === normalized) {
        return p.id;
      }
    }
    return null;
  }, [status?.globalDefaultModel, modelProfiles]);

  const agentGroups = useMemo(() => groupAgents(agents), [agents]);

  // Heavy call: version + update check, deferred
  useEffect(() => {
    const timer = setTimeout(() => {
      api.getSystemStatus().then((s) => {
        setVersion(s.openclawVersion);
        if (s.openclawUpdate) {
          setUpdateInfo({
            available: s.openclawUpdate.upgradeAvailable,
            latest: s.openclawUpdate.latestVersion,
          });
        }
      }).catch(() => {});
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleCreateAgent = () => {
    const id = newAgentId.trim();
    if (!id) {
      setCreateAgentError("Agent ID is required");
      return;
    }
    setCreatingAgent(true);
    setCreateAgentError("");
    api.createAgent(id, newAgentModel || undefined, newAgentIndependent || undefined)
      .then(() => {
        setShowCreateAgent(false);
        setNewAgentId("");
        setNewAgentModel("");
        setNewAgentIndependent(false);
        refreshAgents();
      })
      .catch((e) => setCreateAgentError(String(e)))
      .finally(() => setCreatingAgent(false));
  };

  const handleDeleteAgent = (agentId: string) => {
    api.deleteAgent(agentId)
      .then(() => refreshAgents())
      .catch(() => {});
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Home</h2>

        {/* Status Summary */}
        <h3 className="text-lg font-semibold mt-6 mb-3">Status</h3>
        <Card>
          <CardContent className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 items-center">
            <span className="text-sm text-muted-foreground">Health</span>
            <span className="text-sm font-medium">
              {status ? (
                status.healthy ? (
                  <Badge className="bg-green-100 text-green-700 border-0">Healthy</Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-700 border-0">Unhealthy</Badge>
                )
              ) : "..."}
            </span>

            <span className="text-sm text-muted-foreground">Version</span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{version || "..."}</span>
              {updateInfo?.available && updateInfo.latest && updateInfo.latest !== version && (
                <>
                  <Badge variant="outline" className="text-primary border-primary">
                    {updateInfo.latest} available
                  </Badge>
                  <Button
                    size="sm"
                    className="text-xs h-6"
                    variant="outline"
                    onClick={() => api.openUrl("https://github.com/openclaw/openclaw/releases")}
                  >
                    View
                  </Button>
                  <Button
                    size="sm"
                    className="text-xs h-6"
                    disabled={backingUp}
                    onClick={() => {
                      setBackingUp(true);
                      setBackupMessage("");
                      api.backupBeforeUpgrade()
                        .then((info) => {
                          setBackupMessage(`Backup: ${info.name}`);
                          api.openUrl("https://github.com/openclaw/openclaw/releases");
                        })
                        .catch(() => setBackupMessage("Backup failed"))
                        .finally(() => setBackingUp(false));
                    }}
                  >
                    {backingUp ? "Backing up..." : "Backup & Upgrade"}
                  </Button>
                  {backupMessage && (
                    <span className="text-xs text-muted-foreground">{backupMessage}</span>
                  )}
                </>
              )}
            </div>

            <span className="text-sm text-muted-foreground">Default Model</span>
            <div className="max-w-xs">
              {status ? (
                <Select
                  value={currentModelProfileId || "__none__"}
                  onValueChange={(val) => {
                    setSavingModel(true);
                    api.setGlobalModel(val === "__none__" ? null : val)
                      .then(() => api.getStatusLight())
                      .then(setStatus)
                      .catch(() => {})
                      .finally(() => setSavingModel(false));
                  }}
                  disabled={savingModel}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-muted-foreground">not set</span>
                    </SelectItem>
                    {modelProfiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.provider}/{p.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm">...</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Agents Overview — grouped by identity */}
        <div className="flex items-center justify-between mt-6 mb-3">
          <h3 className="text-lg font-semibold">Agents</h3>
          <Button size="sm" variant="outline" onClick={() => setShowCreateAgent(true)}>
            + New Agent
          </Button>
        </div>
        {agentGroups.length === 0 ? (
          <p className="text-muted-foreground">No agents found.</p>
        ) : (
          <div className="space-y-3">
            {agentGroups.map((group) => (
              <Card key={group.agents[0].workspace || group.agents[0].id}>
                <CardContent>
                  <div className="flex items-center gap-1.5 mb-2">
                    {group.emoji && <span>{group.emoji}</span>}
                    <strong className="text-base">{group.identity}</strong>
                  </div>
                  <div className="space-y-1.5">
                    {group.agents.map((agent) => (
                      <div
                        key={agent.id}
                        className="flex items-center justify-between rounded-md border px-3 py-1.5"
                      >
                        <div className="flex items-center gap-2.5">
                          <code className="text-sm text-foreground font-medium">{agent.id}</code>
                          <span className="text-sm text-muted-foreground">
                            {agent.model || "default model"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {agent.online ? (
                            <Badge className="bg-green-100 text-green-700 border-0 text-xs">online</Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-700 border-0 text-xs">offline</Badge>
                          )}
                          {agent.id !== "main" && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs text-muted-foreground hover:text-destructive">
                                  Delete
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete agent "{agent.id}"?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will remove the agent from the config and any channel bindings associated with it.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => handleDeleteAgent(agent.id)}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Recommended Recipes */}
        <h3 className="text-lg font-semibold mt-6 mb-3">Recommended Recipes</h3>
        {recipes.length === 0 ? (
          <p className="text-muted-foreground">No recipes available.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
            {recipes.map((recipe) => (
              <Card
                key={recipe.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => onCook?.(recipe.id)}
              >
                <CardContent>
                  <strong>{recipe.name}</strong>
                  <div className="text-sm text-muted-foreground mt-1.5">
                    {recipe.description}
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    {recipe.difficulty} &middot; {recipe.impactCategory}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Recent Activity */}
        <h3 className="text-lg font-semibold mt-6 mb-3">Recent Activity</h3>
        {history.length === 0 ? (
          <p className="text-muted-foreground">No recent activity.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((item) => (
              <Card key={item.id}>
                <CardContent className="flex justify-between items-center">
                  <div>
                    <span className="font-medium">{item.recipeId || "manual change"}</span>
                    <span className="text-sm text-muted-foreground ml-2.5">
                      {item.source}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    {item.canRollback && (
                      <span className="text-xs text-muted-foreground">rollback available</span>
                    )}
                    <span className="text-sm text-muted-foreground">
                      {item.createdAt}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

      {/* Create Agent Dialog */}
      <Dialog open={showCreateAgent} onOpenChange={setShowCreateAgent}>
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
                id="independent-agent"
                checked={newAgentIndependent}
                onCheckedChange={(checked) => setNewAgentIndependent(checked === true)}
              />
              <Label htmlFor="independent-agent">Independent agent (separate workspace)</Label>
            </div>
            {createAgentError && (
              <p className="text-sm text-destructive">{createAgentError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateAgent(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateAgent} disabled={creatingAgent}>
              {creatingAgent ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
