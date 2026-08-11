import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MagnifyingGlass, Briefcase, Trash, PencilSimple, DownloadSimple, LinkSimple, EnvelopeSimple, Phone, SquaresFour, ListDashes, DotsSixVertical } from "@phosphor-icons/react";

const STATUSES = ["new", "applied", "interviewing", "offer", "accepted", "rejected", "completed", "archived"];
const STATUS_STYLES = {
  new: "bg-[#71717A]/20 text-[#a1a1aa] border-[#71717A]",
  applied: "bg-[#007AFF]/20 text-[#007AFF] border-[#007AFF]",
  interviewing: "bg-[#FFCC00]/20 text-[#FFCC00] border-[#FFCC00]",
  offer: "bg-[#AF52DE]/20 text-[#AF52DE] border-[#AF52DE]",
  accepted: "bg-[#34C759]/20 text-[#34C759] border-[#34C759]",
  rejected: "bg-[#FF3B30]/20 text-[#FF3B30] border-[#FF3B30]",
  completed: "bg-[#34C759]/20 text-[#34C759] border-[#34C759]",
  archived: "bg-[#6b7280]/20 text-[#6b7280] border-[#6b7280]",
};
const COLUMN_ACCENT = {
  new: "border-t-[#71717A]",
  applied: "border-t-[#007AFF]",
  interviewing: "border-t-[#FFCC00]",
  offer: "border-t-[#AF52DE]",
  accepted: "border-t-[#34C759]",
  rejected: "border-t-[#FF3B30]",
  completed: "border-t-[#34C759]",
  archived: "border-t-[#6b7280]",
};
const SOURCES = [
  ["all", "All sources"],
  ["linkedin", "LinkedIn"],
  ["remoteok", "RemoteOK"],
  ["remotive", "Remotive"],
  ["weworkremotely", "WeWorkRemotely"],
];

const formatErr = (err, fallback) => err?.response?.data?.detail || fallback;
const tagsOf = (p) => [].concat(
  Array.isArray(p.skills) ? p.skills : String(p.skills || "").split(","),
  Array.isArray(p.requirements) ? p.requirements : String(p.requirements || "").split(",")
).map((s) => String(s).trim()).filter(Boolean);

