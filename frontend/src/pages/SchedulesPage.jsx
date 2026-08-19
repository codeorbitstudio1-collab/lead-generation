import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Clock, Plus, Play, Trash, MapPin } from "@phosphor-icons/react";
import CategoryCombobox from "@/components/CategoryCombobox";

const defaultForm = { name: "", location: "", category: "restaurant", radius_meters: 5000, hour: 10, minute: 0, active: true };

export default function SchedulesPage() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const { data } = await api.get("/schedules");
    setItems(data.schedules);
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!form.name || !form.location) return toast.error("Name and location required");
    setLoading(true);
    try {
      await api.post("/schedules", form);
      toast.success("Schedule created");
      setForm(defaultForm);
      setOpen(false);
      load();
    } catch (err) {
      toast.error("Failed to create");
    } finally {
      setLoading(false);
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete schedule?")) return;
    await api.delete(`/schedules/${id}`);
    toast.success("Deleted");
    load();
  };

  const runNow = async (id) => {
    toast.info("Running...");
    try {
      const { data } = await api.post(`/schedules/${id}/run`);
      toast.success(`Found ${data.results.length} businesses, ${data.search.hot_leads} hot leads`);
      load();
    } catch {
      toast.error("Run failed");
    }
  };

  const toggle = async (item) => {
    await api.patch(`/schedules/${item.id}`, { ...item, active: !item.active });
    load();
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Automation</div>
          <h1 className="font-heading text-4xl font-black tracking-tighter mt-1">Scheduled Searches</h1>
          <p className="text-sm text-muted-foreground mt-2">Runs daily at your chosen time (UTC). Perfect for the 10AM auto-sweep.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="new-schedule-btn" className="rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-xs font-bold btn-sharp">
              <Plus size={16} className="mr-2" />
              New Schedule
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-none bg-[#0A0A0A] border-border max-w-md">
            <DialogHeader>
              <DialogTitle className="font-heading tracking-tight">Create Schedule</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Name</label>
                <Input data-testid="sch-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-none bg-[#121212] border-border mt-1" />
              </div>
              <div>
                <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Location</label>
                <Input data-testid="sch-location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="rounded-none bg-[#121212] border-border mt-1" />
              </div>
              <div>
                <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Category</label>
                <div className="mt-1">
                  <CategoryCombobox value={form.category} onChange={(v) => setForm({ ...form, category: v })} dataTestId="sch-category" placeholder="All categories" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Hour (0-23 UTC)</label>
                  <Input data-testid="sch-hour" type="number" min={0} max={23} value={form.hour} onChange={(e) => setForm({ ...form, hour: Number(e.target.value) })} className="rounded-none bg-[#121212] border-border mt-1" />
                </div>
                <div>
                  <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Minute</label>
                  <Input data-testid="sch-minute" type="number" min={0} max={59} value={form.minute} onChange={(e) => setForm({ ...form, minute: Number(e.target.value) })} className="rounded-none bg-[#121212] border-border mt-1" />
                </div>
              </div>
              <Button onClick={create} disabled={loading} data-testid="sch-submit" className="rounded-none bg-primary hover:bg-primary/90 w-full uppercase tracking-widest text-xs font-bold">
                {loading ? "Creating..." : "Create Schedule"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.length === 0 ? (
          <div className="col-span-full border border-dashed border-border p-12 text-center">
            <Clock size={32} className="text-muted-foreground mx-auto mb-3" />
            <div className="text-sm text-muted-foreground">No schedules yet. Create one to auto-fetch leads daily.</div>
          </div>
        ) : items.map((s) => (
          <div key={s.id} className="border border-border bg-[#121212] p-5" data-testid={`schedule-${s.id}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-heading font-bold text-lg leading-tight">{s.name}</div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><MapPin size={12} /> {s.location}</div>
              </div>
              <Switch checked={s.active} onCheckedChange={() => toggle(s)} data-testid={`toggle-${s.id}`} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs mb-4">
              <div className="border border-border p-2">
                <div className="text-[10px] tracking-widest uppercase text-muted-foreground">Category</div>
                <div className="font-mono mt-1">{s.category}</div>
              </div>
              <div className="border border-border p-2">
                <div className="text-[10px] tracking-widest uppercase text-muted-foreground">Time (UTC)</div>
                <div className="font-mono mt-1">{String(s.hour).padStart(2, "0")}:{String(s.minute).padStart(2, "0")}</div>
              </div>
            </div>
            {s.last_run && <div className="text-[10px] text-muted-foreground font-mono mb-3">Last run: {new Date(s.last_run).toLocaleString()}</div>}
            <div className="flex gap-2">
              <Button onClick={() => runNow(s.id)} data-testid={`run-${s.id}`} className="rounded-none bg-primary hover:bg-primary/90 flex-1 uppercase tracking-widest text-[10px] font-bold h-9">
                <Play size={12} className="mr-1" /> Run Now
              </Button>
              <button onClick={() => del(s.id)} className="p-2 border border-border hover:bg-[#FF3B30]/20" data-testid={`del-${s.id}`}>
                <Trash size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
