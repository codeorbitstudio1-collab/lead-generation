import React, { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Robot, X, PaperPlaneRight, Sparkle } from "@phosphor-icons/react";

const SUGGESTIONS = [
  "How does the auto-search work?",
  "Find restaurants in Bangalore",
  "Show me my hot leads",
  "How do I send emails?",
];

export default function AgentChat() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const nav = useNavigate();
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (text) => {
    const q = (text ?? msg).trim();
    if (!q || loading) return;
    setMsg("");
    setMessages((m) => [...m, { role: "user", content: q }]);
    setLoading(true);
    try {
      const { data } = await api.post("/agent/chat", { message: q, session_id: sessionId });
      if (!sessionId) setSessionId(data.session_id);
      setMessages((m) => [...m, { role: "assistant", content: data.reply, action: data.action }]);
      if (data.action) {
        handleAction(data.action);
      }
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: "Sorry — something went wrong." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = (action) => {
    if (!action?.type) return;
    if (action.type === "open_page") {
      const map = { dashboard: "/", search: "/search", leads: "/leads", schedules: "/schedules", outreach: "/outreach", settings: "/settings" };
      const path = map[action.params?.page];
      if (path) setTimeout(() => nav(path), 800);
    } else if (action.type === "search") {
      const p = new URLSearchParams(action.params || {});
      setTimeout(() => nav(`/search?${p.toString()}`), 800);
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          data-testid="agent-open"
          className="fixed bottom-6 right-6 z-50 h-14 w-14 flex items-center justify-center bg-primary text-white shadow-lg hover:bg-primary/90 btn-sharp"
          title="AI Assistant"
        >
          <Robot size={26} weight="bold" />
        </button>
      )}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-3rem)] bg-[#0A0A0A] border border-border flex flex-col shadow-2xl" data-testid="agent-panel">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 bg-primary/20 flex items-center justify-center">
                <Sparkle size={16} className="text-primary" weight="bold" />
              </div>
              <div>
                <div className="font-heading font-bold tracking-tight text-sm">LeadGen Assistant</div>
                <div className="text-[10px] tracking-widest uppercase text-muted-foreground">Powered by GPT-5.2</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} data-testid="agent-close" className="text-muted-foreground hover:text-white p-1">
              <X size={18} />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
            {messages.length === 0 && (
              <div className="text-muted-foreground text-xs space-y-3">
                <p>Hi! I can help you find leads, explain features, or navigate the app.</p>
                <div className="space-y-1">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="block w-full text-left px-3 py-2 border border-border hover:bg-[#121212] text-xs"
                      data-testid={`suggest-${s.slice(0, 10)}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user" ? "bg-primary text-white" : "bg-[#121212] border border-border"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-[#121212] border border-border px-3 py-2 text-xs text-muted-foreground">Thinking…</div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-border flex gap-2">
            <Input
              data-testid="agent-input"
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Ask anything..."
              className="rounded-none bg-[#121212] border-border h-10"
              disabled={loading}
            />
            <Button onClick={() => send()} disabled={loading || !msg.trim()} data-testid="agent-send" className="rounded-none bg-primary hover:bg-primary/90 h-10 px-3">
              <PaperPlaneRight size={16} />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