export default function FreelanceProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("devops");
  const [source, setSource] = useState("all");
  const [days, setDays] = useState("30");
  const [stats, setStats] = useState(null);
  const [editProject, setEditProject] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [view, setView] = useState("board");
  const [draggingId, setDraggingId] = useState(null);
  const [overCol, setOverCol] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (view === "list") {
        if (statusFilter !== "all") params.status = statusFilter;
        if (q.trim()) params.q = q.trim();
      }
      const { data } = await api.get("/freelance", { params });
      setProjects(data.projects);
      const s = await api.get("/freelance/stats");
      setStats(s.data);
    } catch {
      toast.error("Failed to load freelance projects");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, q, view]);

  useEffect(() => { load(); }, [load]);

  const fetchProjects = async () => {
    setFetching(true);
    try {
      const { data } = await api.post("/freelance/fetch", { query, source, limit: 25, days: parseInt(days, 10) });
      toast.success(`Fetched ${data.fetched} · saved ${data.saved} new`);
      load();
    } catch (err) {
      toast.error(formatErr(err, "Fetch failed"));
    } finally {
      setFetching(false);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/freelance/${id}`, { status });
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
      load();
    } catch (err) {
      toast.error(formatErr(err, "Update failed"));
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this project?")) return;
    try {
      await api.delete(`/freelance/${id}`);
      toast.success("Deleted");
      load();
    } catch (err) {
      toast.error(formatErr(err, "Delete failed"));
    }
  };

  const exportCsv = () => {
    const headers = ["Title", "Company", "Status", "Platform", "Budget", "Email", "Phones", "Location", "URL", "Skills", "Requirements", "Job Description", "Posted"];
    const rows = projects.map((p) => [
      p.title, p.company, p.status, p.platform, p.budget, p.email,
      (p.phones || []).join("; "), p.location, p.platform_url,
      (p.skills || []).join("; "), (p.requirements || "").replace(/\n/g, " "),
      (p.job_description || "").replace(/\n/g, " "), p.posted_at,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "freelance-projects.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const visibleProjects = view === "list"
    ? projects
    : (q.trim() ? projects.filter((p) => {
        const hay = [p.title, p.company, p.platform, p.location, p.job_description].join(" ").toLowerCase();
        return hay.includes(q.trim().toLowerCase());
      }) : projects);

  const dropOnColumn = (e, status) => {
    e.preventDefault();
    setOverCol(null);
    const id = e.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId(null);
    if (id) updateStatus(id, status);
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Income</div>
          <h1 className="font-heading text-4xl font-black tracking-tighter mt-1">Freelance Projects</h1>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex border border-border">
            <button
              onClick={() => setView("board")}
              data-testid="view-board"
              className={`px-3 py-2 flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold ${view === "board" ? "bg-white text-black" : "text-muted-foreground hover:bg-[#121212]"}`}
            >
              <SquaresFour size={14} /> Board
            </button>
            <button
              onClick={() => setView("list")}
              data-testid="view-list"
              className={`px-3 py-2 flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold ${view === "list" ? "bg-white text-black" : "text-muted-foreground hover:bg-[#121212]"}`}
            >
              <ListDashes size={14} /> List
            </button>
          </div>
          <Button onClick={() => setAddOpen(true)} className="rounded-none bg-white text-black hover:bg-white/90 uppercase tracking-widest text-xs font-bold">
            + Add Project
          </Button>
          <Button onClick={exportCsv} disabled={projects.length === 0} className="rounded-none border border-border hover:bg-[#121212] uppercase tracking-widest text-xs font-bold">
            <DownloadSimple size={14} className="mr-2" /> Export
          </Button>
        </div>
      </div>

      {/* Fetch from platforms */}
      <div className="border border-border bg-[#121212] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Briefcase size={20} className="text-primary" />
          <h3 className="font-heading text-xl font-bold tracking-tight">Fetch Freelance Projects</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Pulls live DevOps / web-dev / software projects from free public sources (LinkedIn contract jobs, RemoteOK, Remotive, WeWorkRemotely).
          Upwork / Fiverr / Freelancer block automated access — add those manually with "Add Project" and paste their URL.
        </p>
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Keyword</label>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. devops, wordpress, react" className="rounded-none bg-[#0A0A0A] border-border mt-1" />
          </div>
          <div className="w-48">
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Source</label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="rounded-none bg-[#0A0A0A] border-border mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none bg-[#0A0A0A] border-border">
                {SOURCES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-36">
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Posted within</label>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="rounded-none bg-[#0A0A0A] border-border mt-1" data-testid="freelance-days">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none bg-[#0A0A0A] border-border">
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="15">Last 15 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={fetchProjects} disabled={fetching} data-testid="freelance-fetch" className="rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-xs font-bold h-11 px-6">
            <MagnifyingGlass size={16} className="mr-2" />
            {fetching ? "Fetching..." : "Fetch Projects"}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title / company / description..." className="rounded-none bg-[#0A0A0A] border-border max-w-md" />
        {view === "list" && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-none bg-[#0A0A0A] border border-border text-xs px-3 py-2 uppercase tracking-widest"
          >
            <option value="all">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <span className="text-xs text-muted-foreground font-mono">{projects.length} project(s)</span>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : view === "board" ? (
        <BoardView
          projects={visibleProjects}
          stats={stats}
          draggingId={draggingId}
          overCol={overCol}
          setDraggingId={setDraggingId}
          setOverCol={setOverCol}
          dropOnColumn={dropOnColumn}
          onEdit={setEditProject}
          onDelete={del}
        />
      ) : projects.length === 0 ? (
        <div className="border border-border bg-[#121212] p-10 text-center text-sm text-muted-foreground">
          No projects yet. Fetch from sources above or add one manually.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {projects.map((p) => (
            <div key={p.id} className="border border-border bg-[#121212] p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-heading font-bold text-lg leading-tight">{p.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {p.company && <span className="text-white">{p.company}</span>}
                    {p.company && p.location ? " · " : ""}
                    {p.location && <span>{p.location}</span>}
                  </div>
                </div>
                <select
                  value={p.status}
                  onChange={(e) => updateStatus(p.id, e.target.value)}
                  className={`text-[10px] uppercase tracking-widest px-2 py-1 border bg-transparent rounded-none shrink-0 ${STATUS_STYLES[p.status] || STATUS_STYLES.new}`}
                >
                  {STATUSES.map((s) => <option key={s} value={s} className="bg-[#0A0A0A]">{s}</option>)}
                </select>
              </div>

              {p.platform && (
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span className="border border-border px-2 py-0.5">{p.platform}</span>
                  {p.budget && <span className="text-[#34C759]">{p.budget}</span>}
                  {p.posted_at && <span>posted {String(p.posted_at).slice(0, 10)}</span>}
                </div>
              )}

              {tagsOf(p).length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {tagsOf(p).slice(0, 8).map((s, i) => (
                    <span key={i} className="text-[10px] border border-border px-2 py-0.5 font-mono">{s}</span>
                  ))}
                </div>
              )}

              {p.job_description && (
                <p className="text-xs text-muted-foreground line-clamp-3">{p.job_description}</p>
              )}

              {(p.email || (p.phones || []).length > 0 || p.platform_url) && (
                <div className="flex items-center gap-3 text-xs flex-wrap mt-auto">
                  {p.email && (
                    <a href={`mailto:${p.email}`} className="flex items-center gap-1 text-primary hover:underline">
                      <EnvelopeSimple size={13} /> {p.email}
                    </a>
                  )}
                  {(p.phones || []).slice(0, 2).map((ph, i) => (
                    <a key={i} href={`tel:${ph.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1 hover:text-white">
                      <Phone size={13} /> {ph}
                    </a>
                  ))}
                  {p.platform_url && (
                    <a href={p.platform_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[#34C759] hover:underline">
                      <LinkSimple size={13} /> Open
                    </a>
                  )}
                </div>
              )}

              <div className="flex gap-2 justify-end border-t border-border pt-3">
                <Button onClick={() => setEditProject(p)} className="rounded-none border border-border hover:bg-[#0A0A0A] px-3 py-1.5 h-auto text-[10px] uppercase tracking-widest">
                  <PencilSimple size={12} className="mr-1" /> Edit
                </Button>
                <Button onClick={() => del(p.id)} className="rounded-none border border-[#FF3B30]/40 text-[#FF3B30] hover:bg-[#FF3B30]/10 px-3 py-1.5 h-auto text-[10px] uppercase tracking-widest">
                  <Trash size={12} className="mr-1" /> Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProjectDialog
        open={!!editProject || addOpen}
        project={editProject}
        isNew={addOpen && !editProject}
        onClose={() => { setEditProject(null); setAddOpen(false); }}
        onSaved={() => { setEditProject(null); setAddOpen(false); load(); }}
      />
    </div>
  );
}

