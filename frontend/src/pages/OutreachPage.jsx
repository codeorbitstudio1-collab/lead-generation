import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EnvelopeSimple, PaperPlaneTilt, ArrowClockwise, ChatCircleDots, CheckCircle, WarningCircle, PhoneCall } from "@phosphor-icons/react";

const EMAIL_STATUS_STYLES = {
  sent: "bg-primary/20 text-primary border-primary",
  replied: "bg-[#34C759]/20 text-[#34C759] border-[#34C759]",
  failed: "bg-[#FF3B30]/20 text-[#FF3B30] border-[#FF3B30]",
};

const CONTACT_CHANNELS = [
  { value: "call", label: "Call", icon: "☎" },
  { value: "email", label: "Email", icon: "✉" },
  { value: "sms", label: "SMS", icon: "✉" },
];
const CONTACT_STATUSES = [
  { value: "left_message", label: "Left message" },
  { value: "no_answer", label: "No answer" },
  { value: "interested", label: "Interested" },
  { value: "not_interested", label: "Not interested" },
  { value: "follow_up", label: "Follow-up" },
  { value: "replied", label: "Replied" },
  { value: "call_back", label: "Call back later" },
];
const CONTACT_CHANNEL_STYLES = {
  call: "bg-[#34C759]/20 text-[#34C759] border-[#34C759]",
  email: "bg-primary/20 text-primary border-primary",
  sms: "bg-[#007AFF]/20 text-[#007AFF] border-[#007AFF]",
};
const CONTACT_STATUS_STYLES = {
  sent: "text-[#a1a1aa]",
  left_message: "text-[#a1a1aa]",
  no_answer: "text-[#FF3B30]",
  interested: "text-[#34C759]",
  not_interested: "text-[#FF3B30]",
  follow_up: "text-[#FFCC00]",
  replied: "text-primary",
  call_back: "text-[#007AFF]",
};

function contactLabel(c) {
  return CONTACT_CHANNELS.find((ch) => ch.value === c.channel)?.label || c.channel;
}

function timelineFor(r) {
  const contacts = (r.contacts || []).map((c) => ({ kind: "contact", ...c, when: c.occurred_at || c.created_at }));
  const emails = (r.emails || []).map((e) => ({
    kind: "email",
    id: e.id,
    channel: "email",
    status: e.status,
    summary: e.summary || e.subject,
    notes: e.error ? `Error: ${e.error}` : "",
    when: e.created_at,
    error: e.error,
    subject: e.subject,
    body: e.body,
    reply_body: e.reply_body,
  }));
  return [...contacts, ...emails].sort((a, b) => new Date(b.when || 0) - new Date(a.when || 0));
}

