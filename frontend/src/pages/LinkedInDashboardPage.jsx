import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MagnifyingGlass, Briefcase, LinkedinLogo, ArrowRight, WarningCircle } from "@phosphor-icons/react";

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

const formatErr = (err, fallback) => err?.response?.data?.detail || fallback;
const tagsOf = (p) => [].concat(
  Array.isArray(p.skills) ? p.skills : String(p.skills || "").split(","),
  Array.isArray(p.requirements) ? p.requirements : String(p.requirements || "").split(",")
).map((s) => String(s).trim()).filter(Boolean);

export default function LinkedInDashboardPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("devops");
  const [days, setDays] = useState("7");
  const [stats, setStats] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { platform: "linkedin" };
      if (statusFilter !== "all") params.status = statusFilter;
      if (q.trim()) params.q = q.trim();
      const { data } = await api.get("/freelance", { params });
      setProjects(data.projects);
      const s = await api.get("/freelance/stats");
      setStats(s.data);
    } catch {
      toast.error("Failed to load LinkedIn projects");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, q]);

  useEffect(() => { load(); }, [load]);

  const fetchProjects = async () => {
    setFetching(true);
    try {
      const { data } = await api.post("/freelance/fetch", { query, source: "linkedin", limit: 25, days: parseInt(days, 10) });
      toast.success(`Fetched ${data.fetched} · saved ${data.saved} new`);
      load();
    } catch (err) {
      toast.error(formatErr(err, "Fetch failed"));
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
            <LinkedinLogo size={14} className="text-[#0A66C2]" /> LinkedIn · Freelance
          </div>
          <h1 className="font-heading text-4xl font-black tracking-tighter mt-1">LinkedIn Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">Contract roles pulled from LinkedIn's public job search. Click any project to open its full details.</p>
        </div>
      </div>

      {/* Fetch from LinkedIn */}
      <div className="border border-border bg-[#121212] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Briefcase size={20} className="text-primary" />
          <h3 className="font-heading text-xl font-bold tracking-tight">Fetch LinkedIn Contract Projects</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Uses LinkedIn's public guest endpoint (no login required) filtered to contract roles. Each posting includes company,
          location, posted date, and the full job description / requirements.
        </p>
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Keyword</label>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. devops, wordpress, react" className="rounded-none bg-[#0A0A0A] border-border mt-1" />
          </div>
          <div className="w-36">
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Posted within</label>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="rounded-none bg-[#0A0A0A] border-border mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none bg-[#0A0A0A] border-border">
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="15">Last 15 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={fetchProjects} disabled={fetching} data-testid="linkedin-fetch" className="rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-xs font-bold h-11 px-6">
            <MagnifyingGlass size={16} className="mr-2" />
            {fetching ? "Fetching..." : "Fetch LinkedIn Projects"}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title / company / description..." className="rounded-none bg-[#0A0A0A] border-border max-w-md" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-none bg-[#0A0A0A] border border-border text-xs px-3 py-2 uppercase tracking-widest"
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-xs text-muted-foreground font-mono">{projects.length} project(s)</span>
      </div>

      {/* Pipeline stats */}
      {stats && (
        <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
          {STATUSES.map((s) => (
            <div key={s} className={`border p-3 text-left ${COLUMN_ACCENT[s]} border-t-4 border-border bg-[#121212]`}>
              <div className={`text-[10px] uppercase tracking-widest ${s === "accepted" || s === "completed" ? "text-[#34C759]" : "text-muted-foreground"}`}>{s}</div>
              <div className="font-heading text-2xl font-black tracking-tighter mt-1">{stats.statuses[s] || 0}</div>
            </div>
          ))}
        </div>
      )}

      {/* Projects list */}
      {loading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : projects.length === 0 ? (
        <div className="border border-border bg-[#121212] p-10 text-center">
          <WarningCircle size={28} className="mx-auto text-muted-foreground/50 mb-3" />
          <div className="text-sm text-muted-foreground">No LinkedIn projects yet. Fetch from the panel above.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="linkedin-project-grid">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/linkedin/${p.id}`}
              data-testid={`linkedin-card-${p.id}`}
              className={`group border border-t-4 border-border bg-[#121212] p-5 flex flex-col gap-3 hover:border-[#3f3f46] transition-colors ${COLUMN_ACCENT[p.status] || COLUMN_ACCENT.new}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <LinkedinLogo size={16} weight="fill" className="text-[#0A66C2] shrink-0 mt-1" />
                  <div>
                    <div className="font-heading font-bold text-lg leading-tight line-clamp-2 group-hover:text-primary">{p.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {p.company && <span className="text-white">{p.company}</span>}
                    </div>
                  </div>
                </div>
                <span className={`text-[10px] uppercase tracking-widest px-2 py-1 border shrink-0 ${STATUS_STYLES[p.status] || STATUS_STYLES.new}`}>{p.status}</span>
              </div>

              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                {p.location && <span>{p.location}</span>}
                {p.posted_at && <span>· posted {String(p.posted_at).slice(0, 10)}</span>}
              </div>

              {tagsOf(p).length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {tagsOf(p).slice(0, 5).map((s, i) => (
                    <span key={i} className="text-[10px] border border-border px-2 py-0.5 font-mono">{s}</span>
                  ))}
                </div>
              )}

              {p.job_description && (
                <p className="text-xs text-muted-foreground line-clamp-3">{p.job_description}</p>
              )}

              <div className="flex items-center justify-between border-t border-border pt-3 mt-auto">
                <span className="text-[10px] uppercase tracking-widest text-[#0A66C2] font-bold flex items-center gap-1">
                  View details <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
