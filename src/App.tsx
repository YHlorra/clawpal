import { useCallback, useEffect, useRef, useState } from "react";
import { Home } from "./pages/Home";
import { Recipes } from "./pages/Recipes";
import { Cook } from "./pages/Cook";
import { History } from "./pages/History";
import { Settings } from "./pages/Settings";
import { Channels } from "./pages/Channels";
import { Chat } from "./components/Chat";
import { GlobalLoading } from "./components/GlobalLoading";
import { DiffViewer } from "./components/DiffViewer";
import { api } from "./lib/api";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { DiscordGuildChannel } from "./lib/types";

type Route = "home" | "recipes" | "cook" | "history" | "channels" | "settings";

export function App() {
  const [route, setRoute] = useState<Route>("home");
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [recipeSource, setRecipeSource] = useState<string | undefined>(undefined);
  const [discordGuildChannels, setDiscordGuildChannels] = useState<DiscordGuildChannel[]>([]);
  const [globalLoading, setGlobalLoading] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  // Config dirty state
  const [dirty, setDirty] = useState(false);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [applyDiffBaseline, setApplyDiffBaseline] = useState("");
  const [applyDiffCurrent, setApplyDiffCurrent] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [configVersion, setConfigVersion] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Establish baseline on startup
  useEffect(() => {
    api.saveConfigBaseline().catch(() => {});
  }, []);

  // Poll for dirty state
  const checkDirty = useCallback(() => {
    api.checkConfigDirty()
      .then((state) => setDirty(state.dirty))
      .catch(() => {});
  }, []);

  useEffect(() => {
    checkDirty();
    pollRef.current = setInterval(checkDirty, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [checkDirty]);

  // Load Discord data from cache on startup (instant, no subprocess)
  useEffect(() => {
    if (!localStorage.getItem("clawpal_profiles_extracted")) {
      api.extractModelProfilesFromConfig()
        .then(() => localStorage.setItem("clawpal_profiles_extracted", "1"))
        .catch(() => {});
    }
    api.listDiscordGuildChannels().then(setDiscordGuildChannels).catch(() => {});
  }, []);

  const refreshDiscord = useCallback(() => {
    setGlobalLoading("Resolving Discord channel names...");
    api.refreshDiscordGuildChannels()
      .then(setDiscordGuildChannels)
      .catch(() => {})
      .finally(() => setGlobalLoading(null));
  }, []);

  const bumpConfigVersion = useCallback(() => {
    setConfigVersion((v) => v + 1);
  }, []);

  const handleApplyClick = () => {
    // Load diff data for the dialog
    api.checkConfigDirty()
      .then((state) => {
        setApplyDiffBaseline(state.baseline);
        setApplyDiffCurrent(state.current);
        setApplyError("");
        setShowApplyDialog(true);
      })
      .catch(() => {});
  };

  const handleApplyConfirm = () => {
    setApplying(true);
    setApplyError("");
    api.applyPendingChanges()
      .then(() => {
        setShowApplyDialog(false);
        setDirty(false);
        bumpConfigVersion();
      })
      .catch((e) => setApplyError(String(e)))
      .finally(() => setApplying(false));
  };

  const handleDiscardConfirm = () => {
    api.discardConfigChanges()
      .then(() => {
        setShowDiscardDialog(false);
        setDirty(false);
        bumpConfigVersion();
      })
      .catch(() => {});
  };

  return (
    <>
    {globalLoading && <GlobalLoading message={globalLoading} />}
    <div className="flex h-screen">
      <aside className="w-[200px] min-w-[200px] bg-muted border-r border-border flex flex-col py-4">
        <h1 className="px-4 text-lg font-bold mb-4">ClawPal</h1>
        <nav className="flex flex-col gap-1 px-2 flex-1">
          <Button
            variant="ghost"
            className={cn(
              "justify-start hover:bg-accent",
              (route === "home") && "bg-accent text-accent-foreground border-l-[3px] border-primary"
            )}
            onClick={() => setRoute("home")}
          >
            Home
          </Button>
          <Button
            variant="ghost"
            className={cn(
              "justify-start hover:bg-accent",
              (route === "recipes" || route === "cook") && "bg-accent text-accent-foreground border-l-[3px] border-primary"
            )}
            onClick={() => setRoute("recipes")}
          >
            Recipes
          </Button>
          <Button
            variant="ghost"
            className={cn(
              "justify-start hover:bg-accent",
              (route === "channels") && "bg-accent text-accent-foreground border-l-[3px] border-primary"
            )}
            onClick={() => setRoute("channels")}
          >
            Channels
          </Button>
          <Button
            variant="ghost"
            className={cn(
              "justify-start hover:bg-accent",
              (route === "history") && "bg-accent text-accent-foreground border-l-[3px] border-primary"
            )}
            onClick={() => setRoute("history")}
          >
            History
          </Button>
          <Separator className="my-2" />
          <Button
            variant="ghost"
            className={cn(
              "justify-start hover:bg-accent",
              (route === "settings") && "bg-accent text-accent-foreground border-l-[3px] border-primary"
            )}
            onClick={() => setRoute("settings")}
          >
            Settings
          </Button>
        </nav>

        {/* Chat toggle */}
        <div className="px-2 pb-2">
          <Button
            variant="outline"
            className="w-full"
            size="sm"
            onClick={() => setChatOpen(true)}
          >
            Chat
          </Button>
        </div>

        {/* Dirty config action bar */}
        {dirty && (
          <div className="px-2 pb-2 space-y-1.5">
            <Separator className="mb-2" />
            <p className="text-xs text-center text-muted-foreground px-1">Pending changes</p>
            <Button
              className="w-full"
              size="sm"
              onClick={handleApplyClick}
            >
              Apply Changes
            </Button>
            <Button
              className="w-full"
              size="sm"
              variant="outline"
              onClick={() => setShowDiscardDialog(true)}
            >
              Discard
            </Button>
          </div>
        )}
      </aside>
      <main className="flex-1 overflow-y-auto p-4">
        {route === "home" && (
          <Home
            key={configVersion}
            onCook={(id, source) => {
              setRecipeId(id);
              setRecipeSource(source);
              setRoute("cook");
            }}
          />
        )}
        {route === "recipes" && (
          <Recipes
            onCook={(id, source) => {
              setRecipeId(id);
              setRecipeSource(source);
              setRoute("cook");
            }}
          />
        )}
        {route === "cook" && recipeId && (
          <Cook
            recipeId={recipeId}
            recipeSource={recipeSource}
            discordGuildChannels={discordGuildChannels}
            onDone={() => {
              setRoute("recipes");
            }}
          />
        )}
        {route === "cook" && !recipeId && <p>No recipe selected.</p>}
        {route === "channels" && (
          <Channels
            key={configVersion}
            discordGuildChannels={discordGuildChannels}
            onRefresh={refreshDiscord}
          />
        )}
        {route === "history" && <History key={configVersion} />}
        {route === "settings" && (
          <Settings key={configVersion} onDataChange={bumpConfigVersion} />
        )}
        {route === "cook" && (
          <Button
            variant="ghost"
            className="mt-3 hover:bg-accent"
            onClick={() => setRoute("recipes")}
          >
            &larr; Recipes
          </Button>
        )}
      </main>
    </div>

    {/* Chat Drawer */}
    <Sheet open={chatOpen} onOpenChange={setChatOpen}>
      <SheetContent side="right" className="w-[380px] sm:w-[420px] p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle>Chat</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-hidden px-4 pb-4">
          <Chat />
        </div>
      </SheetContent>
    </Sheet>

    {/* Apply Changes Dialog */}
    <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Apply Changes</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Review config changes. Applying will restart the gateway.
        </p>
        <DiffViewer oldValue={applyDiffBaseline} newValue={applyDiffCurrent} />
        {applyError && (
          <p className="text-sm text-destructive">{applyError}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowApplyDialog(false)} disabled={applying}>
            Cancel
          </Button>
          <Button onClick={handleApplyConfirm} disabled={applying}>
            {applying ? "Applying..." : "Apply & Restart Gateway"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Discard Changes Dialog */}
    <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard all pending changes?</AlertDialogTitle>
          <AlertDialogDescription>
            This will restore the config to its state before your recent changes. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleDiscardConfirm}
          >
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