export default function OutreachPage() {
  const [emails, setEmails] = useState([]);
  const [stats, setStats] = useState({ sent: 0, replied: 0, failed: 0, reply_rate: 0 });
  const [overview, setOverview] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [viewing, setViewing] = useState(null);        // single outreach email detail
  const [viewingLead, setViewingLead] = useState(null); // per-lead outreach hub
  const [logOpen, setLogOpen] = useState(false);
  const [logLead, setLogLead] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [o, e, s, l] = await Promise.all([
        api.get("/outreach/overview"),
        api.get("/outreach"),
        api.get("/outreach/stats"),
        api.get("/leads"),
      ]);
      setOverview(o.data.leads || []);
      setEmails(e.data.emails);
      setStats(s.data);
      setLeads(l.data.leads || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const pollReplies = async () => {
    setPolling(true);
    try {
      const { data } = await api.post("/outreach/poll-replies");
      toast.success(`${data.new_replies} new replies`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Poll failed");
    } finally { setPolling(false); }
  };

  const openLog = (leadRecord) => {
    setLogLead(leadRecord || null);
    setLogOpen(true);
  };

  const afterLog = async () => {
    setLogOpen(false);
    setLogLead(null);
    await load();
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Outreach</div>
          <h1 className="font-heading text-4xl font-black tracking-tighter mt-1">Outreach Hub</h1>
          <div className="text-xs text-muted-foreground mt-1">Log every call / SMS / email against a lead and review the overall response.</div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => openLog(null)} data-testid="log-contact" className="rounded-none bg-[#34C759] hover:bg-[#34C759]/90 uppercase tracking-widest text-xs font-bold btn-sharp">
            <PhoneCall size={16} className="mr-2" />
            Log Call / Contact
          </Button>
          <Button onClick={pollReplies} disabled={polling} data-testid="poll-replies" className="rounded-none bg-white text-black hover:bg-white/90 uppercase tracking-widest text-xs font-bold btn-sharp">
            <ArrowClockwise size={16} className="mr-2" />
            {polling ? "Polling..." : "Check Replies"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Kpi testId="stat-sent" label="Sent" value={stats.sent} icon={PaperPlaneTilt} />
        <Kpi testId="stat-replied" label="Replied" value={stats.replied} icon={ChatCircleDots} accent="text-[#34C759]" />
        <Kpi testId="stat-rate" label="Reply Rate" value={`${stats.reply_rate}%`} icon={CheckCircle} accent="text-primary" />
        <Kpi testId="stat-failed" label="Failed" value={stats.failed} icon={WarningCircle} accent="text-[#FF3B30]" />
      </div>

      {/* ─── Per-lead outreach history ─── */}
      <div className="border border-border bg-[#121212] overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Lead Outreach · Calls · SMS · Emails</div>
          <div className="text-xs text-muted-foreground">{overview.length} leads</div>
        </div>
        <table className="w-full text-sm" data-testid="outreach-leads-table">
          <thead>
            <tr className="text-left text-[10px] tracking-[0.2em] uppercase text-muted-foreground border-b border-border">
              <th className="p-3">Business</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Last Contact</th>
              <th className="p-3">Overall Summary</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading...</td></tr>
            ) : overview.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">
                <PhoneCall size={32} className="mx-auto mb-2 opacity-40" />
                No contact activity yet. Click "Log Call / Contact" to record a call or message against a lead.
              </td></tr>
            ) : overview.map((r, idx) => {
              const lc = r.last_contact || {};
              return (
                <tr key={r.lead_id} className="border-b border-border hover:bg-[#0A0A0A] animate-in-up" style={{ animationDelay: `${idx * 20}ms` }} data-testid={`outreach-lead-${r.lead_id}`}>
                  <td className="p-3">
                    <div className="font-medium">{r.lead_name}</div>
                    <div className="text-xs text-muted-foreground">{r.lead_email || "—"}</div>
                  </td>
                  <td className="p-3 font-mono text-xs">{r.lead_phone || "—"}</td>
                  <td className="p-3 max-w-[200px]">
                    {lc && Object.keys(lc).length > 0 ? (
                      <div className="text-xs space-y-0.5">
                        <div className="text-[10px] uppercase tracking-widest">
                          <span className={`border px-1.5 py-0.5 ${CONTACT_CHANNEL_STYLES[lc.channel] || "text-muted-foreground"}`}>
                            {CONTACT_CHANNELS.find((ch) => ch.value === lc.channel)?.icon || "•"} {contactLabel(lc)}
                          </span>
                          {lc.status && <span className={`ml-1 ${CONTACT_STATUS_STYLES[lc.status] || "text-muted-foreground"}`}>{lc.status}</span>}
                        </div>
                        <div className="text-muted-foreground truncate" title={lc.summary}>{lc.summary || "—"}</div>
                        <div className="text-[10px] font-mono text-muted-foreground/70">{lc.at ? new Date(lc.at).toLocaleString() : ""}</div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="p-3 max-w-[260px] text-xs text-muted-foreground">
                    <div className="line-clamp-2">{r.overall_summary || "—"}</div>
                  </td>
                  <td className="p-3">
                    <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 border text-[#a1a1aa] border-[#71717A]">{r.lead_status}</span>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <button onClick={() => openLog(r)} className="text-[10px] uppercase tracking-widest border border-[#34C759] text-[#34C759] px-2 py-1 hover:bg-[#34C759]/10 mr-1" data-testid={`log-${r.lead_id}`}>Log Call</button>
                    <button onClick={() => setViewingLead(r)} className="text-[10px] uppercase tracking-widest border border-border px-2 py-1 hover:bg-[#0A0A0A]" data-testid={`view-lead-${r.lead_id}`}>View History</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ─── Sent emails ─── */}
      <div className="border border-border bg-[#121212] overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Email Campaigns</div>
          <div className="text-xs text-muted-foreground">{emails.length} sent</div>
        </div>
        <table className="w-full text-sm" data-testid="outreach-table">
          <thead>
            <tr className="text-left text-[10px] tracking-[0.2em] uppercase text-muted-foreground border-b border-border">
              <th className="p-3">Business</th>
              <th className="p-3">To</th>
              <th className="p-3">Subject</th>
              <th className="p-3">Status</th>
              <th className="p-3">Summary</th>
              <th className="p-3">When</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading...</td></tr>
            ) : emails.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
                <EnvelopeSimple size={32} className="mx-auto mb-2 opacity-40" />
                No emails sent yet. Go to Leads → hot leads → click "Email" to start.
              </td></tr>
            ) : emails.map((e, idx) => (
              <tr key={e.id} className="border-b border-border hover:bg-[#0A0A0A] animate-in-up" style={{ animationDelay: `${idx * 20}ms` }} data-testid={`outreach-row-${e.id}`}>
                <td className="p-3 font-medium">{e.lead_name}</td>
                <td className="p-3 font-mono text-xs">{e.to_email}</td>
                <td className="p-3 max-w-[240px]"><div className="truncate">{e.subject}</div></td>
                <td className="p-3">
                  <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 border ${EMAIL_STATUS_STYLES[e.status] || ""}`}>
                    {e.status}
                  </span>
                </td>
                <td className="p-3 max-w-[280px] text-xs text-muted-foreground">
                  <div className="line-clamp-2">{e.summary || (e.error ? <span className="text-[#FF3B30]">{e.error}</span> : "—")}</div>
                </td>
                <td className="p-3 text-[10px] text-muted-foreground font-mono whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                <td className="p-3">
                  <button onClick={() => setViewing(e)} data-testid={`view-outreach-${e.id}`} className="text-xs uppercase tracking-widest border border-border px-2 py-1 hover:bg-[#0A0A0A]">View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Log call / contact dialog */}
      <ContactLogDialog
        open={logOpen}
        leads={leads}
        initialLead={logLead}
        onClose={() => { setLogOpen(false); setLogLead(null); }}
        onSaved={afterLog}
      />

      {/* Per-lead history dialog */}
      <Dialog open={!!viewingLead} onOpenChange={(o) => !o && setViewingLead(null)}>
        <DialogContent className="rounded-none bg-[#0A0A0A] border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight">{viewingLead?.lead_name}</DialogTitle>
          </DialogHeader>
          {viewingLead && <LeadHistory r={viewingLead} />}
        </DialogContent>
      </Dialog>

      {/* Single email detail dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="rounded-none bg-[#0A0A0A] border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight">{viewing?.subject}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 text-sm">
              <div className="text-xs text-muted-foreground">To: {viewing.to_email} · Sent: {viewing.sent_at ? new Date(viewing.sent_at).toLocaleString() : "—"}</div>
              <div>
                <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-2">Our Email</div>
                <div className="border border-border p-3 bg-[#121212] whitespace-pre-wrap font-mono text-xs">{viewing.body}</div>
              </div>
              {viewing.reply_body && (
                <div>
                  <div className="text-[10px] tracking-[0.2em] uppercase text-[#34C759] mb-2">Their Reply · {viewing.reply_at ? new Date(viewing.reply_at).toLocaleString() : ""}</div>
                  <div className="border border-[#34C759]/40 p-3 bg-[#34C759]/5 whitespace-pre-wrap font-mono text-xs">{viewing.reply_body}</div>
                </div>
              )}
              {viewing.summary && (
                <div>
                  <div className="text-[10px] tracking-[0.2em] uppercase text-primary mb-2">AI Summary</div>
                  <div className="border border-primary/40 p-3 bg-primary/5 text-sm">{viewing.summary}</div>
                </div>
              )}
              {viewing.error && (
                <div>
                  <div className="text-[10px] tracking-[0.2em] uppercase text-[#FF3B30] mb-2">Error</div>
                  <div className="text-sm text-[#FF3B30]">{viewing.error}</div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, accent, testId }) {
  return (
    <div className="border border-border p-5 bg-[#121212]" data-testid={testId}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">{label}</div>
        <Icon size={18} className="text-muted-foreground" />
      </div>
      <div className={`font-heading text-3xl font-black tracking-tighter mt-2 ${accent || ""}`}>{value}</div>
    </div>
  );
}

// ─── Log a call / SMS / email with caller notes ───
function ContactLogDialog({ open, leads, initialLead, onClose, onSaved }) {
  const [leadId, setLeadId] = useState("");
  const [channel, setChannel] = useState("call");
  const [status, setStatus] = useState("");
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setLeadId(initialLead?.lead_id || initialLead?.id || "");
      setChannel("call");
      setStatus("");
      setSummary("");
      setNotes("");
    }
  }, [open, initialLead]);

  const save = async () => {
    if (!leadId) return toast.error("Select a lead");
    if (!status) return toast.error("Select the response");
    setSaving(true);
    try {
      await api.post(`/leads/${leadId}/contacts`, {
        channel,
        status,
        summary: summary.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success(`${contactLabel({ channel })} logged`);
      onSaved && onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to log contact");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-none bg-[#0A0A0A] border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">Log Call / Contact</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Lead</label>
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger data-testid="log-lead" className="rounded-none bg-[#121212] border-border mt-1">
                <SelectValue placeholder="Pick a lead..." />
              </SelectTrigger>
              <SelectContent className="rounded-none bg-[#0A0A0A] border-border max-h-80">
                {leads.length === 0 ? <SelectItem value="__none" disabled>No leads yet</SelectItem> :
                  leads.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}{l.phone ? ` · ${l.phone}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Channel</label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger data-testid="log-channel" className="rounded-none bg-[#121212] border-border mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none bg-[#0A0A0A] border-border">
                  {CONTACT_CHANNELS.map((ch) => <SelectItem key={ch.value} value={ch.value}>{ch.icon} {ch.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Response</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger data-testid="log-status" className="rounded-none bg-[#121212] border-border mt-1">
                  <SelectValue placeholder="Response..." />
                </SelectTrigger>
                <SelectContent className="rounded-none bg-[#0A0A0A] border-border">
                  {CONTACT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Response Summary</label>
            <Input data-testid="log-summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="e.g. Owner interested, asked for a website quote" className="rounded-none bg-[#121212] border-border mt-1" />
          </div>
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Caller / Sender Notes</label>
            <Textarea data-testid="log-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="What did the caller / owner say? Next steps, objections, follow-up time..." className="rounded-none bg-[#121212] border-border mt-1" />
          </div>
          <Button onClick={save} disabled={saving || !leadId || !status} data-testid="log-save" className="rounded-none bg-[#34C759] hover:bg-[#34C759]/90 uppercase tracking-widest text-xs font-bold w-full">
            {saving ? "Saving..." : "Save Contact Log"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Full per-lead outreach history + overall summary ───
function LeadHistory({ r }) {
  const timeline = timelineFor(r);
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="border border-border p-2.5 bg-[#121212]">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Phone</div>
          <div className="font-mono mt-0.5">{r.lead_phone || "—"}</div>
        </div>
        <div className="border border-border p-2.5 bg-[#121212]">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Status</div>
          <div className="mt-0.5 capitalize">{r.lead_status}</div>
        </div>
      </div>

      <div>
        <div className="text-[10px] tracking-[0.2em] uppercase text-primary mb-2">Overall Summary</div>
        <div className="border border-primary/40 p-3 bg-primary/5 text-sm">{r.overall_summary || "No summary yet."}</div>
      </div>

      <div>
        <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-2">Timeline ({timeline.length})</div>
        {timeline.length === 0 ? (
          <div className="text-xs text-muted-foreground">No interactions logged.</div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {timeline.map((t, i) => (
              <div key={t.id || `${t.kind}-${i}`} className="border border-border p-2.5 bg-[#121212]">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest">
                  <span className={`border px-1.5 py-0.5 ${CONTACT_CHANNEL_STYLES[t.channel] || "text-muted-foreground"}`}>
                    {CONTACT_CHANNELS.find((ch) => ch.value === t.channel)?.icon || "•"} {contactLabel(t)}
                  </span>
                  {t.kind === "contact" && t.direction === "inbound" && <span className="text-muted-foreground">inbound</span>}
                  {t.status && <span className={CONTACT_STATUS_STYLES[t.status] || "text-muted-foreground"}>{t.status}</span>}
                  <span className="ml-auto text-muted-foreground normal-case">{t.when ? new Date(t.when).toLocaleString() : ""}</span>
                </div>
                {t.summary && <div className="text-xs mt-1.5 text-white/90">{t.summary}</div>}
                {t.notes && <div className="text-xs mt-0.5 text-muted-foreground whitespace-pre-wrap">{t.notes}</div>}
                {t.kind === "email" && t.error && <div className="text-xs mt-0.5 text-[#FF3B30]">{t.error}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Reusable composer dialog for lead pages
export function OutreachComposer({ lead, open, onClose, onSent }) {
  const [loading, setLoading] = useState(false);
  const [gen, setGen] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [signature, setSignature] = useState("");
  const [templates, setTemplates] = useState([]);
  const [groups, setGroups] = useState([]);
  const [mode, setMode] = useState("ai"); // ai | template | ab
  const [templateId, setTemplateId] = useState("");
  const [abGroupId, setAbGroupId] = useState("");
  const [discoveredEmails, setDiscoveredEmails] = useState([]);
  const [websiteHint, setWebsiteHint] = useState("");

  useEffect(() => {
    if (open && lead) {
      setToEmail(lead.discovered_email || "");
      setSubject("");
      setBody("");
      setMode("ai");
      setTemplateId("");
      setAbGroupId("");
      setDiscoveredEmails(lead.discovered_emails || []);
      setWebsiteHint(lead.website || "");
      // Load templates + groups
      Promise.all([api.get("/templates"), api.get("/ab-groups")]).then(([t, g]) => {
        setTemplates(t.data.templates);
        setGroups(g.data.groups);
      }).catch(() => {});
      // Auto-generate initial AI draft
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead?.id]);

  const generate = async () => {
    setGen(true);
    try {
      const { data } = await api.post(`/outreach/generate/${lead.id}`);
      setSubject(data.subject);
      setBody(data.body);
      setSignature(data.signature || "");
      if (data.ai_error) {
        toast.error(`AI email generation failed — using fallback. ${data.ai_error}`);
      }
    } catch (e) {
      toast.error("Generation failed");
    } finally { setGen(false); }
  };

  const applyTemplate = async (id) => {
    if (!id) return;
    try {
      const { data } = await api.post(`/templates/${id}/preview?lead_id=${lead.id}`);
      setSubject(data.subject);
      setBody(data.body);
      toast.success("Template applied");
    } catch { toast.error("Template preview failed"); }
  };

  const discoverEmail = async () => {
    setDiscovering(true);
    try {
      const payload = websiteHint && websiteHint !== lead.website ? { website_url: websiteHint } : {};
      const { data } = await api.post(`/leads/${lead.id}/discover-email`, payload);
      setDiscoveredEmails(data.emails || []);
      if (data.best) {
        setToEmail(data.best);
        toast.success(`Found ${data.emails.length} email${data.emails.length === 1 ? "" : "s"}`);
      } else {
        toast.warning("No emails found on that site");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Discovery failed");
    } finally { setDiscovering(false); }
  };

  const send = async () => {
    if (!toEmail) return toast.error("Enter recipient email");
    setLoading(true);
    try {
      const payload = { to_email: toEmail };
      if (mode === "ai") { payload.subject = subject; payload.body = body; }
      else if (mode === "template" && templateId) { payload.template_id = templateId; }
      else if (mode === "ab" && abGroupId) { payload.ab_group_id = abGroupId; }
      else { payload.subject = subject; payload.body = body; }
      await api.post(`/outreach/send/${lead.id}`, payload);
      toast.success("Email sent");
      onSent && onSent();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Send failed");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-none bg-[#0A0A0A] border-border max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">Compose Email · {lead?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Recipient + Discovery */}
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Website (for email discovery)</label>
            <div className="flex gap-2 mt-1">
              <Input data-testid="compose-website" value={websiteHint} onChange={(e) => setWebsiteHint(e.target.value)} placeholder="https://business.com" className="rounded-none bg-[#121212] border-border" />
              <Button onClick={discoverEmail} disabled={discovering || !websiteHint} data-testid="discover-email" className="rounded-none bg-white text-black hover:bg-white/90 uppercase tracking-widest text-[10px] font-bold whitespace-nowrap">
                {discovering ? "Scraping..." : "🔍 Find Email"}
              </Button>
            </div>
          </div>
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">To (recipient email)</label>
            <Input data-testid="compose-to" value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="owner@business.com" className="rounded-none bg-[#121212] border-border mt-1 font-mono text-sm" />
            {discoveredEmails.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-2">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground py-1">Found:</span>
                {discoveredEmails.map((e) => (
                  <button key={e} onClick={() => setToEmail(e)} className={`text-[10px] font-mono border px-2 py-1 ${toEmail === e ? "border-primary text-primary" : "border-border hover:bg-[#121212]"}`}>{e}</button>
                ))}
              </div>
            )}
          </div>

          {/* Mode selector */}
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Composition Mode</label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {[["ai", "AI Draft"], ["template", "Template"], ["ab", "A/B Group"]].map(([v, l]) => (
                <button key={v} onClick={() => setMode(v)} className={`py-2 text-[10px] uppercase tracking-widest border ${mode === v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-white"}`} data-testid={`mode-${v}`}>{l}</button>
              ))}
            </div>
          </div>

          {mode === "template" && (
            <div>
              <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Template</label>
              <Select value={templateId} onValueChange={(v) => { setTemplateId(v); applyTemplate(v); }}>
                <SelectTrigger data-testid="tpl-select" className="rounded-none bg-[#121212] border-border mt-1"><SelectValue placeholder="Pick template" /></SelectTrigger>
                <SelectContent className="rounded-none bg-[#0A0A0A] border-border">
                  {templates.length === 0 ? <SelectItem value="__none" disabled>No templates yet — create one in Templates</SelectItem> :
                    templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {mode === "ab" && (
            <div>
              <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">A/B Group (random variant on send)</label>
              <Select value={abGroupId} onValueChange={setAbGroupId}>
                <SelectTrigger data-testid="ab-select" className="rounded-none bg-[#121212] border-border mt-1"><SelectValue placeholder="Pick group" /></SelectTrigger>
                <SelectContent className="rounded-none bg-[#0A0A0A] border-border">
                  {groups.length === 0 ? <SelectItem value="__none" disabled>No groups yet</SelectItem> :
                    groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground mt-2">The system will randomly pick variant A or B on send and track stats.</div>
            </div>
          )}

          {/* Only show editable body when using AI mode */}
          {mode === "ai" && (
            <>
              <div>
                <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Subject</label>
                <Input data-testid="compose-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="rounded-none bg-[#121212] border-border mt-1" />
              </div>
              <div>
                <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Body {gen && <span className="text-primary">· generating...</span>}</label>
                <Textarea data-testid="compose-body" value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="rounded-none bg-[#121212] border-border mt-1 font-mono text-xs" />
                {signature && (
                  <pre data-testid="signature-preview" className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground border-l-2 border-border pl-3">{signature.trim()}</pre>
                )}
              </div>
              <Button onClick={generate} disabled={gen} data-testid="regen-email" className="rounded-none bg-white text-black hover:bg-white/90 uppercase tracking-widest text-xs font-bold w-full">
                {gen ? "Generating..." : "↻ Regenerate with AI"}
              </Button>
            </>
          )}
          <Button onClick={send} disabled={loading || !toEmail || (mode === "ai" && (!subject || !body)) || (mode === "template" && !templateId) || (mode === "ab" && !abGroupId)} data-testid="compose-send" className="rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-xs font-bold w-full">
            <PaperPlaneTilt size={14} className="mr-2" />
            {loading ? "Sending..." : "Send Email"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
