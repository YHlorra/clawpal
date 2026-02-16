import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const AGENT_ID = "main";
const SESSION_KEY_PREFIX = "clawpal_chat_session_";

function loadSessionId(agent: string): string | undefined {
  return localStorage.getItem(SESSION_KEY_PREFIX + agent) || undefined;
}
function saveSessionId(agent: string, sid: string) {
  localStorage.setItem(SESSION_KEY_PREFIX + agent, sid);
}
function clearSessionId(agent: string) {
  localStorage.removeItem(SESSION_KEY_PREFIX + agent);
}

const CLAWPAL_CONTEXT = `[ClawPal Context] You are responding inside ClawPal, a desktop GUI for OpenClaw configuration.
Rules:
- You are in READ-ONLY advisory mode. Do NOT execute commands, send messages, or modify config directly.
- When the user asks to change something, explain what should be changed and show the config diff, but do NOT apply it.
- Only discuss OpenClaw configuration topics (agents, models, channels, recipes, memory, sessions).
- Keep responses concise (2-3 sentences unless the user asks for detail).
User message: `;

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<string[]>([]);
  const [agentId, setAgentId] = useState(AGENT_ID);
  const [sessionId, setSessionId] = useState<string | undefined>(() => loadSessionId(AGENT_ID));
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.listAgentIds().then(setAgents).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // Inject ClawPal context on first message of a session
      const payload = sessionId ? userMsg.content : CLAWPAL_CONTEXT + userMsg.content;
      const result = await api.chatViaOpenclaw(agentId, payload, sessionId);
      // Extract session ID for conversation continuity
      const meta = result.meta as Record<string, unknown> | undefined;
      const agentMeta = meta?.agentMeta as Record<string, unknown> | undefined;
      if (agentMeta?.sessionId) {
        const sid = agentMeta.sessionId as string;
        setSessionId(sid);
        saveSessionId(agentId, sid);
      }
      // Extract reply text
      const payloads = result.payloads as Array<{ text?: string }> | undefined;
      const text = payloads?.map((p) => p.text).filter(Boolean).join("\n") || "No response";
      setMessages((prev) => [...prev, { role: "assistant", content: text }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err}` }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, agentId, sessionId]);

  return (
    <div className="home-chat">
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 8px" }}>
        <h3 style={{ margin: 0 }}>Chat</h3>
        <select
          value={agentId}
          onChange={(e) => { const a = e.target.value; setAgentId(a); setSessionId(loadSessionId(a)); setMessages([]); }}
          style={{ fontSize: "0.8rem", padding: "2px 6px" }}
        >
          {agents.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => { clearSessionId(agentId); setSessionId(undefined); setMessages([]); }}
          style={{ fontSize: "0.75rem", padding: "2px 8px", opacity: 0.7 }}
        >
          New
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", marginBottom: 8 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: 8, textAlign: msg.role === "user" ? "right" : "left" }}>
            <div style={{
              display: "inline-block",
              background: msg.role === "user" ? "#2d3560" : "var(--panel)",
              padding: "8px 12px",
              borderRadius: 8,
              maxWidth: "90%",
              textAlign: "left",
              border: "1px solid #29325a",
            }}>
              <div style={{ whiteSpace: "pre-wrap", fontSize: "0.9rem" }}>{msg.content}</div>
            </div>
          </div>
        ))}
        {loading && <div style={{ opacity: 0.5, fontSize: "0.9rem" }}>Thinking...</div>}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask your OpenClaw agent..."
          style={{ flex: 1 }}
        />
        <button onClick={send} disabled={loading}>Send</button>
      </div>
    </div>
  );
}
