import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PhoneCall, GearSix, ArrowClockwise, PaperPlaneTilt, MagicWand, WhatsappLogo, FileText, Copy } from "@phosphor-icons/react";
import { waLink } from "@/lib/utils";

const STATUSES = ["new", "contacted", "interested", "converted", "onboarding", "active", "closed", "archived", "rejected"];

function scorePill(score) {
  if (score >= 70) return "bg-[#FF3B30]/20 text-[#FF3B30] border-[#FF3B30]";
  if (score >= 40) return "bg-[#FFCC00]/20 text-[#FFCC00] border-[#FFCC00]";
  return "bg-[#71717A]/20 text-[#a1a1aa] border-[#71717A]";
}

export default function CallNowPage() {
  const [queue, setQueue] = useState([]);
  const [summary, setSummary] = useState({ total_with_phone: 0, hot: 0, warm: 0 });
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(50);
  const [minScore, setMinScore] = useState(0);
  const [generatingFor, setGeneratingFor] = useState(null);
  const [scriptFor, setScriptFor] = useState(null);
  const [logFor, setLogFor] = useState(null);
  const [log, setLog] = useState({ status: "contacted", summary: "", notes: "" });
  const [proposalFor, setProposalFor] = useState(null);
  const [proposalLang, setProposalLang] = useState("en");
  const [generatingProposal, setGeneratingProposal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit, min_score: minScore };
      const { data } = await api.get("/calls/queue", { params });
      setQueue(data.queue);
      setSummary(data.summary);
    } catch {
      toast.error("Failed to load call queue");
    } finally {
      setLoading(false);
    }
  }, [limit, minScore]);

  useEffect(() => { load(); }, [load]);

  const genScript = async (lead) => {
    setGeneratingFor(lead.lead_id);
    try {
      const { data } = await api.get(`/leads/${lead.lead_id}/call-script`);
      setQueue((prev) => prev.map((q) => q.lead_id === lead.lead_id ? { ...q, script: data.script } : q));
      setScriptFor({ ...lead, script: data.script });
      if (data.ai_error) toast.error("Used fallback script (no LLM key set)");
    } catch (err) {
      toast.error(fmtErr(err, "Script generation failed"));
    } finally {
      setGeneratingFor(null);
    }
  };

  const openScript = (lead) => {
    if (lead.script) setScriptFor(lead);
    else genScript(lead);
  };

  const openProposal = async (lead) => {
    if (lead.proposal_en && lead.proposal_hi) {
      setProposalFor(lead);
      setProposalLang("en");
      return;
    }
    setGeneratingProposal(true);
    try {
      const { data } = await api.get(`/leads/${lead.lead_id}/proposal`);
      setQueue((prev) => prev.map((q) => q.lead_id === lead.lead_id ? { ...q, proposal_en: data.proposal_en, proposal_hi: data.proposal_hi } : q));
      setProposalFor({ ...lead, proposal_en: data.proposal_en, proposal_hi: data.proposal_hi });
      setProposalLang("en");
      if (data.ai_error) toast.error("Used fallback proposal (no LLM key set)");
    } catch (err) {
      toast.error(fmtErr(err, "Proposal generation failed"));
    } finally {
      setGeneratingProposal(false);
    }
  };

  const copyProposal = () => {
    if (!proposalFor) return;
    const text = proposalLang === "hi" ? proposalFor.proposal_hi : proposalFor.proposal_en;
    navigator.clipboard.writeText(text).then(() => toast.success("Proposal copied")).catch(() => toast.error("Copy failed"));
  };

  const saveLog = async () => {
    if (!logFor) return;
    try {
      await api.post(`/leads/${logFor.lead_id}/contacts`, {
        channel: "manual_call",
        direction: "outbound",
        status: log.status,
        summary: log.summary || null,
        notes: log.notes || null,
      });
      toast.success("Call logged");
      setLogFor(null);
      setLog({ status: "contacted", summary: "", notes: "" });
      load();
    } catch (err) {
      toast.error(fmtErr(err, "Log failed"));
    }
  };

  const dial = (lead) => {
    const tel = (lead.phone || "").replace(/[^+\d]/g, "");
    if (!tel) return;
    window.open(`tel:${tel}`, "_self");
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Cold Call</div>
          <h1 className="font-heading text-4xl font-black tracking-tighter mt-1">Call Now <span className="text-muted-foreground text-2xl font-mono">({summary.total_with_phone})</span></h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-lg">Manually dial from your device (free). Generate an AI talk-track, then log the outcome.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={load} data-testid="refresh-queue" className="rounded-none bg-black text-white border border-white/20 hover:bg-black/90 uppercase tracking-widest text-xs font-bold btn-sharp">
            <ArrowClockwise size={16} className="mr-2" />Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="border border-border bg-[#121212] p-4" data-testid="stat-total">
          <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Callable</div>
          <div className="font-heading text-3xl font-black mt-1">{summary.total_with_phone}</div>
        </div>
        <div className="border border-border bg-[#121212] p-4" data-testid="stat-hot">
          <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Hot (70+)</div>
          <div className="font-heading text-3xl font-black mt-1 text-[#FF3B30]">{summary.hot}</div>
        </div>
        <div className="border border-border bg-[#121212] p-4" data-testid="stat-warm">
          <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Warm (40–69)</div>
          <div className="font-heading text-3xl font-black mt-1 text-[#FFCC00]">{summary.warm}</div>
        </div>
      </div>

      <div className="border border-border bg-[#121212] p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Show</label>
          <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
            <SelectTrigger data-testid="queue-limit" className="rounded-none bg-[#0A0A0A] border-border mt-1 h-9 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none bg-[#0A0A0A] border-border">
              {[10, 25, 50, 100, 200].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Minimum score</label>
          <Select value={String(minScore)} onValueChange={(v) => setMinScore(Number(v))}>
            <SelectTrigger data-testid="queue-min-score" className="rounded-none bg-[#0A0A0A] border-border mt-1 h-9 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none bg-[#0A0A0A] border-border">
              {[0, 25, 40, 50, 70].map((n) => <SelectItem key={n} value={String(n)}>{n === 0 ? "Any (0+)" : `${n}+`}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border border-border bg-[#121212] overflow-x-auto">
        <table className="w-full text-sm" data-testid="call-queue-table">
          <thead>
            <tr className="text-left text-[10px] tracking-[0.2em] uppercase text-muted-foreground border-b border-border">
              <th className="p-3">#</th>
              <th className="p-3">Business</th>
              <th className="p-3">Score</th>
              <th className="p-3">Why</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Status</th>
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading...</td></tr>
            ) : queue.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No callable leads yet. Add leads with phone numbers to build your queue.</td></tr>
            ) : queue.map((lead, idx) => (
              <tr key={lead.lead_id} className="border-b border-border hover:bg-[#0A0A0A] animate-in-up" style={{ animationDelay: `${idx * 20}ms` }} data-testid={`queue-row-${lead.lead_id}`}>
                <td className="p-3 font-mono text-xs text-muted-foreground">{idx + 1}</td>
                <td className="p-3">
                  <div className="font-medium">{lead.name}</div>
                  <div className="text-xs text-muted-foreground">{lead.category} · {lead.location || "—"}</div>
                </td>
                <td className="p-3">
                  <span className={`font-mono text-xs border px-2 py-0.5 ${scorePill(lead.score)}`}>{lead.score}</span>
                </td>
                <td className="p-3 max-w-[240px]">
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-1">
                    {(lead.reasons || []).map((r, i) => <span key={i} className="border border-border px-1.5 py-0.5 text-[10px]">{r}</span>)}
                  </div>
                </td>
                <td className="p-3 font-mono text-xs">
                  {lead.phone ? (
                    <span className="flex items-center gap-1.5"><span className="text-[#34C759]">☎</span>{lead.phone}</span>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="p-3">
                  <span className={`text-[10px] uppercase tracking-widest border px-2 py-0.5 ${scorePill(lead.score)}`}>{lead.status}</span>
                </td>
                <td className="p-3 whitespace-nowrap">
                  {lead.phone && waLink(lead.phone) && (
                    <a
                      href={waLink(lead.phone, `Hi ${lead.name}, this is about your new website.`)}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 border border-[#25D366] text-[#25D366] hover:bg-[#25D366]/10 mr-1 inline-block"
                      data-testid={`wa-${lead.lead_id}`}
                      title="Open WhatsApp chat with this client"
                    >
                      <WhatsappLogo size={14} />
                    </a>
                  )}
                  <button onClick={() => openProposal(lead)} disabled={generatingProposal} className="p-1.5 border border-[#25D366]/70 text-[#25D366] hover:bg-[#25D366]/10 mr-1 disabled:opacity-50" data-testid={`proposal-${lead.lead_id}`} title={lead.has_proposal ? "View bilingual proposal" : "Generate bilingual proposal"}>
                    {generatingProposal ? <GearSix size={14} className="animate-spin" /> : <FileText size={14} />}
                  </button>
                  <button onClick={() => dial(lead)} className="p-1.5 border border-[#34C759] text-[#34C759] hover:bg-[#34C759]/10 mr-1" title="Click to dial from your device ($0)">
                    <PhoneCall size={14} />
                  </button>
                  <button onClick={() => openScript(lead)} disabled={generatingFor === lead.lead_id} className="p-1.5 border border-primary text-primary hover:bg-primary/10 mr-1 disabled:opacity-50" data-testid={`script-${lead.lead_id}`} title={lead.script ? "View AI call script" : "Generate AI call script"}>
                    {generatingFor === lead.lead_id ? <GearSix size={14} className="animate-spin" /> : <MagicWand size={14} />}
                  </button>
                  <button onClick={() => { setLogFor(lead); setLog({ status: "contacted", summary: "", notes: "" }); }} className="p-1.5 border border-border hover:bg-[#0A0A0A]" data-testid={`log-${lead.lead_id}`} title="Log call outcome">
                    <PaperPlaneTilt size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!scriptFor} onOpenChange={(o) => !o && setScriptFor(null)}>
        <DialogContent className="rounded-none bg-[#0A0A0A] border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight">Call Script — {scriptFor?.name}</DialogTitle>
          </DialogHeader>
          {scriptFor && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                <span>Score {scriptFor.score}</span>
                {scriptFor.phone && <span>☎ {scriptFor.phone}</span>}
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm border border-border bg-[#121212] p-4">{scriptFor.script}</pre>
              <div className="flex justify-end gap-2">
                <Button onClick={() => { setScriptFor(null); genScript({ ...scriptFor }); }} className="rounded-none bg-black text-white border border-white/20 hover:bg-black/90 uppercase tracking-widest text-xs font-bold" disabled={generatingFor === scriptFor.lead_id}>
                  <ArrowClockwise size={14} className="mr-2" />Regenerate
                </Button>
                <Button onClick={() => setScriptFor(null)} className="rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-xs font-bold">Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!logFor} onOpenChange={(o) => !o && setLogFor(null)}>
        <DialogContent className="rounded-none bg-[#0A0A0A] border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight">Log Call — {logFor?.name}</DialogTitle>
          </DialogHeader>
          {logFor && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">☎ {logFor.phone}</div>
              <div>
                <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Outcome</label>
                <Select value={log.status} onValueChange={(v) => setLog((p) => ({ ...p, status: v }))}>
                  <SelectTrigger data-testid="call-outcome" className="rounded-none bg-[#121212] border-border mt-1 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none bg-[#0A0A0A] border-border">
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Summary</label>
                <Input value={log.summary} onChange={(e) => setLog((p) => ({ ...p, summary: e.target.value }))} placeholder="e.g. Owner answered, interested in a website" className="rounded-none bg-[#121212] border-border mt-1" />
              </div>
              <div>
                <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Notes</label>
                <Textarea value={log.notes} onChange={(e) => setLog((p) => ({ ...p, notes: e.target.value }))} rows={4} placeholder="Call details, next steps..." className="rounded-none bg-[#121212] border-border mt-1" />
              </div>
              <div className="flex justify-end gap-2">
                <Button onClick={() => setLogFor(null)} className="rounded-none border border-border bg-[#121212] hover:bg-[#1A1A1A] uppercase tracking-widest text-xs font-bold">Cancel</Button>
                <Button onClick={saveLog} data-testid="save-call-log" className="rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-xs font-bold">Save Log</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!proposalFor} onOpenChange={(o) => !o && setProposalFor(null)}>
        <DialogContent className="rounded-none bg-[#0A0A0A] border-border max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight">Proposal — {proposalFor?.name}</DialogTitle>
          </DialogHeader>
          {proposalFor && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => setProposalLang("en")} data-testid="proposal-lang-en" className={`text-[10px] uppercase tracking-widest border px-3 py-1 ${proposalLang === "en" ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-white"}`}>English</button>
                <button onClick={() => setProposalLang("hi")} data-testid="proposal-lang-hi" className={`text-[10px] uppercase tracking-widest border px-3 py-1 ${proposalLang === "hi" ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-white"}`}>हिन्दी</button>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground ml-auto">{proposalFor.phone ? `☎ ${proposalFor.phone}` : ""}</span>
              </div>
              <div className="border border-border bg-[#121212] p-4 max-h-[420px] overflow-y-auto">
                <pre className="whitespace-pre-wrap font-sans text-sm">{proposalLang === "hi" ? proposalFor.proposal_hi : proposalFor.proposal_en}</pre>
              </div>
              <div className="flex justify-end gap-2 flex-wrap">
                <button onClick={copyProposal} className="rounded-none border border-border bg-[#121212] hover:bg-[#1A1A1A] uppercase tracking-widest text-xs font-bold px-4 py-2 flex items-center gap-2" data-testid="copy-proposal">
                  <Copy size={14} />Copy
                </button>
                {proposalFor.phone && waLink(proposalFor.phone) && (
                  <a
                    href={waLink(proposalFor.phone, proposalLang === "hi" ? proposalFor.proposal_hi : proposalFor.proposal_en)}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="send-proposal-wa"
                    className="rounded-none bg-[#25D366] text-black hover:bg-[#25D366]/90 uppercase tracking-widest text-xs font-bold px-4 py-2 flex items-center gap-2"
                  >
                    <WhatsappLogo size={14} />Send via WhatsApp
                  </a>
                )}
                <Button onClick={() => setProposalFor(null)} className="rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-xs font-bold">Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function fmtErr(err, fallback) {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  return fallback;
}