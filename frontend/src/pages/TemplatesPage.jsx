import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash, Eye, ArrowsSplit, ChartBar, FileText } from "@phosphor-icons/react";

const VARIABLES = ["{business_name}", "{category}", "{rating}", "{reviews}", "{address}", "{phone}", "{sender_name}"];
const DEFAULT_BODY = `Hi,

I noticed {business_name} has {rating}★ ({reviews} reviews) in {category} but doesn't have a website yet.

I help local businesses like yours get online with a mobile-friendly site — menu, contact, Google Maps — at an affordable price.

Open to a free 10-min chat?

{sender_name}`;

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [groups, setGroups] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", subject: "", body: DEFAULT_BODY });
  const [preview, setPreview] = useState(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: "", variant_a_template_id: "", variant_b_template_id: "" });
  const [statsGid, setStatsGid] = useState(null);
  const [stats, setStats] = useState(null);

  const load = async () => {
    const [t, g] = await Promise.all([api.get("/templates"), api.get("/ab-groups")]);
    setTemplates(t.data.templates);
    setGroups(g.data.groups);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name || !form.subject || !form.body) return toast.error("All fields required");
    try {
      if (editing) {
        await api.patch(`/templates/${editing.id}`, form);
        toast.success("Template updated");
      } else {
        await api.post("/templates", form);
        toast.success("Template created");
      }
      setOpen(false);
      setEditing(null);
      setForm({ name: "", subject: "", body: DEFAULT_BODY });
      load();
    } catch { toast.error("Save failed"); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete template?")) return;
    await api.delete(`/templates/${id}`);
    toast.success("Deleted");
    load();
  };

  const doPreview = async (id) => {
    const { data } = await api.post(`/templates/${id}/preview`);
    setPreview(data);
  };

  const insertVar = (v) => {
    setForm((f) => ({ ...f, body: (f.body || "") + " " + v }));
  };

  const openEdit = (t) => {
    setEditing(t);
    setForm({ name: t.name, subject: t.subject, body: t.body });
    setOpen(true);
  };

  const createGroup = async () => {
    if (!groupForm.name || !groupForm.variant_a_template_id || !groupForm.variant_b_template_id) {
      return toast.error("All fields required");
    }
    if (groupForm.variant_a_template_id === groupForm.variant_b_template_id) {
      return toast.error("A and B must be different templates");
    }
    try {
      await api.post("/ab-groups", { ...groupForm, active: true });
      toast.success("A/B group created");
      setGroupOpen(false);
      setGroupForm({ name: "", variant_a_template_id: "", variant_b_template_id: "" });
      load();
    } catch { toast.error("Create failed"); }
  };

  const delGroup = async (gid) => {
    if (!window.confirm("Delete A/B group?")) return;
    await api.delete(`/ab-groups/${gid}`);
    load();
  };

  const showStats = async (gid) => {
    const { data } = await api.get(`/ab-groups/${gid}/stats`);
    setStats(data);
    setStatsGid(gid);
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Content</div>
        <h1 className="font-heading text-4xl font-black tracking-tighter mt-1">Templates & A/B Testing</h1>
        <p className="text-sm text-muted-foreground mt-2">Reusable email templates with variables. Pair two into an A/B group to test which converts better.</p>
      </div>

      <Tabs defaultValue="templates">
        <TabsList className="rounded-none bg-[#121212] border border-border p-0 h-11">
          <TabsTrigger value="templates" data-testid="tab-templates" className="rounded-none data-[state=active]:bg-primary data-[state=active]:text-white h-11 px-6 uppercase tracking-widest text-xs font-bold"><FileText size={14} className="mr-2" />Templates</TabsTrigger>
          <TabsTrigger value="ab" data-testid="tab-ab" className="rounded-none data-[state=active]:bg-primary data-[state=active]:text-white h-11 px-6 uppercase tracking-widest text-xs font-bold"><ArrowsSplit size={14} className="mr-2" />A/B Groups</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button data-testid="new-template-btn" onClick={() => { setEditing(null); setForm({ name: "", subject: "", body: DEFAULT_BODY }); setOpen(true); }} className="rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-xs font-bold">
              <Plus size={14} className="mr-2" />New Template
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {templates.length === 0 ? (
              <div className="col-span-full border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                No templates yet. Create one to reuse it across outreach campaigns.
              </div>
            ) : templates.map((t) => {
              const rate = t.sent_count ? Math.round((t.reply_count / t.sent_count) * 100) : 0;
              return (
                <div key={t.id} className="border border-border bg-[#121212] p-5" data-testid={`template-${t.id}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-heading font-bold text-base leading-tight">{t.name}</div>
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{t.subject}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 mb-4">
                    <div className="border border-border p-2 text-center">
                      <div className="text-[10px] tracking-widest uppercase text-muted-foreground">Sent</div>
                      <div className="font-mono text-lg mt-1">{t.sent_count || 0}</div>
                    </div>
                    <div className="border border-border p-2 text-center">
                      <div className="text-[10px] tracking-widest uppercase text-muted-foreground">Replies</div>
                      <div className="font-mono text-lg mt-1 text-[#34C759]">{t.reply_count || 0}</div>
                    </div>
                    <div className="border border-border p-2 text-center">
                      <div className="text-[10px] tracking-widest uppercase text-muted-foreground">Rate</div>
                      <div className="font-mono text-lg mt-1 text-primary">{rate}%</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => doPreview(t.id)} className="flex-1 border border-border py-2 text-[10px] uppercase tracking-widest hover:bg-[#0A0A0A]" data-testid={`preview-${t.id}`}><Eye size={12} className="inline mr-1" />Preview</button>
                    <button onClick={() => openEdit(t)} className="flex-1 border border-border py-2 text-[10px] uppercase tracking-widest hover:bg-[#0A0A0A]" data-testid={`edit-tpl-${t.id}`}>Edit</button>
                    <button onClick={() => del(t.id)} className="border border-border p-2 hover:bg-[#FF3B30]/20" data-testid={`del-tpl-${t.id}`}><Trash size={12} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="ab" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button data-testid="new-group-btn" disabled={templates.length < 2} onClick={() => setGroupOpen(true)} className="rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-xs font-bold">
              <Plus size={14} className="mr-2" />New A/B Group
            </Button>
          </div>
          {templates.length < 2 && <div className="text-xs text-muted-foreground">Create at least 2 templates first.</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groups.length === 0 ? (
              <div className="col-span-full border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                No A/B groups yet. Pair two templates to A/B test them.
              </div>
            ) : groups.map((g) => {
              const nameOf = (id) => (templates.find((t) => t.id === id) || {}).name || "—";
              return (
                <div key={g.id} className="border border-border bg-[#121212] p-5" data-testid={`ab-${g.id}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="font-heading font-bold text-base">{g.name}</div>
                    <span className="text-[10px] uppercase tracking-widest border border-primary text-primary px-2 py-0.5">{g.active ? "Active" : "Off"}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                    <div className="border border-border p-2">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Variant A</div>
                      <div className="font-mono mt-1 truncate">{nameOf(g.variant_a_template_id)}</div>
                    </div>
                    <div className="border border-border p-2">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Variant B</div>
                      <div className="font-mono mt-1 truncate">{nameOf(g.variant_b_template_id)}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => showStats(g.id)} data-testid={`stats-${g.id}`} className="rounded-none bg-primary hover:bg-primary/90 flex-1 uppercase tracking-widest text-[10px] font-bold h-9">
                      <ChartBar size={12} className="mr-1" />Stats
                    </Button>
                    <button onClick={() => delGroup(g.id)} className="border border-border p-2 hover:bg-[#FF3B30]/20" data-testid={`del-ab-${g.id}`}><Trash size={12} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Template Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={(o) => { if (!o) { setOpen(false); setEditing(null); }}}>
        <DialogContent className="rounded-none bg-[#0A0A0A] border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight">{editing ? "Edit" : "New"} Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Name</label>
              <Input data-testid="tpl-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-none bg-[#121212] border-border mt-1" placeholder="e.g. Restaurant no-website pitch" />
            </div>
            <div>
              <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Subject</label>
              <Input data-testid="tpl-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="rounded-none bg-[#121212] border-border mt-1" placeholder="Website for {business_name}" />
            </div>
            <div>
              <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Body</label>
              <Textarea data-testid="tpl-body" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={10} className="rounded-none bg-[#121212] border-border mt-1 font-mono text-xs" />
              <div className="flex gap-1 flex-wrap mt-2">
                {VARIABLES.map((v) => (
                  <button key={v} type="button" onClick={() => insertVar(v)} className="text-[10px] font-mono border border-border px-2 py-1 hover:bg-[#121212]" data-testid={`var-${v.replace(/[{}]/g, "")}`}>{v}</button>
                ))}
              </div>
            </div>
            <Button onClick={save} data-testid="tpl-save" className="rounded-none bg-primary hover:bg-primary/90 w-full uppercase tracking-widest text-xs font-bold">Save Template</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="rounded-none bg-[#0A0A0A] border-border max-w-lg">
          <DialogHeader><DialogTitle className="font-heading tracking-tight">Preview</DialogTitle></DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Subject</div>
                <div className="border border-border p-3 bg-[#121212] mt-1 text-sm">{preview.subject}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Body</div>
                <div className="border border-border p-3 bg-[#121212] mt-1 text-xs font-mono whitespace-pre-wrap">{preview.body}</div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* A/B group create */}
      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent className="rounded-none bg-[#0A0A0A] border-border max-w-md">
          <DialogHeader><DialogTitle className="font-heading tracking-tight">New A/B Group</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Group Name</label>
              <Input data-testid="ab-name" value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} className="rounded-none bg-[#121212] border-border mt-1" />
            </div>
            <div>
              <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Variant A</label>
              <Select value={groupForm.variant_a_template_id} onValueChange={(v) => setGroupForm({ ...groupForm, variant_a_template_id: v })}>
                <SelectTrigger data-testid="ab-var-a" className="rounded-none bg-[#121212] border-border mt-1"><SelectValue placeholder="Pick template" /></SelectTrigger>
                <SelectContent className="rounded-none bg-[#0A0A0A] border-border">
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Variant B</label>
              <Select value={groupForm.variant_b_template_id} onValueChange={(v) => setGroupForm({ ...groupForm, variant_b_template_id: v })}>
                <SelectTrigger data-testid="ab-var-b" className="rounded-none bg-[#121212] border-border mt-1"><SelectValue placeholder="Pick template" /></SelectTrigger>
                <SelectContent className="rounded-none bg-[#0A0A0A] border-border">
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={createGroup} data-testid="ab-save" className="rounded-none bg-primary hover:bg-primary/90 w-full uppercase tracking-widest text-xs font-bold">Create Group</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stats dialog */}
      <Dialog open={!!statsGid} onOpenChange={(o) => !o && setStatsGid(null)}>
        <DialogContent className="rounded-none bg-[#0A0A0A] border-border max-w-lg">
          <DialogHeader><DialogTitle className="font-heading tracking-tight">{stats?.group?.name} · Stats</DialogTitle></DialogHeader>
          {stats && (
            <div className="grid grid-cols-2 gap-4">
              {stats.variants.map((v) => (
                <div key={v.label} className="border border-border p-4" data-testid={`variant-${v.label}`}>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Variant {v.label}</div>
                  <div className="font-heading text-lg font-bold mt-1 truncate">{v.template_name}</div>
                  <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                    <div><div className="text-[10px] uppercase text-muted-foreground">Sent</div><div className="font-mono text-lg">{v.sent}</div></div>
                    <div><div className="text-[10px] uppercase text-muted-foreground">Replied</div><div className="font-mono text-lg text-[#34C759]">{v.replied}</div></div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Reply Rate</div>
                    <div className="font-heading text-3xl font-black text-primary mt-1">{v.reply_rate}%</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
