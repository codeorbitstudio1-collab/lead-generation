import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LinkedinLogo, EnvelopeSimple, Phone, LinkSimple, Trash, PencilSimple, CalendarBlank, MapPin, CurrencyDollar, BuildingOffice, ArrowSquareOut, MagnifyingGlass, CheckCircle } from "@phosphor-icons/react";

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

const formatErr = (err, fallback) => err?.response?.data?.detail || fallback;
const tagsOf = (p) => [].concat(
  Array.isArray(p.skills) ? p.skills : String(p.skills || "").split(","),
  Array.isArray(p.requirements) ? p.requirements : String(p.requirements || "").split(",")
).map((s) => String(s).trim()).filter(Boolean);

export default function LinkedInProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/freelance/${id}`);
      setProject(data);
    } catch (err) {
      toast.error(formatErr(err, "Failed to load project"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (status) => {
    setUpdating(true);
    try {
      const { data } = await api.patch(`/freelance/${id}`, { status });
      setProject(data);
      toast.success("Status updated");
    } catch (err) {
      toast.error(formatErr(err, "Update failed"));
    } finally {
      setUpdating(false);
    }
  };

  const del = async () => {
    if (!window.confirm("Delete this project?")) return;
    try {
      await api.delete(`/freelance/${id}`);
      toast.success("Deleted");
      navigate("/linkedin");
    } catch (err) {
      toast.error(formatErr(err, "Delete failed"));
    }
  };

  const enrich = async () => {
    setEnriching(true);
    setEnrichMsg(null);
    try {
      const { data } = await api.post(`/freelance/${id}/enrich`);
      if (data.ok) {
        setProject(data.project);
        setEnrichMsg(`Found ${data.project.email ? "email " + data.project.email : ""}${data.project.phones?.length ? " · " + data.project.phones.length + " phone" : ""}${data.project.website ? " · website" : ""}`);
        toast.success("Contact details found");
      } else {
        setEnrichMsg("No contact details found for this company on public sources.");
        toast.error("No contact details found");
      }
    } catch (err) {
      toast.error(formatErr(err, "Enrichment failed"));
      setEnrichMsg(null);
    } finally {
      setEnriching(false);
    }
  };

  if (loading) return <div className="p-8 text-muted-foreground">Loading project details...</div>;

  if (!project) return (
    <div className="p-8">
      <Button onClick={() => navigate("/linkedin")} className="rounded-none border border-border bg-[#121212] hover:bg-[#1A1A1A] uppercase tracking-widest text-xs font-bold mb-6">
        <ArrowLeft size={14} className="mr-2" /> Back
      </Button>
      <div className="border border-border bg-[#121212] p-10 text-center text-sm text-muted-foreground">Project not found or deleted.</div>
    </div>
  );

  const p = project;
  const contacts = (p.email || (p.phones || []).length > 0);
  const skills = tagsOf(p);

  return (
    <div className="p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Button onClick={() => navigate("/linkedin")} data-testid="detail-back" className="rounded-none border border-border bg-[#121212] hover:bg-[#1A1A1A] uppercase tracking-widest text-xs font-bold">
          <ArrowLeft size={14} className="mr-2" /> Back to LinkedIn Projects
        </Button>
        <div className="flex gap-2">
          <Link to="/freelance" className="rounded-none border border-border bg-[#121212] hover:bg-[#1A1A1A] px-4 py-2 uppercase tracking-widest text-xs font-bold inline-flex items-center">
            Pipeline
          </Link>
          <Button onClick={del} className="rounded-none border border-[#FF3B30]/40 text-[#FF3B30] hover:bg-[#FF3B30]/10 uppercase tracking-widest text-xs font-bold">
            <Trash size={14} className="mr-2" /> Delete
          </Button>
        </div>
      </div>

      {/* Header card */}
      <div className="border border-border bg-[#121212] p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 border border-[#0A66C2] bg-[#0A66C2]/10 flex items-center justify-center shrink-0">
              <LinkedinLogo size={24} weight="fill" className="text-[#0A66C2]" />
            </div>
            <div>
              <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">LinkedIn Contract Role</div>
              <h1 className="font-heading text-3xl sm:text-4xl font-black tracking-tighter mt-1" data-testid="detail-title">{p.title}</h1>
              <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground flex-wrap">
                {p.company && (
                  <span className="flex items-center gap-1">
                    <BuildingOffice size={15} /> <span className="text-white">{p.company}</span>
                  </span>
                )}
                {p.location && (
                  <span className="flex items-center gap-1">
                    <MapPin size={15} /> {p.location}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] uppercase tracking-widest px-2 py-1 border ${STATUS_STYLES[p.status] || STATUS_STYLES.new}`}>{p.status}</span>
          </div>
        </div>

        {/* Meta strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 border-t border-border pt-5">
          <div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Posted</div>
            <div className="text-sm font-medium flex items-center gap-1 mt-1">
              <CalendarBlank size={14} /> {p.posted_at ? String(p.posted_at).slice(0, 10) : "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Platform</div>
            <div className="text-sm font-medium mt-1 flex items-center gap-1">
              <LinkedinLogo size={14} className="text-[#0A66C2]" /> LinkedIn
            </div>
          </div>
          <div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Budget / Salary</div>
            <div className="text-sm font-medium mt-1 flex items-center gap-1 text-[#34C759]">
              <CurrencyDollar size={14} /> {p.budget || "Not listed"}
            </div>
          </div>
          <div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Status</div>
            <select
              value={p.status}
              disabled={updating}
              onChange={(e) => updateStatus(e.target.value)}
              className="mt-1 text-[10px] uppercase tracking-widest px-2 py-1 border bg-transparent rounded-none"
            >
              {STATUSES.map((s) => <option key={s} value={s} className="bg-[#0A0A0A]">{s}</option>)}
            </select>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap mt-6">
          {p.platform_url && (
            <a href={p.platform_url} target="_blank" rel="noreferrer" data-testid="detail-apply" className="inline-flex items-center gap-2 px-4 py-2 bg-[#0A66C2] text-white hover:bg-[#0A66C2]/90 uppercase tracking-widest text-xs font-bold rounded-none">
              <ArrowSquareOut size={14} /> View on LinkedIn
            </a>
          )}
          {p.email && (
            <a href={`mailto:${p.email}`} className="inline-flex items-center gap-2 px-4 py-2 border border-border hover:bg-[#0A0A0A] uppercase tracking-widest text-xs font-bold rounded-none">
              <EnvelopeSimple size={14} /> {p.email}
            </a>
          )}
          <button
            onClick={enrich}
            disabled={enriching}
            data-testid="detail-enrich"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-black hover:bg-primary/90 uppercase tracking-widest text-xs font-bold rounded-none disabled:opacity-50"
          >
            {enriching ? <MagnifyingGlass size={14} className="animate-spin" /> : <MagnifyingGlass size={14} />}
            {enriching ? "Searching..." : "Find Contact Details"}
          </button>
        </div>
        {enrichMsg && (
          <div className="flex items-center gap-2 mt-4 text-xs text-[#34C759] font-mono border border-[#34C759]/30 bg-[#34C759]/5 px-3 py-2">
            <CheckCircle size={14} /> {enrichMsg}
          </div>
        )}
      </div>

      {/* Skills */}
      {skills.length > 0 && (
        <div className="border border-border bg-[#121212] p-6">
          <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-3">Skills / Keywords</div>
          <div className="flex gap-1.5 flex-wrap">
            {skills.map((s, i) => (
              <span key={i} className="text-xs border border-border px-2.5 py-1 font-mono">{s}</span>
            ))}
          </div>
        </div>
      )}

      {/* Contact info */}
      <div className="border border-border bg-[#121212] p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Contact Details</div>
          {!contacts && p.company && (
            <button onClick={enrich} disabled={enriching} className="text-[10px] uppercase tracking-widest text-primary hover:underline font-bold inline-flex items-center gap-1">
              <MagnifyingGlass size={12} /> Find contact for {p.company}
            </button>
          )}
        </div>
        {p.website && (
          <a href={p.website} target="_blank" rel="noreferrer" data-testid="detail-website" className="flex items-center gap-2 text-sm text-[#34C759] hover:underline font-mono mb-2">
            <LinkSimple size={16} /> {p.website}
          </a>
        )}
        {!contacts && !p.website ? (
          <p className="text-sm text-muted-foreground">
            No email or phone was listed on this LinkedIn posting. LinkedIn doesn't expose the poster's direct contact —
            click "Find Contact Details" to look up the company website, or open the "View on LinkedIn" link and reach out via the platform.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {p.email && (
              <a href={`mailto:${p.email}`} className="flex items-center gap-2 text-sm text-primary hover:underline font-mono">
                <EnvelopeSimple size={16} /> {p.email}
              </a>
            )}
            {(p.phones || []).map((ph, i) => (
              <a key={i} href={`tel:${ph.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 text-sm hover:text-white font-mono">
                <Phone size={16} /> {ph}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Full description */}
      <div className="border border-border bg-[#121212] p-6">
        <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-3">Full Requirements & Description</div>
        <div className="text-sm leading-relaxed whitespace-pre-wrap text-[#d4d4d8]">
          {p.job_description || "No description provided."}
        </div>
      </div>

      {/* Notes */}
      <div className="border border-border bg-[#121212] p-6">
        <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-3">Notes</div>
        {p.notes ? (
          <p className="text-sm whitespace-pre-wrap text-[#d4d4d8]">{p.notes}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        )}
        <Link to="/freelance" className="inline-flex items-center gap-2 mt-4 text-xs uppercase tracking-widest text-primary hover:underline">
          <PencilSimple size={14} /> Edit this project (in Freelance page)
        </Link>
      </div>
    </div>
  );
}
