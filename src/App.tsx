import React, { useEffect, useState } from "react";
import { Home } from "./pages/Home";
import { Recipes } from "./pages/Recipes";
import { Install } from "./pages/Install";
import { History } from "./pages/History";
import { Doctor } from "./pages/Doctor";
import { Settings } from "./pages/Settings";
import { api } from "./lib/api";

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
    <div className="app-shell">
      <aside className="sidebar">
        <h1>ClawPal</h1>
        <nav>
          <button className={route === "home" ? "active" : ""} onClick={() => setRoute("home")}>Home</button>
          <button className={route === "recipes" || route === "install" ? "active" : ""} onClick={() => setRoute("recipes")}>Recipes</button>
          <button className={route === "history" ? "active" : ""} onClick={() => setRoute("history")}>History</button>
          <button className={route === "doctor" ? "active" : ""} onClick={() => setRoute("doctor")}>Doctor</button>
          <div className="sidebar-divider" />
          <button className={route === "settings" ? "active" : ""} onClick={() => setRoute("settings")}>Settings</button>
        </nav>
      </aside>
      <main className="content">
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
          <button
            onClick={() => setRoute("recipes")}
            style={{ marginTop: 12 }}
          >
            ← Recipes
          </button>
        )}
      </main>
    </div>
  );
}
