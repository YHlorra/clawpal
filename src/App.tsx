import { useEffect, useState } from "react";
import { Home } from "./pages/Home";
import { Recipes } from "./pages/Recipes";
import { Install } from "./pages/Install";
import { History } from "./pages/History";
import { Doctor } from "./pages/Doctor";
import { Settings } from "./pages/Settings";
import { api } from "./lib/api";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type Route = "home" | "recipes" | "install" | "history" | "doctor" | "settings";

export function App() {
  const [route, setRoute] = useState<Route>("home");
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [recipeSource, setRecipeSource] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!localStorage.getItem("clawpal_profiles_extracted")) {
      api.extractModelProfilesFromConfig()
        .then(() => localStorage.setItem("clawpal_profiles_extracted", "1"))
        .catch(() => {});
    }
  }, []);

  return (
    <div className="flex h-screen">
      <aside className="w-[200px] min-w-[200px] bg-panel border-r border-border-subtle flex flex-col py-4">
        <h1 className="px-4 text-lg font-bold text-text-main mb-4">ClawPal</h1>
        <nav className="flex flex-col gap-1 px-2">
          <Button
            variant="ghost"
            className={cn(
              "justify-start text-text-main hover:bg-accent-blue/10",
              (route === "home") && "bg-accent-blue/15 text-accent-blue border-l-[3px] border-accent-blue"
            )}
            onClick={() => setRoute("home")}
          >
            Home
          </Button>
          <Button
            variant="ghost"
            className={cn(
              "justify-start text-text-main hover:bg-accent-blue/10",
              (route === "recipes" || route === "install") && "bg-accent-blue/15 text-accent-blue border-l-[3px] border-accent-blue"
            )}
            onClick={() => setRoute("recipes")}
          >
            Recipes
          </Button>
          <Button
            variant="ghost"
            className={cn(
              "justify-start text-text-main hover:bg-accent-blue/10",
              (route === "history") && "bg-accent-blue/15 text-accent-blue border-l-[3px] border-accent-blue"
            )}
            onClick={() => setRoute("history")}
          >
            History
          </Button>
          <Button
            variant="ghost"
            className={cn(
              "justify-start text-text-main hover:bg-accent-blue/10",
              (route === "doctor") && "bg-accent-blue/15 text-accent-blue border-l-[3px] border-accent-blue"
            )}
            onClick={() => setRoute("doctor")}
          >
            Doctor
          </Button>
          <Separator className="my-2 bg-border-subtle" />
          <Button
            variant="ghost"
            className={cn(
              "justify-start text-text-main hover:bg-accent-blue/10",
              (route === "settings") && "bg-accent-blue/15 text-accent-blue border-l-[3px] border-accent-blue"
            )}
            onClick={() => setRoute("settings")}
          >
            Settings
          </Button>
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-4">
        {route === "home" && <Home />}
        {route === "recipes" && (
          <Recipes
            onInstall={(id, source) => {
              setRecipeId(id);
              setRecipeSource(source);
              setRoute("install");
            }}
          />
        )}
        {route === "install" && recipeId && (
          <Install
            recipeId={recipeId}
            recipeSource={recipeSource}
            onDone={() => {
              setRoute("recipes");
            }}
          />
        )}
        {route === "install" && !recipeId && <p>No recipe selected.</p>}
        {route === "history" && <History />}
        {route === "doctor" && <Doctor />}
        {route === "settings" && <Settings />}
        {route === "install" && (
          <Button
            variant="ghost"
            className="mt-3 text-text-main hover:bg-accent-blue/10"
            onClick={() => setRoute("recipes")}
          >
            ← Recipes
          </Button>
        )}
      </main>
    </div>
  );
}
