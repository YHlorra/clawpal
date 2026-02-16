import React, { useEffect, useReducer, useState } from "react";
import { api } from "../lib/api";
import { RecipeCard } from "../components/RecipeCard";
import { initialState, reducer } from "../lib/state";
import type { Recipe } from "../lib/types";

export function Recipes({
  onInstall,
}: {
  onInstall: (id: string, source?: string) => void;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [source, setSource] = useState("");
  const [loadedSource, setLoadedSource] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  const load = (nextSource: string) => {
    setIsLoading(true);
    const value = nextSource.trim();
    api
      .listRecipes(value || undefined)
      .then((recipes) => {
        setLoadedSource(value || undefined);
        dispatch({ type: "setRecipes", recipes });
      })
      .catch(() => dispatch({ type: "setMessage", message: "Failed to load recipes" }))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    load("");
  }, []);

  const onLoadSource = (event: React.FormEvent) => {
    event.preventDefault();
    load(source);
  };

  return (
    <section>
      <h2>Recipes</h2>
      <form onSubmit={onLoadSource} style={{ marginBottom: 8 }}>
        <label>
          Recipe source (file path or URL)
          <input
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="/path/recipes.json or https://example.com/recipes.json"
            style={{ marginLeft: 8, width: 380 }}
          />
        </label>
        <button type="submit" style={{ marginLeft: 8 }}>
          {isLoading ? "Loading..." : "Load"}
        </button>
      </form>
      <p style={{ opacity: 0.8, marginTop: 0 }}>Loaded from: {loadedSource || "builtin / clawpal recipes"}</p>
      <div className="recipe-grid">
        {state.recipes.map((recipe: Recipe) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            onInstall={() => onInstall(recipe.id, loadedSource)}
          />
        ))}
      </div>
    </section>
  );
}
