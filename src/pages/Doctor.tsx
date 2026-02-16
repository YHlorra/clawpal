import React, { useEffect, useMemo, useReducer, useState } from "react";
import { api } from "../lib/api";
import { initialState, reducer } from "../lib/state";
import type { MemoryFile, SessionFile } from "../lib/types";

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let index = 0;
  let value = bytes;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(1)} ${units[index]}`;
}

export function Doctor() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [memoryFiles, setMemoryFiles] = useState<MemoryFile[]>([]);
  const [sessionFiles, setSessionFiles] = useState<SessionFile[]>([]);
  const [dataMessage, setDataMessage] = useState("");

  const hasReport = Boolean(state.doctor);
  const autoFixable = hasReport
    ? state.doctor!.issues.filter((issue) => issue.autoFixable).map((issue) => issue.id)
    : [];

  const agents = useMemo(() => {
    const map = new Map<string, { count: number; size: number }>();
    for (const f of sessionFiles) {
      const entry = map.get(f.agent) || { count: 0, size: 0 };
      entry.count += 1;
      entry.size += f.sizeBytes;
      map.set(f.agent, entry);
    }
    return Array.from(map.entries()).map(([agent, info]) => ({
      agent,
      count: info.count,
      size: info.size,
    }));
  }, [sessionFiles]);

  const totalMemoryBytes = useMemo(
    () => memoryFiles.reduce((sum, f) => sum + f.sizeBytes, 0),
    [memoryFiles],
  );
  const totalSessionBytes = useMemo(
    () => sessionFiles.reduce((sum, f) => sum + f.sizeBytes, 0),
    [sessionFiles],
  );

  function refreshData() {
    api.listMemoryFiles().then(setMemoryFiles).catch(() => setDataMessage("Failed to load memory files"));
    api.listSessionFiles().then(setSessionFiles).catch(() => setDataMessage("Failed to load session files"));
  }

  useEffect(() => {
    api
      .runDoctor()
      .then((report) => dispatch({ type: "setDoctor", doctor: report }))
      .catch(() => dispatch({ type: "setMessage", message: "Failed to run doctor" }));
    refreshData();
  }, []);

  return (
    <section>
      <h2>Doctor</h2>

      {/* ── Config Diagnostics ── */}
      {state.doctor && (
        <div>
          <p>Health score: {state.doctor.score}</p>
          <ul>
            {state.doctor.issues.map((issue) => (
              <li key={issue.id}>
                {issue.severity.toUpperCase()} {issue.message}
                {issue.autoFixable && (
                  <button
                    onClick={() => {
                      api
                        .fixIssues([issue.id])
                        .then(() => api.runDoctor())
                        .then((report) => dispatch({ type: "setDoctor", doctor: report }))
                        .catch(() =>
                          dispatch({
                            type: "setMessage",
                            message: "Failed to fix issue",
                          }),
                        );
                    }}
                  >
                    fix
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              api
                .fixIssues(autoFixable)
                .then(() => api.runDoctor())
                .then((report) => dispatch({ type: "setDoctor", doctor: report }))
                .catch(() =>
                  dispatch({
                    type: "setMessage",
                    message: "Failed to fix all issues",
                  }),
                );
            }}
            disabled={!autoFixable.length}
          >
            Fix all auto issues
          </button>
          <button
            onClick={() =>
              api
                .runDoctor()
                .then((report) => dispatch({ type: "setDoctor", doctor: report }))
                .catch(() => dispatch({ type: "setMessage", message: "Refresh failed" }))
            }
          >
            Refresh
          </button>
        </div>
      )}
      {!hasReport ? <button onClick={() => api.runDoctor().then((report) => dispatch({ type: "setDoctor", doctor: report }))}>Run Doctor</button> : null}
      <p>{state.message}</p>

      {/* ── Data Cleanup ── */}
      <h3>Data Cleanup</h3>
      {dataMessage && <p>{dataMessage}</p>}

      <div className="status-grid">
        {/* Memory */}
        <div className="card">
          <h4>Memory</h4>
          <p>{memoryFiles.length} files ({formatBytes(totalMemoryBytes)})</p>
          <button
            disabled={memoryFiles.length === 0}
            onClick={() => {
              api
                .clearMemory()
                .then((count) => {
                  setDataMessage(`Cleared ${count} memory file(s)`);
                  refreshData();
                })
                .catch(() => setDataMessage("Failed to clear memory"));
            }}
          >
            Clear all memory
          </button>
        </div>

        {/* Sessions */}
        <div className="card">
          <h4>Sessions</h4>
          <p>{sessionFiles.length} files ({formatBytes(totalSessionBytes)})</p>
          {agents.map((a) => (
            <div key={a.agent} style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}>
              <span>{a.agent}: {a.count} files ({formatBytes(a.size)})</span>
              <button
                onClick={() => {
                  api
                    .clearAgentSessions(a.agent)
                    .then((count) => {
                      setDataMessage(`Cleared ${count} session file(s) for ${a.agent}`);
                      refreshData();
                    })
                    .catch(() => setDataMessage(`Failed to clear sessions for ${a.agent}`));
                }}
              >
                Clear
              </button>
            </div>
          ))}
          <button
            disabled={sessionFiles.length === 0}
            onClick={() => {
              api
                .clearAllSessions()
                .then((count) => {
                  setDataMessage(`Cleared ${count} session file(s)`);
                  refreshData();
                })
                .catch(() => setDataMessage("Failed to clear sessions"));
            }}
          >
            Clear all sessions
          </button>
        </div>
      </div>
    </section>
  );
}
