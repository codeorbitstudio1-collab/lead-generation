import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Clock, EnvelopeSimple, MapPin, PaperPlaneTilt, Warning, ChatCircle, Play, CaretDown, CaretUp } from "@phosphor-icons/react";

function formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

function EmailRow({ e }) {
  const [open, setOpen] = useState(false);
  const ok = e.status === "sent";
  return (
    <div className="border border-border bg-[#0A0A0A]">
      <div className="flex items-center gap-3 px-3 py-2">
        <button onClick={() => setOpen(!open)} className="text-muted-foreground">
          {open ? <CaretUp size={12} /> : <CaretDown size={12} />}
        </button>
        <span className={`w-2 h-2 ${ok ? "bg-emerald-500" : "bg-red-500"}`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{e.to_email}</div>
          <div className="text-xs text-muted-foreground truncate">{e.lead_name || "—"} · {e.subject}</div>
        </div>
        <div className={`text-[10px] font-mono uppercase ${ok ? "text-emerald-400" : "text-red-400"}`}>{e.status}</div>
        <div className="text-[10px] text-muted-foreground font-mono">{formatTime(e.sent_at || e.created_at)}</div>
      </div>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <div className="text-[10px] tracking-widest uppercase text-muted-foreground">Subject</div>
          <div className="text-xs font-mono bg-[#121212] p-2">{e.subject}</div>
          <div className="text-[10px] tracking-widest uppercase text-muted-foreground">Body</div>
          <pre className="text-xs whitespace-pre-wrap bg-[#121212] p-2 max-h-64 overflow-y-auto">{e.body}</pre>
          {e.error && <div className="text-xs text-red-400">{e.error}</div>}
          {e.reply_body && (
            <div className="border border-emerald-500/30 bg-emerald-500/5 p-2">
              <div className="text-[10px] tracking-widest uppercase text-emerald-400 mb-1">Reply ({formatTime(e.reply_at)})</div>
              <div className="text-xs whitespace-pre-wrap">{e.reply_body}</div>
              {e.summary && <div className="text-[10px] text-emerald-300/70 mt-1">{e.summary}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SchedulerDashboardPage() {
  const [schedules, setSchedules] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/schedules");
      setSchedules(data.schedules);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const loadDetail = async (id) => {
    setLoadingDetail(true);
    try {
      const { data } = await api.get(`/schedules/${id}/emails`);
      setDetail(data);
    } catch {
      setDetail({ schedule: null, emails: [], stats: {} });
    } finally {
      setLoadingDetail(false);
    }
  };

  const runNow = async (id) => {
    try {
      await api.post(`/schedules/${id}/run`);
      loadDetail(id);
    } catch {
      /* noop */
    }
  };

  const toggleExpanded = async (id) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    await loadDetail(id);
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Automation Dashboard</div>
          <h1 className="font-heading text-4xl font-black tracking-tighter mt-1">Scheduler Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-2">Every scheduled run, email sent, and reply — all in one place.</p>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : schedules.length === 0 ? (
        <div className="border border-dashed border-border p-12 text-center">
          <Clock size={32} className="text-muted-foreground mx-auto mb-3" />
          <div className="text-sm text-muted-foreground">No schedules yet.</div>
        </div>
      ) : (
        <div className="space-y-4">
          {schedules.map((s) => {
            const isOpen = expanded === s.id;
            return (
              <div key={s.id} className="border border-border bg-[#121212]">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-heading font-bold text-lg leading-tight">{s.name}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><MapPin size={12} /> {s.location}</div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button onClick={() => runNow(s.id)} className="rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-[10px] font-bold h-9">
                        <Play size={12} className="mr-1" /> Run Now
                      </Button>
                      <Button onClick={() => toggleExpanded(s.id)} variant="outline" className="rounded-none uppercase tracking-widest text-[10px] font-bold h-9 border-border">
                        {isOpen ? "Hide" : "View"}
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs mt-4">
                    <div className="border border-border p-2">
                      <div className="text-[10px] tracking-widest uppercase text-muted-foreground">Category</div>
                      <div className="font-mono mt-1">{s.category}</div>
                    </div>
                    <div className="border border-border p-2">
                      <div className="text-[10px] tracking-widest uppercase text-muted-foreground">Time (UTC)</div>
                      <div className="font-mono mt-1">{String(s.hour).padStart(2, "0")}:{String(s.minute).padStart(2, "0")}</div>
                    </div>
                    <div className="border border-border p-2">
                      <div className="text-[10px] tracking-widest uppercase text-muted-foreground">Emails</div>
                      <div className="font-mono mt-1">{s.send_emails ? "ON" : "OFF"}</div>
                    </div>
                    <div className="border border-border p-2">
                      <div className="text-[10px] tracking-widest uppercase text-muted-foreground">Status</div>
                      <div className="font-mono mt-1">{s.active ? "Active" : "Paused"}</div>
                    </div>
                    <div className="border border-border p-2">
                      <div className="text-[10px] tracking-widest uppercase text-muted-foreground">Last run</div>
                      <div className="font-mono mt-1 text-[11px]">{formatTime(s.last_run)}</div>
                    </div>
                  </div>
                  {s.last_email_stats && (
                    <div className="grid grid-cols-3 gap-2 text-xs mt-2">
                      <div className="border border-emerald-500/30 bg-emerald-500/5 p-2">
                        <div className="text-[10px] tracking-widest uppercase text-emerald-400">Last email run</div>
                        <div className="font-mono mt-1 text-emerald-300">{s.last_email_stats.sent} sent</div>
                      </div>
                      <div className="border border-red-500/30 bg-red-500/5 p-2">
                        <div className="text-[10px] tracking-widest uppercase text-red-400">Failed</div>
                        <div className="font-mono mt-1 text-red-300">{s.last_email_stats.failed}</div>
                      </div>
                      <div className="border border-border p-2">
                        <div className="text-[10px] tracking-widest uppercase text-muted-foreground">Skipped</div>
                        <div className="font-mono mt-1">{s.last_email_stats.skipped}</div>
                      </div>
                    </div>
                  )}
                </div>
                {isOpen && (
                  <div className="border-t border-border p-5 space-y-4">
                    {loadingDetail ? (
                      <div className="text-sm text-muted-foreground">Loading detail…</div>
                    ) : detail ? (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="border border-border p-3 bg-[#0A0A0A]">
                            <div className="flex items-center gap-2 text-[10px] tracking-widest uppercase text-muted-foreground"><EnvelopeSimple size={12} /> Emails</div>
                            <div className="font-heading text-2xl font-black mt-1">{detail.stats.total || 0}</div>
                          </div>
                          <div className="border border-emerald-500/30 p-3 bg-[#0A0A0A]">
                            <div className="flex items-center gap-2 text-[10px] tracking-widest uppercase text-emerald-400"><PaperPlaneTilt size={12} /> Sent</div>
                            <div className="font-heading text-2xl font-black mt-1 text-emerald-400">{detail.stats.sent || 0}</div>
                          </div>
                          <div className="border border-red-500/30 p-3 bg-[#0A0A0A]">
                            <div className="flex items-center gap-2 text-[10px] tracking-widest uppercase text-red-400"><Warning size={12} /> Failed</div>
                            <div className="font-heading text-2xl font-black mt-1 text-red-400">{detail.stats.failed || 0}</div>
                          </div>
                          <div className="border border-sky-500/30 p-3 bg-[#0A0A0A]">
                            <div className="flex items-center gap-2 text-[10px] tracking-widest uppercase text-sky-400"><ChatCircle size={12} /> Replied</div>
                            <div className="font-heading text-2xl font-black mt-1 text-sky-400">{detail.stats.replied || 0}</div>
                          </div>
                        </div>
                        {detail.emails.length === 0 ? (
                          <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                            No emails recorded yet. They'll appear here after the next scheduled run.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {detail.emails.map((e) => <EmailRow key={e.id} e={e} />)}
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}