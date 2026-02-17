import { useEffect, useMemo, useReducer, useState } from "react";
import { api } from "@/lib/api";
import { initialState, reducer } from "@/lib/state";
import type { BackupInfo, MemoryFile, SessionFile } from "@/lib/types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
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

export function Doctor() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [memoryFiles, setMemoryFiles] = useState<MemoryFile[]>([]);
  const [sessionFiles, setSessionFiles] = useState<SessionFile[]>([]);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [dataMessage, setDataMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  const hasReport = Boolean(state.doctor);
  const autoFixable = hasReport
    ? state.doctor!.issues
        .filter((issue) => issue.autoFixable)
        .map((issue) => issue.id)
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
    api
      .listMemoryFiles()
      .then(setMemoryFiles)
      .catch(() => setDataMessage("Failed to load memory files"));
    api
      .listSessionFiles()
      .then(setSessionFiles)
      .catch(() => setDataMessage("Failed to load session files"));
  }

  useEffect(() => {
    api
      .runDoctor()
      .then((report) => dispatch({ type: "setDoctor", doctor: report }))
      .catch(() =>
        dispatch({ type: "setMessage", message: "Failed to run doctor" }),
      );
    refreshData();
  }, []);

  useEffect(() => {
    api.listBackups().then(setBackups).catch(() => {});
  }, []);

  return (
    <section>
      <h2 className="text-2xl font-bold mb-4">Doctor</h2>

      {/* Config Diagnostics */}
      {state.doctor && (
        <div>
          <p className="text-sm text-muted-foreground mb-3">
            Health score: {state.doctor.score}
          </p>
          <div className="space-y-2">
            {state.doctor.issues.map((issue) => (
              <div
                key={issue.id}
                className="flex items-center gap-2 text-sm"
              >
                {issue.severity === "error" && (
                  <Badge variant="destructive">ERROR</Badge>
                )}
                {issue.severity === "warn" && (
                  <Badge variant="secondary">WARN</Badge>
                )}
                {issue.severity === "info" && (
                  <Badge variant="outline">INFO</Badge>
                )}
                <span>{issue.message}</span>
                {issue.autoFixable && (
                  <Button
                    size="sm"
                    onClick={() => {
                      api
                        .fixIssues([issue.id])
                        .then(() => api.runDoctor())
                        .then((report) =>
                          dispatch({ type: "setDoctor", doctor: report }),
                        )
                        .catch(() =>
                          dispatch({
                            type: "setMessage",
                            message: "Failed to fix issue",
                          }),
                        );
                    }}
                  >
                    fix
                  </Button>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <Button
              variant="outline"
              onClick={() => {
                api
                  .fixIssues(autoFixable)
                  .then(() => api.runDoctor())
                  .then((report) =>
                    dispatch({ type: "setDoctor", doctor: report }),
                  )
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
            </Button>
            <Button
              variant="outline"
              disabled={refreshing}
              onClick={() => {
                setRefreshing(true);
                api
                  .runDoctor()
                  .then((report) => {
                    dispatch({ type: "setDoctor", doctor: report });
                    setLastRefreshed(new Date().toLocaleTimeString());
                    refreshData();
                  })
                  .catch(() =>
                    dispatch({
                      type: "setMessage",
                      message: "Refresh failed",
                    }),
                  )
                  .finally(() => setRefreshing(false));
              }}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
            {lastRefreshed && (
              <span className="text-xs text-muted-foreground ml-2">
                Last refreshed: {lastRefreshed}
              </span>
            )}
          </div>
        </div>
      )}
      {!hasReport ? (
        <Button
          onClick={() =>
            api
              .runDoctor()
              .then((report) =>
                dispatch({ type: "setDoctor", doctor: report }),
              )
          }
        >
          Run Doctor
        </Button>
      ) : null}
      <p className="text-sm text-muted-foreground mt-2">{state.message}</p>

      {/* Data Cleanup */}
      <h3 className="text-lg font-semibold mt-6 mb-3">
        Data Cleanup
      </h3>
      {dataMessage && (
        <p className="text-sm text-muted-foreground mt-2">{dataMessage}</p>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {/* Memory */}
        <Card>
          <CardHeader>
            <CardTitle>Memory</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm mb-2">
              {memoryFiles.length} files ({formatBytes(totalMemoryBytes)})
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={memoryFiles.length === 0}
                onClick={() => {
                  const memoryDir = memoryFiles.length > 0
                    ? memoryFiles[0].path.substring(0, memoryFiles[0].path.lastIndexOf("/"))
                    : "";
                  if (memoryDir) api.openUrl(memoryDir);
                }}
              >
                Show
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={memoryFiles.length === 0}
                  >
                    Clear all memory
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all memory?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete {memoryFiles.length} memory file(s). This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
                      Clear
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>

        {/* Sessions */}
        <Card>
          <CardHeader>
            <CardTitle>Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm mb-2">
              {sessionFiles.length} files ({formatBytes(totalSessionBytes)})
            </p>
            {agents.map((a) => (
              <div
                key={a.agent}
                className="flex items-center gap-2 my-1"
              >
                <span className="text-sm">
                  {a.agent}: {a.count} files ({formatBytes(a.size)})
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const agentFile = sessionFiles.find(f => f.agent === a.agent);
                    const agentDir = agentFile ? agentFile.path.substring(0, agentFile.path.lastIndexOf("/")) : "";
                    if (agentDir) api.openUrl(agentDir);
                  }}
                >
                  Show
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive">
                      Clear
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear sessions for {a.agent}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete {a.count} session file(s) for {a.agent}. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => {
                          api
                            .clearAgentSessions(a.agent)
                            .then((count) => {
                              setDataMessage(
                                `Cleared ${count} session file(s) for ${a.agent}`,
                              );
                              refreshData();
                            })
                            .catch(() =>
                              setDataMessage(
                                `Failed to clear sessions for ${a.agent}`,
                              ),
                            );
                        }}
                      >
                        Clear
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={sessionFiles.length === 0}
                onClick={() => {
                  const sessionsDir = sessionFiles.length > 0
                    ? sessionFiles[0].path.substring(0, sessionFiles[0].path.lastIndexOf("/"))
                    : "";
                  if (sessionsDir) api.openUrl(sessionsDir);
                }}
              >
                Show
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={sessionFiles.length === 0}
                  >
                    Clear all sessions
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all sessions?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete {sessionFiles.length} session file(s). This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
                      Clear
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>

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
                          This will restore config and workspace files from backup "{backup.name}". Current files will be overwritten. Session data will not be affected.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            api.restoreFromBackup(backup.name)
                              .then((msg) => setDataMessage(msg))
                              .catch(() => setDataMessage("Restore failed"));
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
                                setDataMessage(`Deleted backup "${backup.name}"`);
                                api.listBackups().then(setBackups).catch(() => {});
                              })
                              .catch(() => setDataMessage("Delete failed"));
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
    </section>
  );
}