function BoardView({ projects, stats, draggingId, overCol, setDraggingId, setOverCol, dropOnColumn, onEdit, onDelete }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start" data-testid="freelance-board">
      {STATUSES.map((status) => {
        const colProjects = projects.filter((p) => p.status === status);
        const isOver = overCol === status;
        const count = stats?.statuses?.[status] ?? colProjects.length;
        return (
          <div
            key={status}
            data-testid={`board-col-${status}`}
            onDragOver={(e) => { e.preventDefault(); setOverCol(status); }}
            onDragLeave={(e) => { if (e.currentTarget === e.target) setOverCol(null); }}
            onDrop={(e) => dropOnColumn(e, status)}
            className={`border border-t-4 bg-[#0F0F0F] flex flex-col min-h-[200px] transition-colors ${COLUMN_ACCENT[status]} ${isOver ? "border-primary bg-[#151515]" : "border-border"}`}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-[#121212]">
              <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{status}</div>
              <span className="text-[10px] font-mono border border-border px-1.5 py-0.5">{count}</span>
            </div>
            <div className="flex flex-col gap-2 p-2 flex-1">
              {colProjects.length === 0 && (
                <div className={`text-center text-[10px] uppercase tracking-widest text-muted-foreground/50 py-6 border border-dashed border-border ${isOver ? "border-primary" : ""}`}>
                  Drop here
                </div>
              )}
              {colProjects.map((p) => (
                <div
                  key={p.id}
                  draggable
                  data-testid={`board-card-${p.id}`}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", p.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDraggingId(p.id);
                  }}
                  onDragEnd={() => { setDraggingId(null); setOverCol(null); }}
                  onClick={() => onEdit(p)}
                  className={`border border-border bg-[#121212] p-3 flex flex-col gap-2 cursor-grab active:cursor-grabbing hover:border-[#3f3f46] select-none ${draggingId === p.id ? "opacity-40 border-primary" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-1.5 min-w-0">
                      <DotsSixVertical size={12} weight="bold" className="text-muted-foreground/50 shrink-0 mt-0.5" />
                      <div className="font-heading text-sm font-bold leading-tight line-clamp-2">{p.title}</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {p.company && <span className="text-white/80">{p.company}</span>}
                    {p.company && p.location ? " · " : ""}
                    {p.location}
                  </div>
                  {(p.budget || p.platform) && (
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest">
                      {p.budget && <span className="text-[#34C759] font-bold">{p.budget}</span>}
                      {p.budget && p.platform && <span className="text-muted-foreground/40">·</span>}
                      {p.platform && <span className="text-muted-foreground">{p.platform}</span>}
                    </div>
                  )}
                  {tagsOf(p).length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {tagsOf(p).slice(0, 4).map((s, i) => (
                        <span key={i} className="text-[9px] border border-border px-1.5 py-0.5 font-mono text-muted-foreground">{s}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 justify-end pt-1 border-t border-border/60" onClick={(e) => e.stopPropagation()}>
                    <button onClick={(e) => { e.stopPropagation(); onEdit(p); }} className="text-[9px] uppercase tracking-widest text-muted-foreground hover:text-white px-1.5 py-0.5 border border-border hover:bg-[#0A0A0A]">
                      <PencilSimple size={10} className="inline mr-0.5" />Edit
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(p.id); }} className="text-[9px] uppercase tracking-widest text-[#FF3B30] hover:text-[#FF6961] px-1.5 py-0.5 border border-[#FF3B30]/30 hover:bg-[#FF3B30]/10">
                      <Trash size={10} className="inline mr-0.5" />Del
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProjectDialog({ open, project, isNew, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (project) {
      setForm({
        title: project.title || "", company: project.company || "",
        job_description: project.job_description || "",
        requirements: Array.isArray(project.requirements) ? project.requirements.join(", ") : (project.requirements || ""),
        email: project.email || "", phones: (project.phones || []).join(", "),
        budget: project.budget || "", platform: project.platform || "",
        platform_url: project.platform_url || "", location: project.location || "",
        skills: (project.skills || []).join(", "), deadline: project.deadline || "",
        notes: project.notes || "", status: project.status || "new",
      });
    } else {
      setForm({ status: "new" });
    }
  }, [project, open]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.title?.trim()) return toast.error("Enter a project title");
    setSaving(true);
    try {
      const payload = {
        ...form,
        phones: form.phones ? form.phones.split(",").map((s) => s.trim()).filter(Boolean) : [],
        skills: form.skills ? form.skills.split(",").map((s) => s.trim()).filter(Boolean) : [],
        budget: form.budget || null, platform: form.platform || null,
      };
      if (isNew) {
        await api.post("/freelance", payload);
        toast.success("Project added");
      } else {
        await api.patch(`/freelance/${project.id}`, payload);
        toast.success("Project updated");
      }
      onSaved();
    } catch (err) {
      toast.error(formatErr(err, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-none bg-[#0A0A0A] border-border max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">{isNew ? "Add Freelance Project" : "Edit Freelance Project"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input placeholder="Project title *" value={form.title || ""} onChange={set("title")} className="rounded-none bg-[#121212] border-border" />
            <Input placeholder="Company / Client" value={form.company || ""} onChange={set("company")} className="rounded-none bg-[#121212] border-border" />
          </div>
          <Input placeholder="Platform (upwork, fiverr, freelancer, ...)" value={form.platform || ""} onChange={set("platform")} className="rounded-none bg-[#121212] border-border" />
          <Input placeholder="Platform URL" value={form.platform_url || ""} onChange={set("platform_url")} className="rounded-none bg-[#121212] border-border" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input placeholder="Budget (e.g. $500)" value={form.budget || ""} onChange={set("budget")} className="rounded-none bg-[#121212] border-border" />
            <Input placeholder="Location" value={form.location || ""} onChange={set("location")} className="rounded-none bg-[#121212] border-border" />
            <Input placeholder="Deadline" value={form.deadline || ""} onChange={set("deadline")} className="rounded-none bg-[#121212] border-border" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input placeholder="Contact email" value={form.email || ""} onChange={set("email")} className="rounded-none bg-[#121212] border-border font-mono" />
            <Input placeholder="Phones (comma separated)" value={form.phones || ""} onChange={set("phones")} className="rounded-none bg-[#121212] border-border font-mono" />
          </div>
          <Input placeholder="Skills (comma separated, e.g. aws, kubernetes, react)" value={form.skills || ""} onChange={set("skills")} className="rounded-none bg-[#121212] border-border" />
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Requirements</label>
            <Textarea rows={3} value={form.requirements || ""} onChange={set("requirements")} className="rounded-none bg-[#121212] border-border mt-1" />
          </div>
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Job Description</label>
            <Textarea rows={5} value={form.job_description || ""} onChange={set("job_description")} className="rounded-none bg-[#121212] border-border mt-1" />
          </div>
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Notes</label>
            <Textarea rows={2} value={form.notes || ""} onChange={set("notes")} className="rounded-none bg-[#121212] border-border mt-1" />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button onClick={onClose} className="rounded-none border border-border bg-[#121212] hover:bg-[#1A1A1A] uppercase tracking-widest text-xs font-bold">Cancel</Button>
            <Button onClick={save} disabled={saving} className="rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-xs font-bold">
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
