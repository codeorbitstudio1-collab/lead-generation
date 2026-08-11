import React, { useCallback, useEffect, useState } from "react";
import { api, API_URL } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DownloadSimple, MagnifyingGlass, Trash, PencilSimple, EnvelopeSimple } from "@phosphor-icons/react";
import { OutreachComposer } from "@/pages/OutreachPage";

const STATUSES = ["new", "contacted", "interested", "converted", "onboarding", "active", "closed", "archived", "rejected"];
const STATUS_STYLES = {
  new: "bg-[#71717A]/20 text-[#a1a1aa] border-[#71717A]",
  contacted: "bg-[#FFCC00]/20 text-[#FFCC00] border-[#FFCC00]",
  interested: "bg-primary/20 text-primary border-primary",
  converted: "bg-[#34C759]/20 text-[#34C759] border-[#34C759]",
  onboarding: "bg-[#007AFF]/20 text-[#007AFF] border-[#007AFF]",
  active: "bg-[#34C759]/20 text-[#34C759] border-[#34C759]",
  closed: "bg-[#8b5cf6]/20 text-[#8b5cf6] border-[#8b5cf6]",
  archived: "bg-[#6b7280]/20 text-[#6b7280] border-[#6b7280]",
  rejected: "bg-[#FF3B30]/20 text-[#FF3B30] border-[#FF3B30]",
};
const CATEGORY_OPTIONS = ["restaurant", "cafe", "bar", "bakery", "spa", "beauty_salon", "hair_care", "gym", "lodging", "hotel", "car_rental", "car_repair", "moving_company", "plumber", "electrician", "dentist", "doctor", "lawyer", "real_estate_agency", "clothing_store", "shoe_store", "jewelry_store", "florist", "pet_store", "pharmacy", "supermarket", "school", "tourist_attraction", "travel_agency", "web_design", "web_development", "digital_marketing", "seo_agency", "social_media_marketing", "software_development", "it_services", "ecommerce", "app_development", "graphic_design", "content_marketing", "video_production", "photography_studio", "startup", "coworking_space", "online_store", "cloud_services", "data_analytics", "devops_consulting", "freelance_platform", "consulting_firm", "training_institute"];

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [websiteFilter, setWebsiteFilter] = useState("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [editEmail, setEditEmail] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [composerLead, setComposerLead] = useState(null);
  const [discoveringEmailFor, setDiscoveringEmailFor] = useState(null);
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [newLead, setNewLead] = useState({
    name: "",
    address: "",
    phone: "",
    website: "",
    email: "",
    rating: "",
    user_ratings_total: "",
    has_website: false,
    category_searched: "restaurant",
    location_searched: "",
    source: "manual",
    notes: "",
  });
  const manualHotLead = !newLead.has_website && !(newLead.website || "").trim();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (status !== "all") params.status = status;
      if (websiteFilter === "no") params.has_website = false;
      if (websiteFilter === "yes") params.has_website = true;
      if (q) params.q = q;
      const { data } = await api.get("/leads", { params });
      setLeads(data.leads);
      setSelected(new Set());
    } catch {
      toast.error("Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [status, websiteFilter, q]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id, newStatus) => {
    try {
      await api.patch(`/leads/${id}`, { status: newStatus });
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l)));
      toast.success(`Marked as ${newStatus}`);
    } catch { toast.error("Update failed"); }
  };

  const saveNotes = async (id, notes) => {
    try {
      await api.patch(`/leads/${id}`, { notes });
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, notes } : l)));
      toast.success("Notes saved");
      setEditing(null);
    } catch { toast.error("Save failed"); }
  };

  const openEdit = (lead) => {
    setEditing(lead);
    setEditEmail(lead.discovered_email || lead.email || "");
  };

  const saveEmail = async () => {
    if (!editing) return;
    const email = editEmail.trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return toast.error("Enter a valid email address");
    try {
      const { data } = await api.patch(`/leads/${editing.id}`, { email: email || null });
      setLeads((prev) => prev.map((l) => (l.id === editing.id ? { ...l, ...data } : l)));
      toast.success("Email saved");
      setEditing(null);
    } catch (err) {
      toast.error(formatApiError(err, "Save failed"));
    }
  };

  const openInlineEmail = (lead) => {
    setEditing(lead);
    setEditEmail(lead.discovered_email || lead.email || "");
  };

  const del = async (id) => {
    if (!window.confirm("Delete this lead?")) return;
    try {
      await api.delete(`/leads/${id}`);
      setLeads((prev) => prev.filter((l) => l.id !== id));
      toast.success("Deleted");
    } catch { toast.error("Delete failed"); }
  };

  const discoverEmail = async (lead) => {
    setDiscoveringEmailFor(lead.id);
    try {
      const { data } = await api.post(`/leads/${lead.id}/discover-email/auto`);
      setLeads((prev) => prev.map((l) => l.id === lead.id ? { ...l, discovered_email: data.best || l.discovered_email, discovered_emails: data.emails || l.discovered_emails } : l));
      toast.success(data.best ? `Found ${data.best}` : "No emails found");
    } catch (err) {
      toast.error(formatApiError(err, "Email discovery failed"));
    } finally {
      setDiscoveringEmailFor(null);
    }
  };

  const createManualLead = async () => {
    if (!newLead.name.trim()) return toast.error("Lead name is required");
    try {
      const payload = {
        ...newLead,
        rating: newLead.rating === "" ? null : Number(newLead.rating),
        user_ratings_total: newLead.user_ratings_total === "" ? null : Number(newLead.user_ratings_total),
      };
      const { data } = await api.post("/leads", payload);
      setLeads((prev) => [data, ...prev]);
      setNewLead({ name: "", address: "", phone: "", website: "", email: "", rating: "", user_ratings_total: "", has_website: false, category_searched: "restaurant", location_searched: "", source: "manual", notes: "" });
      setNewLeadOpen(false);
      toast.success("Lead added");
    } catch (err) {
      toast.error(formatApiError(err, "Failed to add lead"));
    }
  };

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === leads.length) setSelected(new Set());
    else setSelected(new Set(leads.map((l) => l.id)));
  };

  const bulkStatus = async (newStatus) => {
    if (selected.size === 0) return toast.error("Select leads first");
    try {
      const { data } = await api.post("/leads/bulk-update", { lead_ids: Array.from(selected), status: newStatus });
      toast.success(`${data.modified} leads → ${newStatus}`);
      load();
    } catch { toast.error("Bulk update failed"); }
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return toast.error("Select leads first");
    if (!window.confirm(`Delete ${selected.size} leads?`)) return;
    try {
      const { data } = await api.post("/leads/bulk-delete", { lead_ids: Array.from(selected) });
      toast.success(`${data.deleted} leads deleted`);
      load();
    } catch { toast.error("Bulk delete failed"); }
  };

  const exportCsv = () => {
    const token = localStorage.getItem("lg_token");
    fetch(`${API_URL}/leads/export`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "leads.csv";
        a.click();
      })
      .catch(() => toast.error("Export failed"));
  };

  const allChecked = leads.length > 0 && selected.size === leads.length;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Pipeline</div>
          <h1 className="font-heading text-4xl font-black tracking-tighter mt-1">Leads <span className="text-muted-foreground text-2xl font-mono">({leads.length})</span></h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setNewLeadOpen(true)} data-testid="new-lead-btn" className="rounded-none bg-black text-white border border-white/20 hover:bg-black/90 uppercase tracking-widest text-xs font-bold btn-sharp">
            New Lead
          </Button>
          <Button onClick={exportCsv} data-testid="export-csv" className="rounded-none bg-white text-black hover:bg-white/90 uppercase tracking-widest text-xs font-bold btn-sharp">
            <DownloadSimple size={16} className="mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="border border-border bg-[#121212] p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Search</label>
          <div className="relative mt-1">
            <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              data-testid="leads-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="Name or address"
              className="rounded-none bg-[#0A0A0A] border-border pl-9 h-9"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Status</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger data-testid="filter-status" className="rounded-none bg-[#0A0A0A] border-border mt-1 h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none bg-[#0A0A0A] border-border">
              <SelectItem value="all">All</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Website</label>
          <Select value={websiteFilter} onValueChange={setWebsiteFilter}>
            <SelectTrigger data-testid="filter-website" className="rounded-none bg-[#0A0A0A] border-border mt-1 h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none bg-[#0A0A0A] border-border">
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="no">No Website (Hot)</SelectItem>
              <SelectItem value="yes">Has Website</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="border border-primary bg-primary/10 p-3 flex items-center justify-between flex-wrap gap-2" data-testid="bulk-toolbar">
          <div className="text-sm">
            <span className="font-mono text-primary">{selected.size}</span> selected
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select onValueChange={bulkStatus}>
              <SelectTrigger data-testid="bulk-status" className="rounded-none bg-[#0A0A0A] border-border h-9 w-44">
                <SelectValue placeholder="Change status →" />
              </SelectTrigger>
              <SelectContent className="rounded-none bg-[#0A0A0A] border-border">
                {STATUSES.map((s) => <SelectItem key={s} value={s}>Mark as {s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={bulkDelete} data-testid="bulk-delete" className="rounded-none bg-[#FF3B30] hover:bg-[#FF3B30]/90 uppercase tracking-widest text-xs font-bold h-9">
              <Trash size={14} className="mr-1" />Delete
            </Button>
            <Button onClick={() => setSelected(new Set())} data-testid="bulk-clear" className="rounded-none bg-transparent border border-border hover:bg-[#0A0A0A] uppercase tracking-widest text-xs h-9">Clear</Button>
          </div>
        </div>
      )}

      <div className="border border-border bg-[#121212] overflow-x-auto">
        <table className="w-full text-sm" data-testid="leads-table">
          <thead>
            <tr className="text-left text-[10px] tracking-[0.2em] uppercase text-muted-foreground border-b border-border">
              <th className="p-3 w-8">
                <Checkbox checked={allChecked} onCheckedChange={toggleAll} data-testid="check-all" className="rounded-none" />
              </th>
              <th className="p-3">Business</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Email</th>
              <th className="p-3">Web</th>
              <th className="p-3">Rating</th>
              <th className="p-3">Status</th>
              <th className="p-3">Notes</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Loading...</td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No leads yet. Run a search to get started.</td></tr>
            ) : leads.map((l, idx) => (
              <tr key={l.id} className="border-b border-border hover:bg-[#0A0A0A] animate-in-up" style={{ animationDelay: `${idx * 20}ms` }} data-testid={`lead-row-${l.id}`}>
                <td className="p-3">
                  <Checkbox checked={selected.has(l.id)} onCheckedChange={() => toggle(l.id)} data-testid={`check-${l.id}`} className="rounded-none" />
                </td>
                <td className="p-3">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-muted-foreground">{l.address}</div>
                  <div className="text-[10px] font-mono text-muted-foreground mt-1">{l.category_searched} · {l.location_searched}</div>
                </td>
                <td className="p-3 font-mono text-xs">
                  {l.phone ? (
                    <a
                      href={`tel:${l.phone.replace(/[^+\d]/g, "")}`}
                      onClick={() => updateStatus(l.id, "contacted")}
                      className="text-white hover:text-[#34C759] hover:underline flex items-center gap-1.5"
                      title="Click to dial directly from your mobile / device SIM ($0 cost)"
                    >
                      <span className="text-[#34C759]">☎</span><span>{l.phone}</span>
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="p-3 font-mono text-xs">
                  {l.discovered_email || l.email ? (
                    <div className="space-y-1">
                      <a href={`mailto:${l.discovered_email || l.email}`} className="text-primary hover:underline break-all">
                        {l.discovered_email || l.email}
                      </a>
                      {Array.isArray(l.discovered_emails) && l.discovered_emails.length > 1 && (
                        <div className="text-[10px] text-muted-foreground break-all">{l.discovered_emails.join(", ")}</div>
                      )}
                      <button onClick={() => openInlineEmail(l)} className="text-[10px] uppercase tracking-widest border border-border px-2 py-0.5 hover:bg-[#0A0A0A] mt-1">
                        Edit
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Email not available</span>
                      {l.has_website && (
                        <button onClick={() => discoverEmail(l)} disabled={discoveringEmailFor === l.id} className="text-[10px] uppercase tracking-widest border border-border px-2 py-1 hover:bg-[#0A0A0A] disabled:opacity-50">
                          {discoveringEmailFor === l.id ? "Finding..." : "Find"}
                        </button>
                      )}
                    </div>
                  )}
                </td>
                <td className="p-3">
                  {l.has_website ? (
                    <a href={l.website} target="_blank" rel="noreferrer" className="text-[10px] uppercase tracking-widest text-[#34C759] border border-[#34C759] px-2 py-0.5 hover:bg-[#34C759]/10">Web</a>
                  ) : (
                    <span className="text-[10px] uppercase tracking-widest text-white bg-[#FF3B30] px-2 py-0.5">HOT</span>
                  )}
                </td>
                <td className="p-3 font-mono text-xs">
                  {l.rating ? <span className="text-[#FFCC00]">★ {l.rating}</span> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="p-3">
                  <Select value={l.status} onValueChange={(v) => updateStatus(l.id, v)}>
                    <SelectTrigger className={`rounded-none h-8 w-32 border ${STATUS_STYLES[l.status] || ""}`} data-testid={`status-select-${l.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none bg-[#0A0A0A] border-border">
                      {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-3 max-w-[200px]">
                  <div className="text-xs text-muted-foreground truncate">{l.notes || "—"}</div>
                </td>
                <td className="p-3 whitespace-nowrap">
                  {(l.discovered_email || l.email) ? (
                    <button onClick={() => setComposerLead(l)} className="p-1.5 border border-primary text-primary hover:bg-primary/10 mr-1" data-testid={`email-lead-${l.id}`} title="Send AI email">
                      <EnvelopeSimple size={14} />
                    </button>
                  ) : (
                    <button disabled className="p-1.5 border border-border text-muted-foreground mr-1 opacity-50 cursor-not-allowed" title="Email not available">
                      <EnvelopeSimple size={14} />
                    </button>
                  )}
                  <button onClick={() => openEdit(l)} className="p-1.5 border border-border hover:bg-[#0A0A0A]" data-testid={`edit-notes-${l.id}`}>
                    <PencilSimple size={14} />
                  </button>
                  <button onClick={() => del(l.id)} className="p-1.5 border border-border hover:bg-[#FF3B30]/20 ml-1" data-testid={`delete-lead-${l.id}`}>
                    <Trash size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="rounded-none bg-[#0A0A0A] border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight">{editing?.name}</DialogTitle>
          </DialogHeader>
          {editing && <NotesForm lead={editing} onSave={saveNotes} />}
          {editing && (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Email</div>
              <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="owner@business.com" className="rounded-none bg-[#121212] border-border" />
              <div className="flex justify-end gap-2">
                <Button onClick={() => setEditing(null)} className="rounded-none border border-border bg-[#121212] hover:bg-[#1A1A1A] uppercase tracking-widest text-xs font-bold">Cancel</Button>
                <Button onClick={saveEmail} className="rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-xs font-bold">Save Email</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={newLeadOpen} onOpenChange={setNewLeadOpen}>
        <DialogContent className="rounded-none bg-[#0A0A0A] border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight">Create Manual Lead</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="md:col-span-2 border border-border p-3 bg-[#121212] flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Lead Preview</div>
                <div className="text-sm text-white mt-1">{newLead.name || "Business name"}</div>
                <div className="text-[10px] text-muted-foreground mt-1">{newLead.category_searched} · {newLead.location_searched || "location"} · {newLead.source || "manual"}</div>
              </div>
              <span className={`text-[10px] uppercase tracking-widest px-2 py-1 ${manualHotLead ? "bg-[#FF3B30] text-white" : "bg-[#34C759] text-black"}`}>
                {manualHotLead ? "HOT" : "WEB"}
              </span>
            </div>
            <Input placeholder="Business name" value={newLead.name} onChange={(e) => setNewLead((p) => ({ ...p, name: e.target.value }))} className="rounded-none bg-[#121212] border-border md:col-span-2" />
            <Input placeholder="Address" value={newLead.address} onChange={(e) => setNewLead((p) => ({ ...p, address: e.target.value }))} className="rounded-none bg-[#121212] border-border md:col-span-2" />
            <Input placeholder="Phone" value={newLead.phone} onChange={(e) => setNewLead((p) => ({ ...p, phone: e.target.value }))} className="rounded-none bg-[#121212] border-border" />
            <Input placeholder="Website" value={newLead.website} onChange={(e) => setNewLead((p) => ({ ...p, website: e.target.value }))} className="rounded-none bg-[#121212] border-border" />
            <Input placeholder="Email" value={newLead.email} onChange={(e) => setNewLead((p) => ({ ...p, email: e.target.value }))} className="rounded-none bg-[#121212] border-border" />
            <Input placeholder="Rating" value={newLead.rating} onChange={(e) => setNewLead((p) => ({ ...p, rating: e.target.value }))} className="rounded-none bg-[#121212] border-border" />
            <Input placeholder="Reviews count" value={newLead.user_ratings_total} onChange={(e) => setNewLead((p) => ({ ...p, user_ratings_total: e.target.value }))} className="rounded-none bg-[#121212] border-border" />
            <div className="md:col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={newLead.has_website} onChange={(e) => setNewLead((p) => ({ ...p, has_website: e.target.checked }))} />
              Has website
            </div>
            <div>
              <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Category</label>
              <Select value={newLead.category_searched} onValueChange={(value) => setNewLead((p) => ({ ...p, category_searched: value }))}>
                <SelectTrigger className="rounded-none bg-[#121212] border-border mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none bg-[#0A0A0A] border-border max-h-80">
                  {CATEGORY_OPTIONS.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Input placeholder="Search location" value={newLead.location_searched} onChange={(e) => setNewLead((p) => ({ ...p, location_searched: e.target.value }))} className="rounded-none bg-[#121212] border-border" />
            <Input placeholder="Lead source" value={newLead.source} onChange={(e) => setNewLead((p) => ({ ...p, source: e.target.value }))} className="rounded-none bg-[#121212] border-border" />
            <div className="md:col-span-2">
              <Textarea placeholder="Notes" value={newLead.notes} onChange={(e) => setNewLead((p) => ({ ...p, notes: e.target.value }))} rows={4} className="rounded-none bg-[#121212] border-border" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button onClick={() => setNewLeadOpen(false)} className="rounded-none border border-border bg-[#121212] hover:bg-[#1A1A1A] uppercase tracking-widest text-xs font-bold">Cancel</Button>
            <Button onClick={createManualLead} className="rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-xs font-bold">Save Lead</Button>
          </div>
        </DialogContent>
      </Dialog>

      <OutreachComposer
        lead={composerLead}
        open={!!composerLead}
        onClose={() => setComposerLead(null)}
        onSent={load}
      />
    </div>
  );
}

function NotesForm({ lead, onSave }) {
  const [notes, setNotes] = useState(lead.notes || "");
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">{lead.address}</div>
      <Textarea
        data-testid="notes-textarea"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={6}
        placeholder="Contact log, call notes, next steps..."
        className="rounded-none bg-[#121212] border-border"
      />
      <Button onClick={() => onSave(lead.id, notes)} data-testid="notes-save" className="rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-xs font-bold w-full">
        Save Notes
      </Button>
    </div>
  );
}

function formatApiError(err, fallback) {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || JSON.stringify(item)).join(", ");
  }
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return fallback;
}
