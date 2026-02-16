import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Chat } from "../components/Chat";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StatusLight, AgentOverview, Recipe, HistoryItem } from "../lib/types";

export function Home() {
  const [status, setStatus] = useState<StatusLight | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<{ available: boolean; latest?: string } | null>(null);
  const [agents, setAgents] = useState<AgentOverview[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Fast calls: render immediately
  useEffect(() => {
    api.getStatusLight().then(setStatus).catch(() => {});
  }, []);

  useEffect(() => {
    api.listAgentsOverview().then(setAgents).catch(() => {});
  }, []);

  useEffect(() => {
    api.listRecipes().then((r) => setRecipes(r.slice(0, 4))).catch(() => {});
  }, []);

  useEffect(() => {
    api.listHistory(5, 0).then((h) => setHistory(h.items)).catch(() => {});
  }, []);

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

  return (
    <div className="flex gap-4 h-full">
      <div className="flex-1 overflow-y-auto">
        <h2 className="text-2xl font-bold text-text-main mb-4">Home</h2>

        {/* Status Summary */}
        <h3 className="text-lg font-semibold text-text-main mt-6 mb-3">Status</h3>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          <Card className="bg-panel border-border-subtle">
            <CardContent>
              <div className="text-sm text-text-main/70">Health</div>
              <div className="text-lg mt-1 text-text-main">
                {status ? (status.healthy ? "Healthy" : "Unhealthy") : "..."}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-panel border-border-subtle">
            <CardContent>
              <div className="text-sm text-text-main/70">OpenClaw Version</div>
              <div className="text-lg mt-1 text-text-main">
                {version || "..."}
              </div>
              {updateInfo?.available && (
                <div className="mt-1">
                  <div className="text-sm text-accent-blue mt-1">
                    Update available: {updateInfo.latest}
                  </div>
                  <Button
                    size="sm"
                    className="mt-1.5 text-xs"
                    onClick={() => api.openUrl("https://github.com/openclaw/openclaw/releases")}
                  >
                    View update
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="bg-panel border-border-subtle">
            <CardContent>
              <div className="text-sm text-text-main/70">Default Model</div>
              <div className="text-lg mt-1 text-text-main">
                {status ? (status.globalDefaultModel || "not set") : "..."}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Agents Overview */}
        <h3 className="text-lg font-semibold text-text-main mt-6 mb-3">Agents</h3>
        {agents.length === 0 ? (
          <p className="text-text-main/60">No agents found.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
            {agents.map((agent) => (
              <Card className="bg-panel border-border-subtle" key={agent.id}>
                <CardContent>
                  <div className="flex justify-between items-center">
                    <strong>{agent.id}</strong>
                    {agent.online ? (
                      <Badge className="bg-success-green/20 text-success-green border-0">online</Badge>
                    ) : (
                      <Badge className="bg-destructive-red/15 text-destructive-red border-0">offline</Badge>
                    )}
                  </div>
                  <div className="text-sm text-text-main/70 mt-1.5">
                    Model: {agent.model || "default"}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Recommended Recipes */}
        <h3 className="text-lg font-semibold text-text-main mt-6 mb-3">Recommended Recipes</h3>
        {recipes.length === 0 ? (
          <p className="text-text-main/60">No recipes available.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
            {recipes.map((recipe) => (
              <Card className="bg-panel border-border-subtle" key={recipe.id}>
                <CardContent>
                  <strong>{recipe.name}</strong>
                  <div className="text-sm text-text-main/80 mt-1.5">
                    {recipe.description}
                  </div>
                  <div className="text-xs text-text-main/60 mt-2">
                    {recipe.difficulty} &middot; {recipe.impactCategory}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Recent Activity */}
        <h3 className="text-lg font-semibold text-text-main mt-6 mb-3">Recent Activity</h3>
        {history.length === 0 ? (
          <p className="text-text-main/60">No recent activity.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((item) => (
              <Card className="bg-panel border-border-subtle" key={item.id}>
                <CardContent className="flex justify-between items-center">
                  <div>
                    <span className="font-medium">{item.recipeId || "manual change"}</span>
                    <span className="text-sm text-text-main/60 ml-2.5">
                      {item.source}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    {item.canRollback && (
                      <span className="text-xs text-text-main/60">rollback available</span>
                    )}
                    <span className="text-sm text-text-main/50">
                      {item.createdAt}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      <Chat />
    </div>
  );
}
