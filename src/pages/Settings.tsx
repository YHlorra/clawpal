import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api } from "@/lib/api";
import type { BackupInfo, ModelCatalogProvider, ModelProfile, ProviderAuthSuggestion, ResolvedApiKey } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

function AutocompleteField({
  value,
  onChange,
  onFocus,
  options,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  onFocus?: () => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = options.filter(
    (o) =>
      !value ||
      o.value.toLowerCase().includes(value.toLowerCase()) ||
      o.label.toLowerCase().includes(value.toLowerCase()),
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          onFocus?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-[200px] overflow-y-auto">
          {filtered.map((option) => (
            <div
              key={option.value}
              className="px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let index = 0;
  let value = bytes;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(1)} ${units[index]}`;
}

export function Settings({ onDataChange }: { onDataChange?: () => void }) {
  const [profiles, setProfiles] = useState<ModelProfile[]>([]);
  const [catalog, setCatalog] = useState<ModelCatalogProvider[]>([]);
  const [apiKeys, setApiKeys] = useState<ResolvedApiKey[]>([]);
  const [form, setForm] = useState<ProfileForm>(emptyForm());
  const [message, setMessage] = useState("");
  const [authSuggestion, setAuthSuggestion] = useState<ProviderAuthSuggestion | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backupMessage, setBackupMessage] = useState("");

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

  // Load backups
  useEffect(() => {
    api.listBackups().then(setBackups).catch(() => {});
  }, []);

  // Refresh catalog from CLI when user focuses provider/model input
  const ensureCatalog = () => {
    if (catalogRefreshed) return;
    setCatalogRefreshed(true);
    api.refreshModelCatalog().then((fresh) => {
      if (fresh.length > 0) setCatalog(fresh);
    }).catch(() => {});
  };

  // Check for existing auth when provider changes (only for new profiles)
  useEffect(() => {
    if (form.id || !form.provider.trim()) {
      setAuthSuggestion(null);
      return;
    }
    api.resolveProviderAuth(form.provider)
      .then(setAuthSuggestion)
      .catch(() => setAuthSuggestion(null));
  }, [form.provider, form.id]);

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

  const upsert = (event: FormEvent) => {
    event.preventDefault();
    if (!form.provider || !form.model) {
      setMessage("Provider and Model are required");
      return;
    }
    if (!form.apiKey && !form.id && !authSuggestion?.hasKey) {
      setMessage("API Key is required");
      return;
    }
    const profileData: ModelProfile = {
      id: form.id || "",
      name: `${form.provider}/${form.model}`,
      provider: form.provider,
      model: form.model,
      authRef: (!form.apiKey && authSuggestion?.authRef) ? authSuggestion.authRef : "",
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
        onDataChange?.();
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
        refreshProfiles();
        onDataChange?.();
      })
      .catch(() => setMessage("Delete failed"));
  };

  return (
    <section>
      <h2 className="text-2xl font-bold mb-4">Settings</h2>

      <p className="text-sm text-muted-foreground mb-4">
        For OAuth-based providers (GitHub Copilot, etc.), use the CLI:
        <code className="mx-1 px-1.5 py-0.5 bg-muted rounded text-xs">openclaw models auth login</code>
        or
        <code className="mx-1 px-1.5 py-0.5 bg-muted rounded text-xs">openclaw models auth login-github-copilot</code>.
        Profiles created via CLI will appear in the list on the right.
      </p>

      {/* ---- Model Profiles ---- */}
      <div className="grid grid-cols-2 gap-3 items-start">
        {/* Create / Edit form */}
        <Card>
          <CardHeader>
            <CardTitle>{form.id ? "Edit Profile" : "Add Profile"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={upsert} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Provider</Label>
                <AutocompleteField
                  value={form.provider}
                  onChange={(val) =>
                    setForm((p) => ({ ...p, provider: val, model: "" }))
                  }
                  onFocus={ensureCatalog}
                  options={catalog.map((c) => ({
                    value: c.provider,
                    label: c.provider,
                  }))}
                  placeholder="e.g. openai"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Model</Label>
                <AutocompleteField
                  value={form.model}
                  onChange={(val) =>
                    setForm((p) => ({ ...p, model: val }))
                  }
                  onFocus={ensureCatalog}
                  options={modelCandidates.map((m) => ({
                    value: m.id,
                    label: m.name || m.id,
                  }))}
                  placeholder="e.g. gpt-4o"
                />
              </div>

              <div className="space-y-1.5">
                <Label>API Key</Label>
                <Input
                  type="password"
                  placeholder={form.id ? "(unchanged if empty)" : authSuggestion?.hasKey ? "(optional — key already available)" : "sk-..."}
                  value={form.apiKey}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, apiKey: e.target.value }))
                  }
                />
                {!form.id && authSuggestion?.hasKey && (
                  <p className="text-xs text-muted-foreground">
                    Key available via {authSuggestion.source}. Leave empty to reuse it.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="custom-url"
                  checked={form.useCustomUrl}
                  onCheckedChange={(checked) =>
                    setForm((p) => ({ ...p, useCustomUrl: checked === true }))
                  }
                />
                <Label htmlFor="custom-url">Custom Base URL</Label>
              </div>

              {form.useCustomUrl && (
                <div className="space-y-1.5">
                  <Label>Base URL</Label>
                  <Input
                    placeholder="e.g. https://api.openai.com/v1"
                    value={form.baseUrl}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, baseUrl: e.target.value }))
                    }
                  />
                </div>
              )}

              <div className="flex gap-2 mt-2">
                <Button type="submit">Save</Button>
                {form.id && (
                  <>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" variant="destructive">
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete profile?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete the profile "{form.provider}/{form.model}". This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteProfile(form.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setForm(emptyForm())}
                    >
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Profiles list */}
        <Card>
          <CardHeader>
            <CardTitle>Model Profiles</CardTitle>
          </CardHeader>
          <CardContent>
            {profiles.length === 0 && (
              <p className="text-muted-foreground">No model profiles yet.</p>
            )}
            <div className="grid gap-2">
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  className="border border-border p-2.5 rounded-lg"
                >
                  <div className="flex justify-between items-center">
                    <strong>{profile.provider}/{profile.model}</strong>
                    {profile.enabled ? (
                      <Badge className="bg-blue-100 text-blue-700 border-0">
                        enabled
                      </Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-700 border-0">
                        disabled
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    API Key: {maskedKeyMap.get(profile.id) || "..."}
                  </div>
                  {profile.baseUrl && (
                    <div className="text-sm text-muted-foreground mt-0.5">
                      URL: {profile.baseUrl}
                    </div>
                  )}
                  <div className="flex gap-1.5 mt-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => editProfile(profile)}
                    >
                      Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="destructive" type="button">
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete profile?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete the profile "{profile.provider}/{profile.model}". This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteProfile(profile.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {message && (
        <p className="text-sm text-muted-foreground mt-3">{message}</p>
      )}

      {/* Backups */}
      <h3 className="text-lg font-semibold mt-6 mb-3">Backups</h3>
      {backups.length === 0 ? (
        <p className="text-muted-foreground text-sm">No backups available.</p>
      ) : (
        <div className="space-y-2">
          {backups.map((backup) => (
            <Card key={backup.name}>
              <CardContent className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{backup.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {backup.createdAt} — {formatBytes(backup.sizeBytes)}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => api.openUrl(backup.path)}
                  >
                    Show
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline">
                        Restore
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Restore from backup?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will restore config and workspace files from backup "{backup.name}". Current files will be overwritten.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            api.restoreFromBackup(backup.name)
                              .then((msg) => setBackupMessage(msg))
                              .catch(() => setBackupMessage("Restore failed"));
                          }}
                        >
                          Restore
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive">
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete backup?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete backup "{backup.name}". This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => {
                            api.deleteBackup(backup.name)
                              .then(() => {
                                setBackupMessage(`Deleted backup "${backup.name}"`);
                                api.listBackups().then(setBackups).catch(() => {});
                              })
                              .catch(() => setBackupMessage("Delete failed"));
                          }}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {backupMessage && (
        <p className="text-sm text-muted-foreground mt-2">{backupMessage}</p>
      )}
    </section>
  );
}
