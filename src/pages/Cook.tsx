import { useEffect, useReducer, useState } from "react";
import { api } from "../lib/api";
import { ParamForm } from "../components/ParamForm";
import { DiffViewer } from "../components/DiffViewer";
import { initialState, reducer } from "../lib/state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { DiscordGuildChannel } from "../lib/types";

export function Cook({
  recipeId,
  onDone,
  recipeSource,
  discordGuildChannels,
}: {
  recipeId: string;
  onDone?: () => void;
  recipeSource?: string;
  discordGuildChannels: DiscordGuildChannel[];
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [params, setParams] = useState<Record<string, string>>({});
  const [isApplying, setIsApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [applyError, setApplyError] = useState("");
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

  const isCustomAction = !!recipe.action;

  const handleApply = async () => {
    setIsApplying(true);
    setApplyError("");
    try {
      const result = await api.applyRecipe(recipe.id, params, recipeSource);
      if (!result.ok) {
        const errors = result.errors.length ? result.errors.join(", ") : "failed";
        setApplyError(`Apply failed: ${errors}`);
        return;
      }
      setApplied(true);
    } catch (err) {
      setApplyError(String(err));
    } finally {
      setIsApplying(false);
    }
  };

  const handleCustomAction = async () => {
    setIsApplying(true);
    setApplyError("");
    try {
      if (recipe.action === "setup_agent") {
        await api.setupAgentIdentity(
          params.agent_id,
          params.name,
          params.emoji || undefined,
        );
      } else {
        throw new Error(`Unknown action: ${recipe.action}`);
      }
      setApplied(true);
    } catch (err) {
      setApplyError(String(err));
    } finally {
      setIsApplying(false);
    }
  };

  const successMessage = isCustomAction
    ? "Done"
    : "Config updated";

  const successHint = isCustomAction
    ? "Agent identity has been updated."
    : "Use \"Apply Changes\" in the sidebar to restart the gateway and activate the changes.";

  return (
    <section>
      <h2 className="text-2xl font-bold mb-4">
        Cook {recipe.name}
      </h2>

      {applied ? (
        <Card>
          <CardContent className="py-8 text-center">
            <div className="text-2xl mb-2">&#10003;</div>
            <p className="text-lg font-medium">{successMessage}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {successHint}
            </p>
            <Button className="mt-4" onClick={onDone}>
              Back to Recipes
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <ParamForm
            recipe={recipe}
            values={params}
            onChange={(id, value) => setParams((prev) => ({ ...prev, [id]: value }))}
            onSubmit={() => {
              if (isCustomAction) {
                handleCustomAction();
              } else {
                setIsPreviewing(true);
                api.previewApply(recipe.id, params, recipeSource)
                  .then((preview) => dispatch({ type: "setPreview", preview }))
                  .catch((err) => dispatch({ type: "setMessage", message: String(err) }))
                  .finally(() => setIsPreviewing(false));
              }
            }}
            submitLabel={isCustomAction ? "Apply" : "Preview"}
            discordGuildChannels={discordGuildChannels}
          />
          {isCustomAction && applyError && (
            <p className="text-sm text-destructive mt-2">{applyError}</p>
          )}
          {isCustomAction && isApplying && (
            <p className="text-sm text-muted-foreground mt-2">Applying...</p>
          )}
          {state.lastPreview && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-lg font-semibold mb-2">
                  Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DiffViewer
                  oldValue={state.lastPreview.configBefore}
                  newValue={state.lastPreview.configAfter}
                />
                <div className="flex items-center gap-3 mt-3">
                  <Button disabled={isApplying} onClick={handleApply}>
                    Apply
                  </Button>
                  {isApplying && (
                    <span className="text-sm text-muted-foreground">Applying config...</span>
                  )}
                  {applyError && (
                    <span className="text-sm text-destructive">{applyError}</span>
                  )}
                  {isPreviewing && (
                    <span className="text-sm text-muted-foreground">Previewing...</span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          {!isCustomAction && (
            <p className="text-sm text-muted-foreground mt-2">{state.message}</p>
          )}
        </>
      )}
    </section>
  );
}
