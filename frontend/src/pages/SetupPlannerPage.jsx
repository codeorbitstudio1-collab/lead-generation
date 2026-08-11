import React, { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const DEFAULT_CHANNELS = ["google_maps", "email", "linkedin"];

export default function SetupPlannerPage() {
  const [form, setForm] = useState({
    business_name: "",
    service: "",
    location: "",
    goal: "find leads",
    target_customer: "",
    monthly_budget: "",
    channels: DEFAULT_CHANNELS.join(","),
    timeline_days: 30,
  });
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.business_name.trim() || !form.service.trim() || !form.location.trim()) {
      return toast.error("Business name, service, and location are required");
    }
    setLoading(true);
    try {
      const payload = {
        ...form,
        monthly_budget: form.monthly_budget === "" ? null : Number(form.monthly_budget),
        channels: form.channels.split(",").map((s) => s.trim()).filter(Boolean),
        timeline_days: Number(form.timeline_days),
      };
      const { data } = await api.post("/setup/planner", payload);
      setPlan(data);
      toast.success("Setup plan generated");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to build setup plan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Setup</div>
        <h1 className="font-heading text-4xl font-black tracking-tighter mt-1">Lead Setup Planner</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">Build a practical lead-generation plan from a client brief. It gives you targeting hints, outreach copy, and a step-by-step setup checklist.</p>
      </div>

      <form onSubmit={submit} className="border border-border bg-[#121212] p-6 space-y-4 max-w-4xl" data-testid="setup-planner-form">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Business name</label>
            <Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} className="rounded-none bg-[#0A0A0A] border-border mt-1" required />
          </div>
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Service</label>
            <Input value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} className="rounded-none bg-[#0A0A0A] border-border mt-1" required placeholder="e.g. web design, seo, ads" />
          </div>
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Location</label>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="rounded-none bg-[#0A0A0A] border-border mt-1" required placeholder="e.g. Bangalore" />
          </div>
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Goal</label>
            <Input value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} className="rounded-none bg-[#0A0A0A] border-border mt-1" placeholder="find leads" />
          </div>
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Target customer</label>
            <Input value={form.target_customer} onChange={(e) => setForm({ ...form, target_customer: e.target.value })} className="rounded-none bg-[#0A0A0A] border-border mt-1" placeholder="e.g. restaurants without websites" />
          </div>
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Monthly budget</label>
            <Input type="number" value={form.monthly_budget} onChange={(e) => setForm({ ...form, monthly_budget: e.target.value })} className="rounded-none bg-[#0A0A0A] border-border mt-1" placeholder="Optional" />
          </div>
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Channels</label>
            <Input value={form.channels} onChange={(e) => setForm({ ...form, channels: e.target.value })} className="rounded-none bg-[#0A0A0A] border-border mt-1" placeholder="google_maps,email,linkedin" />
          </div>
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Timeline days</label>
            <Input type="number" min="1" max="365" value={form.timeline_days} onChange={(e) => setForm({ ...form, timeline_days: e.target.value })} className="rounded-none bg-[#0A0A0A] border-border mt-1" />
          </div>
        </div>
        <Button type="submit" disabled={loading} className="rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-xs font-bold btn-sharp">
          {loading ? "Building plan..." : "Generate Setup Plan"}
        </Button>
      </form>

      {plan && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-5 border border-border bg-[#121212] p-6 space-y-4">
            <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Targeting</div>
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Prospecting angle</div>
              <div className="mt-2 font-medium">{plan.prospecting_angle}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Lead query</div>
              <pre className="mt-2 text-xs overflow-auto bg-[#0A0A0A] border border-border p-3">{JSON.stringify(plan.lead_query, null, 2)}</pre>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Channels</div>
              <div className="mt-2 flex gap-2 flex-wrap">{plan.channels.map((c) => <span key={c} className="text-[10px] uppercase tracking-widest border border-border px-2 py-1">{c}</span>)}</div>
            </div>
          </div>

          <div className="xl:col-span-7 space-y-6">
            <div className="border border-border bg-[#121212] p-6">
              <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Outreach Draft</div>
              <h3 className="font-heading text-xl font-bold tracking-tight mt-1">{plan.outreach.subject}</h3>
              <Textarea readOnly value={plan.outreach.body} className="rounded-none bg-[#0A0A0A] border-border mt-4 min-h-28" />
            </div>

            <div className="border border-border bg-[#121212] p-6">
              <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Checklist</div>
              <ul className="mt-3 space-y-2 text-sm">
                {plan.checklist.map((item) => <li key={item} className="border-b border-border pb-2 last:border-b-0">{item}</li>)}
              </ul>
            </div>

            <div className="border border-border bg-[#121212] p-6">
              <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Timeline</div>
              <div className="mt-3 space-y-3">
                {plan.phases.map((phase) => (
                  <div key={phase.day_range} className="border border-border p-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="font-heading text-lg font-bold">{phase.focus}</div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Days {phase.day_range}</div>
                    </div>
                    <ul className="mt-2 text-sm space-y-1 list-disc pl-5">
                      {phase.tasks.map((task) => <li key={task}>{task}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
