import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Chat } from "../components/Chat";
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
    <div className="home-layout">
      <div className="home-main">
        <h2>Home</h2>

        {/* Status Summary */}
        <h3>Status</h3>
        <div className="status-grid">
          <div className="card">
            <div style={{ opacity: 0.7, fontSize: "0.85rem" }}>Health</div>
            <div style={{ fontSize: "1.1rem", marginTop: 4 }}>
              {status ? (status.healthy ? "Healthy" : "Unhealthy") : "..."}
            </div>
          </div>
          <div className="card">
            <div style={{ opacity: 0.7, fontSize: "0.85rem" }}>OpenClaw Version</div>
            <div style={{ fontSize: "1.1rem", marginTop: 4 }}>
              {version || "..."}
            </div>
            {updateInfo?.available && (
              <div style={{ marginTop: 4 }}>
                <div style={{ color: "var(--accent)", fontSize: "0.85rem" }}>
                  Update available: {updateInfo.latest}
                </div>
                <button
                  style={{ marginTop: 6, fontSize: "0.8rem", padding: "4px 10px" }}
                  onClick={() => api.openUrl("https://github.com/openclaw/openclaw/releases")}
                >
                  View update
                </button>
              </div>
            )}
          </div>
          <div className="card">
            <div style={{ opacity: 0.7, fontSize: "0.85rem" }}>Default Model</div>
            <div style={{ fontSize: "1.1rem", marginTop: 4 }}>
              {status ? (status.globalDefaultModel || "not set") : "..."}
            </div>
          </div>
        </div>

        {/* Agents Overview */}
        <h3 style={{ marginTop: 24 }}>Agents</h3>
        {agents.length === 0 ? (
          <p style={{ opacity: 0.6 }}>No agents found.</p>
        ) : (
          <div className="status-grid">
            {agents.map((agent) => (
              <div className="card" key={agent.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>{agent.id}</strong>
                  <span
                    style={{
                      fontSize: "0.8rem",
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: agent.online ? "rgba(80,200,120,0.18)" : "rgba(255,107,107,0.15)",
                      color: agent.online ? "#50c878" : "#ff6b6b",
                    }}
                  >
                    {agent.online ? "online" : "offline"}
                  </span>
                </div>
                <div style={{ opacity: 0.7, fontSize: "0.85rem", marginTop: 6 }}>
                  Model: {agent.model || "default"}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recommended Recipes */}
        <h3 style={{ marginTop: 24 }}>Recommended Recipes</h3>
        {recipes.length === 0 ? (
          <p style={{ opacity: 0.6 }}>No recipes available.</p>
        ) : (
          <div className="status-grid">
            {recipes.map((recipe) => (
              <div className="card" key={recipe.id}>
                <strong>{recipe.name}</strong>
                <div style={{ opacity: 0.8, fontSize: "0.9rem", marginTop: 6 }}>
                  {recipe.description}
                </div>
                <div style={{ opacity: 0.6, fontSize: "0.8rem", marginTop: 8 }}>
                  {recipe.difficulty} &middot; {recipe.impactCategory}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recent Activity */}
        <h3 style={{ marginTop: 24 }}>Recent Activity</h3>
        {history.length === 0 ? (
          <p style={{ opacity: 0.6 }}>No recent activity.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.map((item) => (
              <div className="card" key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontWeight: 500 }}>{item.recipeId || "manual change"}</span>
                  <span style={{ opacity: 0.6, marginLeft: 10, fontSize: "0.85rem" }}>
                    {item.source}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {item.canRollback && (
                    <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>rollback available</span>
                  )}
                  <span style={{ opacity: 0.5, fontSize: "0.85rem" }}>
                    {item.createdAt}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Chat />
    </div>
  );
}
