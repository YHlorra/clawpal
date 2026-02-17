import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { api } from "@/lib/api";
import type { ModelCatalogProvider, ModelProfile, ResolvedApiKey } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
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

function ComboboxField({
  value,
  onChange,
  onOpen,
  options,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  onOpen?: () => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && onOpen) onOpen();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value || (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={`Search ${placeholder.replace("e.g. ", "")}...`}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {/* Show typed value as option if it doesn't match any existing option */}
              {search &&
                !options.some(
                  (o) => o.value.toLowerCase() === search.toLowerCase(),
                ) && (
                  <CommandItem
                    onSelect={() => {
                      onChange(search);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === search ? "opacity-100" : "opacity-0",
                      )}
                    />
                    Use "{search}"
                  </CommandItem>
                )}
              {options
                .filter(
                  (o) =>
                    !search ||
                    o.value.toLowerCase().includes(search.toLowerCase()) ||
                    o.label.toLowerCase().includes(search.toLowerCase()),
                )
                .map((option) => (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === option.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {option.label}
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function Settings() {
  const [profiles, setProfiles] = useState<ModelProfile[]>([]);
  const [catalog, setCatalog] = useState<ModelCatalogProvider[]>([]);
  const [apiKeys, setApiKeys] = useState<ResolvedApiKey[]>([]);
  const [form, setForm] = useState<ProfileForm>(emptyForm());
  const [message, setMessage] = useState("");

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
    api.refreshModelCatalog().then((fresh) => {
      if (fresh.length > 0) setCatalog(fresh);
    }).catch(() => {});
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

  const upsert = (event: FormEvent) => {
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
        refreshProfiles();
      })
      .catch(() => setMessage("Delete failed"));
  };

  return (
    <section>
      <h2 className="text-2xl font-bold mb-4">Settings</h2>

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
                <ComboboxField
                  value={form.provider}
                  onChange={(val) =>
                    setForm((p) => ({ ...p, provider: val, model: "" }))
                  }
                  onOpen={ensureCatalog}
                  options={catalog.map((c) => ({
                    value: c.provider,
                    label: c.provider,
                  }))}
                  placeholder="e.g. openai"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Model</Label>
                <ComboboxField
                  value={form.model}
                  onChange={(val) =>
                    setForm((p) => ({ ...p, model: val }))
                  }
                  onOpen={ensureCatalog}
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
                  placeholder={form.id ? "(unchanged if empty)" : "sk-..."}
                  value={form.apiKey}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, apiKey: e.target.value }))
                  }
                />
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
    </section>
  );
}
