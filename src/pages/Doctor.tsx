import { useEffect, useMemo, useReducer, useState } from "react";
import { api } from "@/lib/api";
import { useInstance } from "@/lib/instance-context";
import { initialState, reducer } from "@/lib/state";
import type { AgentSessionAnalysis, BackupInfo, MemoryFile, SessionFile } from "@/lib/types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const { instanceId, isRemote, isConnected } = useInstance();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [rawOutput, setRawOutput] = useState<string | null>(null);
  const [memoryFiles, setMemoryFiles] = useState<MemoryFile[]>([]);
  const [sessionFiles, setSessionFiles] = useState<SessionFile[]>([]);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [dataMessage, setDataMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [sessionAnalysis, setSessionAnalysis] = useState<AgentSessionAnalysis[] | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [selectedSessions, setSelectedSessions] = useState<Map<string, Set<string>>>(new Map());
  const [deletingCategory, setDeletingCategory] = useState<{ agent: string; category: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMessages, setPreviewMessages] = useState<{ role: string; content: string }[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewTitle, setPreviewTitle] = useState("");

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

  function runDoctorCmd(): Promise<import("@/lib/types").DoctorReport> {
    if (isRemote && isConnected) {
      return api.remoteRunDoctor(instanceId).then((report) => {
        // Remote doctor may return a rawOutput field instead of structured issues
        const raw = (report as unknown as Record<string, unknown>).rawOutput;
        if (raw && typeof raw === "string") {
          setRawOutput(raw);
        } else {
          setRawOutput(null);
        }
        return report;
      });
    }
    setRawOutput(null);
    return api.runDoctor();
  }

  function refreshData() {
    if (isRemote) {
      if (!isConnected) return;
      api.remoteListSessionFiles(instanceId)
        .then(setSessionFiles)
        .catch(() => setDataMessage("Failed to load remote session files"));
    } else {
      api.listMemoryFiles()
        .then(setMemoryFiles)
        .catch(() => setDataMessage("Failed to load memory files"));
      api.listSessionFiles()
        .then(setSessionFiles)
        .catch(() => setDataMessage("Failed to load session files"));
    }
  }

  function removeSessionsFromAnalysis(agent: string, deletedIds: Set<string>) {
    setSessionAnalysis((prev) => {
      if (!prev) return prev;
      return prev
        .map((a) => {
          if (a.agent !== agent) return a;
          const remaining = a.sessions.filter((s) => !deletedIds.has(s.sessionId));
          return {
            ...a,
            sessions: remaining,
            totalFiles: remaining.length,
            totalSizeBytes: remaining.reduce((sum, s) => sum + s.sizeBytes, 0),
            emptyCount: remaining.filter((s) => s.category === "empty").length,
            lowValueCount: remaining.filter((s) => s.category === "low_value").length,
            valuableCount: remaining.filter((s) => s.category === "valuable").length,
          };
        })
        .filter((a) => a.totalFiles > 0);
    });
  }

  useEffect(() => {
    if (!isRemote) {
      runDoctorCmd()
        .then((report) => dispatch({ type: "setDoctor", doctor: report }))
        .catch(() =>
          dispatch({ type: "setMessage", message: "Failed to run doctor" }),
        );
    }
    refreshData();
  }, [instanceId, isRemote, isConnected]);

  useEffect(() => {
    api.listBackups().then(setBackups).catch((e) => console.error("Failed to load backups:", e));
  }, []);

  return (
    <section>
      <h2 className="text-2xl font-bold mb-4">Doctor</h2>

      {/* Config Diagnostics — local only */}
      {!isRemote && (
        <>
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
                            .then(() => runDoctorCmd())
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
                      .then(() => runDoctorCmd())
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
                    runDoctorCmd()
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
                runDoctorCmd()
                  .then((report) =>
                    dispatch({ type: "setDoctor", doctor: report }),
                  )
              }
            >
              Run Doctor
            </Button>
          ) : null}
          <p className="text-sm text-muted-foreground mt-2">{state.message}</p>
        </>
      )}

      {/* Data Cleanup */}
      <h3 className="text-lg font-semibold mt-6 mb-3">
        Data Cleanup
      </h3>
      {dataMessage && (
        <p className="text-sm text-muted-foreground mt-2">{dataMessage}</p>
      )}

      <div className="space-y-3">
        {/* Sessions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Sessions</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={analyzing}
                  onClick={() => {
                    setAnalyzing(true);
                    const analyzePromise = isRemote
                      ? api.remoteAnalyzeSessions(instanceId)
                      : api.analyzeSessions();
                    analyzePromise
                      .then((data) => {
                        setSessionAnalysis(data);
                        setExpandedAgents(new Set());
                        setSelectedSessions(new Map());
                      })
                      .catch(() => setDataMessage("Failed to analyze sessions"))
                      .finally(() => setAnalyzing(false));
                  }}
                >
                  {analyzing ? "Analyzing..." : "Analyze"}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" disabled={sessionFiles.length === 0}>
                      Clear all
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
                          const clearPromise = isRemote
                            ? api.remoteClearAllSessions(instanceId)
                            : api.clearAllSessions();
                          clearPromise
                            .then((count) => {
                              setDataMessage(`Cleared ${count} session file(s)`);
                              setSessionAnalysis(null);
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
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              {sessionFiles.length} files ({formatBytes(totalSessionBytes)})
            </p>

            {!sessionAnalysis ? (
              /* Basic agent list (before analysis) */
              <div className="space-y-1">
                {agents.map((a) => (
                  <div key={a.agent} className="text-sm">
                    {a.agent}: {a.count} files ({formatBytes(a.size)})
                  </div>
                ))}
              </div>
            ) : (
              /* Analysis results: two-level view */
              <div className="space-y-3">
                {sessionAnalysis.length === 0 && (
                  <p className="text-sm text-muted-foreground">No session files found.</p>
                )}
                {sessionAnalysis.map((agentData) => {
                  const isExpanded = expandedAgents.has(agentData.agent);
                  const agentSelected = selectedSessions.get(agentData.agent) || new Set<string>();

                  const deleteSessionsFn = (ids: string[]) => {
                    const deletePromise = isRemote
                      ? api.remoteDeleteSessionsByIds(instanceId, agentData.agent, ids)
                      : api.deleteSessionsByIds(agentData.agent, ids);
                    return deletePromise;
                  };

                  return (
                    <div key={agentData.agent} className="border rounded-md p-3">
                      {/* Agent summary row */}
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-medium text-sm">{agentData.agent}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {agentData.totalFiles} files ({formatBytes(agentData.totalSizeBytes)})
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setExpandedAgents((prev) => {
                              const next = new Set(prev);
                              if (next.has(agentData.agent)) next.delete(agentData.agent);
                              else next.add(agentData.agent);
                              return next;
                            });
                          }}
                        >
                          {isExpanded ? "\u25B2 Collapse" : "\u25BC Details"}
                        </Button>
                      </div>

                      {/* Category badges */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {agentData.emptyCount > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {agentData.emptyCount} empty
                          </Badge>
                        )}
                        {agentData.lowValueCount > 0 && (
                          <Badge variant="secondary" className="text-xs bg-yellow-500/15 text-yellow-700 dark:text-yellow-400">
                            {agentData.lowValueCount} low value
                          </Badge>
                        )}
                        {agentData.valuableCount > 0 && (
                          <Badge variant="secondary" className="text-xs bg-green-500/15 text-green-700 dark:text-green-400">
                            {agentData.valuableCount} valuable
                          </Badge>
                        )}
                      </div>

                      {/* Quick-clean buttons & batch actions */}
                      <div className="flex gap-2 flex-wrap">
                        {agentData.emptyCount > 0 && (
                          <AlertDialog
                            open={deletingCategory?.agent === agentData.agent && deletingCategory?.category === "empty"}
                            onOpenChange={(open) => !open && setDeletingCategory(null)}
                          >
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7"
                                onClick={() => setDeletingCategory({ agent: agentData.agent, category: "empty" })}
                              >
                                Clean empty
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Clean empty sessions?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Delete {agentData.emptyCount} empty session(s) for {agentData.agent}. These sessions have no messages.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => {
                                    const ids = agentData.sessions
                                      .filter((s) => s.category === "empty")
                                      .map((s) => s.sessionId);
                                    deleteSessionsFn(ids)
                                      .then((count) => {
                                        setDataMessage(`Deleted ${count} empty session(s) for ${agentData.agent}`);
                                        removeSessionsFromAnalysis(agentData.agent, new Set(ids));
                                        refreshData();
                                      })
                                      .catch(() => setDataMessage("Failed to delete sessions"));
                                  }}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        {agentData.lowValueCount > 0 && (
                          <AlertDialog
                            open={deletingCategory?.agent === agentData.agent && deletingCategory?.category === "low_value"}
                            onOpenChange={(open) => !open && setDeletingCategory(null)}
                          >
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7"
                                onClick={() => setDeletingCategory({ agent: agentData.agent, category: "low_value" })}
                              >
                                Clean low value
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Clean low-value sessions?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Delete {agentData.lowValueCount} low-value session(s) for {agentData.agent}. These are old sessions with minimal interaction.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => {
                                    const ids = agentData.sessions
                                      .filter((s) => s.category === "low_value")
                                      .map((s) => s.sessionId);
                                    deleteSessionsFn(ids)
                                      .then((count) => {
                                        setDataMessage(`Deleted ${count} low-value session(s) for ${agentData.agent}`);
                                        removeSessionsFromAnalysis(agentData.agent, new Set(ids));
                                        refreshData();
                                      })
                                      .catch(() => setDataMessage("Failed to delete sessions"));
                                  }}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        {agentSelected.size > 0 && (
                          <>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="destructive" className="text-xs h-7">
                                  Delete {agentSelected.size} selected
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete selected sessions?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Delete {agentSelected.size} session(s) for {agentData.agent}. This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => {
                                      const ids = Array.from(agentSelected);
                                      deleteSessionsFn(ids)
                                        .then((count) => {
                                          setDataMessage(`Deleted ${count} session(s) for ${agentData.agent}`);
                                          removeSessionsFromAnalysis(agentData.agent, new Set(ids));
                                          setSelectedSessions((prev) => {
                                            const next = new Map(prev);
                                            next.delete(agentData.agent);
                                            return next;
                                          });
                                          refreshData();
                                        })
                                        .catch(() => setDataMessage("Failed to delete sessions"));
                                    }}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs h-7"
                              onClick={() => {
                                setSelectedSessions((prev) => {
                                  const next = new Map(prev);
                                  next.delete(agentData.agent);
                                  return next;
                                });
                              }}
                            >
                              Deselect
                            </Button>
                          </>
                        )}
                      </div>

                      {/* Expanded session details */}
                      {isExpanded && (
                        <div className="mt-3 space-y-1">
                          {agentData.sessions.map((session) => {
                            const isChecked = agentSelected.has(session.sessionId);
                            const categoryColor =
                              session.category === "empty"
                                ? "text-red-500"
                                : session.category === "low_value"
                                  ? "text-yellow-500"
                                  : "text-green-500";
                            const categoryDot =
                              session.category === "empty"
                                ? "bg-red-500"
                                : session.category === "low_value"
                                  ? "bg-yellow-500"
                                  : "bg-green-500";

                            const ageLabel = session.ageDays < 1
                              ? "< 1d"
                              : session.ageDays < 30
                                ? `${Math.round(session.ageDays)}d`
                                : `${Math.round(session.ageDays / 30)}mo`;

                            return (
                              <div
                                key={session.sessionId}
                                className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-muted/50"
                              >
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={(checked) => {
                                    setSelectedSessions((prev) => {
                                      const next = new Map(prev);
                                      const agentSet = new Set(next.get(agentData.agent) || []);
                                      if (checked) agentSet.add(session.sessionId);
                                      else agentSet.delete(session.sessionId);
                                      next.set(agentData.agent, agentSet);
                                      return next;
                                    });
                                  }}
                                />
                                <span className={`w-2 h-2 rounded-full shrink-0 ${categoryDot}`} />
                                <button
                                  className="font-mono w-20 truncate text-left underline decoration-dotted hover:text-foreground text-muted-foreground"
                                  title={`Preview ${session.sessionId}`}
                                  onClick={() => {
                                    setPreviewTitle(`${agentData.agent} / ${session.sessionId.slice(0, 12)}`);
                                    setPreviewMessages([]);
                                    setPreviewLoading(true);
                                    setPreviewOpen(true);
                                    const previewPromise = isRemote
                                      ? api.remotePreviewSession(instanceId, agentData.agent, session.sessionId)
                                      : api.previewSession(agentData.agent, session.sessionId);
                                    previewPromise
                                      .then(setPreviewMessages)
                                      .catch(() => setPreviewMessages([{ role: "error", content: "Failed to load session" }]))
                                      .finally(() => setPreviewLoading(false));
                                  }}
                                >
                                  {session.sessionId.slice(0, 8)}
                                </button>
                                <span className="w-16 text-right">{formatBytes(session.sizeBytes)}</span>
                                <span className="w-16 text-right">{session.messageCount} msgs</span>
                                <span className="w-12 text-right text-muted-foreground">{ageLabel}</span>
                                <span className="w-16 truncate text-muted-foreground" title={session.model || ""}>
                                  {session.model || "—"}
                                </span>
                                <span className={`w-16 ${categoryColor}`}>
                                  {session.category === "low_value" ? "low" : session.category}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Backups — local only */}
      {!isRemote && (
      <>
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
      </>
      )}
      {/* Session Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{previewTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 text-sm">
            {previewLoading && <p className="text-muted-foreground">Loading...</p>}
            {!previewLoading && previewMessages.length === 0 && (
              <p className="text-muted-foreground">No messages in this session.</p>
            )}
            {previewMessages.map((msg, i) => (
              <div key={i} className={`rounded-md p-2 ${msg.role === "user" ? "bg-muted" : msg.role === "assistant" ? "bg-primary/5" : "bg-destructive/10"}`}>
                <div className="text-xs font-medium text-muted-foreground mb-1">{msg.role}</div>
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
