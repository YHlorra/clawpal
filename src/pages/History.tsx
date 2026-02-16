import React, { useEffect, useReducer } from "react";
import { api } from "../lib/api";
import { initialState, reducer } from "../lib/state";
import { DiffViewer } from "../components/DiffViewer";

export function History() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const refreshHistory = () =>
    api.listHistory(50, 0)
      .then((resp) => dispatch({ type: "setHistory", history: resp.items }))
      .catch(() => dispatch({ type: "setMessage", message: "Failed to load history" }));

  useEffect(() => {
    refreshHistory();
  }, []);

  return (
    <section>
      <h2>History</h2>
      <div className="history-list">
        {state.history.map((item) => (
          <article key={item.id} className="history-item">
            <p>
              {item.createdAt} · {item.recipeId || "manual"} · {item.source}
              {!item.canRollback ? " · not rollbackable" : ""}
            </p>
            <button
              onClick={async () => {
                try {
                  const preview = await api.previewRollback(item.id);
                  dispatch({ type: "setPreview", preview });
                } catch (err) {
                  dispatch({ type: "setMessage", message: String(err) });
                }
              }}
              disabled={!item.canRollback}
            >
              Preview rollback
            </button>
            <button
              onClick={async () => {
                if (!item.canRollback) {
                  dispatch({
                    type: "setMessage",
                    message: "This snapshot cannot be rolled back",
                  });
                  return;
                }
                try {
                  await api.rollback(item.id);
                  dispatch({ type: "setMessage", message: "Rollback completed" });
                  await refreshHistory();
                } catch (err) {
                  dispatch({ type: "setMessage", message: String(err) });
                }
              }}
              disabled={!item.canRollback}
            >
              Rollback
            </button>
          </article>
        ))}
      </div>
      {state.lastPreview && <DiffViewer value={state.lastPreview.diff} />}
      <button onClick={refreshHistory}>Refresh</button>
      <p>{state.message}</p>
    </section>
  );
}
