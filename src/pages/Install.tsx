import React, { useEffect, useReducer, useState } from "react";
import { api } from "../lib/api";
import { ParamForm } from "../components/ParamForm";
import { DiffViewer } from "../components/DiffViewer";
import { initialState, reducer } from "../lib/state";

export function Install({
  recipeId,
  onDone,
  recipeSource,
}: {
  recipeId: string;
  onDone?: () => void;
  recipeSource?: string;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [params, setParams] = useState<Record<string, string>>({});
  const [isApplying, setIsApplying] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

  useEffect(() => {
    api.listRecipes(recipeSource).then((recipes) => {
      const recipe = recipes.find((it) => it.id === recipeId);
      dispatch({ type: "setRecipes", recipes });
      if (!recipe) return;
      const defaults: Record<string, string> = {};
      for (const p of recipe.params) {
        defaults[p.id] = "";
      }
      setParams(defaults);
    });
  }, [recipeId, recipeSource]);

  const recipe = state.recipes.find((r) => r.id === recipeId);

  if (!recipe) return <div>Recipe not found</div>;

  return (
    <section>
      <h2>Install {recipe.name}</h2>
      <ParamForm
        recipe={recipe}
        values={params}
        onChange={(id, value) => setParams((prev) => ({ ...prev, [id]: value }))}
        onSubmit={() => {
          setIsPreviewing(true);
          api.previewApply(recipe.id, params, recipeSource)
            .then((preview) => dispatch({ type: "setPreview", preview }))
            .catch((err) => dispatch({ type: "setMessage", message: String(err) }))
            .finally(() => setIsPreviewing(false));
        }}
      />
      {state.lastPreview && (
        <section>
          <h3>Preview</h3>
          <DiffViewer value={state.lastPreview.diff} />
          <button
            disabled={isApplying}
            onClick={() => {
              setIsApplying(true);
              api.applyRecipe(recipe.id, params, recipeSource)
                .then((result) => {
                  if (!result.ok) {
                    const errors = result.errors.length ? result.errors.join(", ") : "failed";
                    dispatch({ type: "setMessage", message: `Apply failed: ${errors}` });
                    return;
                  }
                  dispatch({
                    type: "setMessage",
                    message: result.snapshotId
                      ? `Applied successfully. Snapshot: ${result.snapshotId}`
                      : "Applied successfully",
                  });
                  if (onDone) {
                    onDone();
                  }
                })
                .catch((err) => dispatch({ type: "setMessage", message: String(err) }))
                .finally(() => setIsApplying(false));
            }}
          >
            Apply
          </button>
          {isPreviewing ? <span> ...previewing</span> : null}
          {isApplying ? <span> ...applying</span> : null}
        </section>
      )}
      <p>{state.message}</p>
    </section>
  );
}
