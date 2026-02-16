import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { ModelCatalogProvider, ModelProfile, ResolvedApiKey } from "../lib/types";

type ProfileForm = {
  id: string;
  provider: string;
  model: string;
  apiKey: string;
  useCustomUrl: boolean;
  baseUrl: string;
  enabled: boolean;
};

function emptyForm(): ProfileForm {
  return {
    id: "",
    provider: "",
    model: "",
    apiKey: "",
    useCustomUrl: false,
    baseUrl: "",
    enabled: true,
  };
}

const CHAT_PROFILE_KEY = "clawpal_chat_profile";

export function Settings() {
  const [profiles, setProfiles] = useState<ModelProfile[]>([]);
  const [catalog, setCatalog] = useState<ModelCatalogProvider[]>([]);
  const [apiKeys, setApiKeys] = useState<ResolvedApiKey[]>([]);
  const [form, setForm] = useState<ProfileForm>(emptyForm());
  const [message, setMessage] = useState("");
  const [chatProfileId, setChatProfileId] = useState(
    () => localStorage.getItem(CHAT_PROFILE_KEY) || "",
  );

  const [catalogRefreshed, setCatalogRefreshed] = useState(false);

  // Load profiles and API keys immediately (fast)
  const refreshProfiles = () => {
    api.listModelProfiles().then(setProfiles).catch(() => {});
    api.resolveApiKeys().then(setApiKeys).catch(() => {});
  };

  useEffect(refreshProfiles, []);

  // Load catalog from cache instantly (no CLI calls)
  useEffect(() => {
    api.getCachedModelCatalog().then(setCatalog).catch(() => {});
  }, []);

  // Refresh catalog from CLI when user focuses provider/model input
  const ensureCatalog = () => {
    if (catalogRefreshed) return;
    setCatalogRefreshed(true);
    api.refreshModelCatalog().then(setCatalog).catch(() => {});
  };

  const maskedKeyMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of apiKeys) {
      map.set(entry.profileId, entry.maskedKey);
    }
    return map;
  }, [apiKeys]);

  const modelCandidates = useMemo(() => {
    const found = catalog.find((c) => c.provider === form.provider);
    return found?.models || [];
  }, [catalog, form.provider]);

  const upsert = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.provider || !form.model) {
      setMessage("Provider and Model are required");
      return;
    }
    if (!form.apiKey && !form.id) {
      setMessage("API Key is required");
      return;
    }
    const profileData: ModelProfile = {
      id: form.id || "",
      name: `${form.provider}/${form.model}`,
      provider: form.provider,
      model: form.model,
      authRef: "",
      apiKey: form.apiKey || undefined,
      baseUrl: form.useCustomUrl && form.baseUrl ? form.baseUrl : undefined,
      enabled: form.enabled,
    };
    api
      .upsertModelProfile(profileData)
      .then(() => {
        setMessage("Profile saved");
        setForm(emptyForm());
        refreshProfiles();
      })
      .catch(() => setMessage("Save failed"));
  };

  const editProfile = (profile: ModelProfile) => {
    setForm({
      id: profile.id,
      provider: profile.provider,
      model: profile.model,
      apiKey: "",
      useCustomUrl: !!profile.baseUrl,
      baseUrl: profile.baseUrl || "",
      enabled: profile.enabled,
    });
  };

  const deleteProfile = (id: string) => {
    api
      .deleteModelProfile(id)
      .then(() => {
        setMessage("Profile deleted");
        if (form.id === id) {
          setForm(emptyForm());
        }
        if (chatProfileId === id) {
          setChatProfileId("");
          localStorage.removeItem(CHAT_PROFILE_KEY);
        }
        refreshProfiles();
      })
      .catch(() => setMessage("Delete failed"));
  };

  const handleChatProfileChange = (value: string) => {
    setChatProfileId(value);
    if (value) {
      localStorage.setItem(CHAT_PROFILE_KEY, value);
    } else {
      localStorage.removeItem(CHAT_PROFILE_KEY);
    }
  };

  return (
    <section>
      <h2>Settings</h2>

      {/* ---- Model Profiles ---- */}
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "1fr 1fr",
          alignItems: "start",
        }}
      >
        {/* Create / Edit form */}
        <article className="card">
          <h3>{form.id ? "Edit Profile" : "Add Profile"}</h3>
          <form onSubmit={upsert} className="param-form">
            <label>
              Provider
              <input
                placeholder="e.g. openai"
                value={form.provider}
                onChange={(e) =>
                  setForm((p) => ({ ...p, provider: e.target.value, model: "" }))
                }
                onFocus={ensureCatalog}
                list="settings-provider-list"
              />
              <datalist id="settings-provider-list">
                {catalog.map((c) => (
                  <option key={c.provider} value={c.provider} />
                ))}
              </datalist>
            </label>

            <label>
              Model
              <input
                placeholder="e.g. gpt-4o"
                value={form.model}
                onChange={(e) =>
                  setForm((p) => ({ ...p, model: e.target.value }))
                }
                onFocus={ensureCatalog}
                list="settings-model-list"
              />
              <datalist id="settings-model-list">
                {modelCandidates.map((m) => (
                  <option
                    key={m.id}
                    value={m.id}
                    label={m.name || m.id}
                  />
                ))}
              </datalist>
            </label>

            <label>
              API Key
              <input
                type="password"
                placeholder={form.id ? "(unchanged if empty)" : "sk-..."}
                value={form.apiKey}
                onChange={(e) =>
                  setForm((p) => ({ ...p, apiKey: e.target.value }))
                }
              />
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={form.useCustomUrl}
                onChange={(e) =>
                  setForm((p) => ({ ...p, useCustomUrl: e.target.checked }))
                }
              />
              Custom Base URL
            </label>

            {form.useCustomUrl && (
              <label>
                Base URL
                <input
                  placeholder="e.g. https://api.openai.com/v1"
                  value={form.baseUrl}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, baseUrl: e.target.value }))
                  }
                />
              </label>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="submit">Save</button>
              {form.id && (
                <>
                  <button
                    type="button"
                    onClick={() => deleteProfile(form.id)}
                    style={{ color: "#ff6b6b" }}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(emptyForm())}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </form>
        </article>

        {/* Profiles list */}
        <article className="card">
          <h3>Model Profiles</h3>
          {profiles.length === 0 && <p style={{ opacity: 0.6 }}>No model profiles yet.</p>}
          <div style={{ display: "grid", gap: 8 }}>
            {profiles.map((profile) => (
              <div
                key={profile.id}
                style={{
                  border: "1px solid #2d3560",
                  padding: 10,
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <strong>{profile.provider}/{profile.model}</strong>
                  <span
                    style={{
                      opacity: 0.7,
                      fontSize: "0.85rem",
                      color: profile.enabled ? "#6dd0ff" : "#ff6b6b",
                    }}
                  >
                    {profile.enabled ? "enabled" : "disabled"}
                  </span>
                </div>
                <div style={{ opacity: 0.7, fontSize: "0.9rem", marginTop: 4 }}>
                  API Key: {maskedKeyMap.get(profile.id) || "..."}
                </div>
                {profile.baseUrl && (
                  <div
                    style={{ opacity: 0.7, fontSize: "0.9rem", marginTop: 2 }}
                  >
                    URL: {profile.baseUrl}
                  </div>
                )}
                <div
                  style={{ marginTop: 6, display: "flex", gap: 6 }}
                >
                  <button type="button" onClick={() => editProfile(profile)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteProfile(profile.id)}
                    style={{ color: "#ff6b6b" }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>

      {/* ---- Chat Model ---- */}
      <article className="card" style={{ marginTop: 16 }}>
        <h3>Chat Model</h3>
        <p style={{ opacity: 0.75, margin: "4px 0 8px" }}>
          Select which model profile to use for the Chat feature.
        </p>
        <select
          value={chatProfileId}
          onChange={(e) => handleChatProfileChange(e.target.value)}
          style={{ minWidth: 260 }}
        >
          <option value="">(none selected)</option>
          {profiles
            .filter((p) => p.enabled)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.provider}/{p.model}
              </option>
            ))}
        </select>
      </article>

      {message && (
        <p style={{ marginTop: 12 }}>{message}</p>
      )}
    </section>
  );
}
