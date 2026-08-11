import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, API_URL } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CurrencyDollar, HandCoins, TrendUp, Users, Calendar, Plus } from "@phosphor-icons/react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";

const DURATIONS = [
  { value: "day", label: "1 Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

const emptyForm = {
  business_name: "",
  contact_name: "",
  contract_amount: "",
  advance_paid: "",
  contract_start_date: "",
  contract_end_date: "",
  onboarding_notes: "",
  meetings_summary: "",
  confirmed_deal_amount: "",
  requirements: "",
  delivered_url: "",
  delivery_notes: "",
  notes: "",
};

export default function ClientDashboardPage() {
  const [clients, setClients] = useState([]);
  const [summary, setSummary] = useState(null);
  const [duration, setDuration] = useState("month");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [meetingForm, setMeetingForm] = useState({ title: "", meeting_at: "", summary: "", requirements: "", next_steps: "" });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [alerts, setAlerts] = useState([]);

  const load = useCallback(async (selectedDuration = duration) => {
    setLoading(true);
    try {
      const [clientsRes, summaryRes] = await Promise.all([
        api.get("/clients/history"),
        api.get("/clients/summary", { params: { duration: selectedDuration } }),
      ]);
      const alertsRes = await api.get("/clients/alerts");
      setClients(clientsRes.data.clients || []);
      setSummary(summaryRes.data || null);
      setAlerts(alertsRes.data.alerts || []);
    } catch {
      toast.error("Failed to load client dashboard");
    } finally {
      setLoading(false);
    }
  }, [duration]);

  useEffect(() => { load(duration); }, [duration, load]);

  const activeClients = useMemo(() => clients.filter((c) => (c.status || "").toLowerCase() === "active"), [clients]);
  const closedClients = useMemo(() => clients.filter((c) => (c.status || "").toLowerCase() === "closed"), [clients]);
  const archivedClients = useMemo(() => clients.filter((c) => (c.status || "").toLowerCase() === "archived"), [clients]);
  const activeClientsSorted = useMemo(() => [...activeClients].sort((a, b) => {
    const aEnd = a.contract_end_date ? new Date(a.contract_end_date).getTime() : Number.POSITIVE_INFINITY;
    const bEnd = b.contract_end_date ? new Date(b.contract_end_date).getTime() : Number.POSITIVE_INFINITY;
    return aEnd - bEnd;
  }), [activeClients]);
  const activeRemaining = useMemo(
    () => activeClients.reduce((sum, client) => sum + Number(client.balance_due || 0), 0),
    [activeClients]
  );
  const closedAndArchived = closedClients.length + archivedClients.length;
  const profitMargin = useMemo(
    () => clients.reduce((sum, client) => sum + (Number(client.total_gained || 0) - Number(client.cost_amount || 0)), 0),
    [clients]
  );

  const getTimeRemaining = (client) => {
    if (!client?.contract_end_date) return "No end date";
    const end = new Date(client.contract_end_date);
    if (Number.isNaN(end.getTime())) return "Invalid end date";
    const diff = end.getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return `${Math.abs(days)} day(s) overdue`;
    if (days === 0) return "Due today";
    return `${days} day(s) left`;
  };

  const getUrgencyClass = (client) => {
    const end = client?.contract_end_date ? new Date(client.contract_end_date) : null;
    if (!end || Number.isNaN(end.getTime())) return "border-border";
    const diffDays = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return "border-[#FF3B30] bg-[#FF3B30]/10";
    if (diffDays <= 3) return "border-[#FFCC00] bg-[#FFCC00]/10";
    return "border-border";
  };

  const earningsChart = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    if (duration === "day") start.setDate(start.getDate() - 1);
    else if (duration === "week") start.setDate(start.getDate() - 7);
    else if (duration === "year") start.setMonth(start.getMonth() - 12);
    else start.setMonth(start.getMonth() - 1);

    const bucket = new Map();
    const useMonthBucket = duration === "year";

    clients.forEach((client) => {
      (client.payments || []).forEach((payment) => {
        const paidAt = payment.paid_at ? new Date(payment.paid_at) : null;
        if (!paidAt || Number.isNaN(paidAt.getTime()) || paidAt < start) return;
        const key = useMonthBucket
          ? `${paidAt.getFullYear()}-${String(paidAt.getMonth() + 1).padStart(2, "0")}`
          : paidAt.toISOString().slice(0, 10);
        bucket.set(key, (bucket.get(key) || 0) + Number(payment.amount || 0));
      });
    });

    return Array.from(bucket.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, amount]) => ({ period, amount: Number(amount.toFixed(2)) }));
  }, [clients, duration]);

  const createClient = async () => {
    if (!form.business_name.trim()) return toast.error("Business name is required");
    if (!form.contract_amount) return toast.error("Contract amount is required");
    setCreating(true);
    try {
      const payload = {
        business_name: form.business_name,
        contact_name: form.contact_name,
        contract_amount: Number(form.contract_amount),
        advance_paid: form.advance_paid ? Number(form.advance_paid) : 0,
        contract_start_date: form.contract_start_date,
        contract_end_date: form.contract_end_date,
        onboarding_notes: form.onboarding_notes,
        meetings_summary: form.meetings_summary,
        confirmed_deal_amount: form.confirmed_deal_amount ? Number(form.confirmed_deal_amount) : 0,
        requirements: form.requirements,
        delivered_url: form.delivered_url,
        delivery_notes: form.delivery_notes,
        notes: form.notes,
      };
      await api.post("/clients", payload);
      setForm(emptyForm);
      setShowCreate(false);
      toast.success("Client created");
      load(duration);
    } catch {
      toast.error("Failed to create client");
    } finally {
      setCreating(false);
    }
  };

  const addPayment = async () => {
    if (!selectedClient || !paymentAmount) return;
    try {
      await api.post(`/clients/${selectedClient.id}/payments`, { amount: Number(paymentAmount), note: paymentNote });
      setPaymentAmount("");
      setPaymentNote("");
      toast.success("Payment added");
      const refreshed = await api.get("/clients/history");
      setClients(refreshed.data.clients || []);
      const refreshedSummary = await api.get("/clients/summary", { params: { duration } });
      setSummary(refreshedSummary.data || null);
      setSelectedClient((prev) => prev ? { ...prev, ...((refreshed.data.clients || []).find((c) => c.id === prev.id) || prev) } : prev);
    } catch {
      toast.error("Failed to add payment");
    }
  };

  const addMeeting = async () => {
    if (!selectedClient || !meetingForm.title.trim()) return toast.error("Meeting title is required");
    try {
      const { data } = await api.post(`/clients/${selectedClient.id}/meetings`, meetingForm);
      setSelectedClient(data);
      setMeetingForm({ title: "", meeting_at: "", summary: "", requirements: "", next_steps: "" });
      const refreshed = await api.get("/clients/history");
      setClients(refreshed.data.clients || []);
      toast.success("Meeting saved");
    } catch {
      toast.error("Failed to save meeting");
    }
  };

  const setStage = async (status) => {
    if (!selectedClient) return;
    try {
      const { data } = await api.patch(`/clients/${selectedClient.id}`, { status });
      setSelectedClient(data);
      load(duration);
    } catch {
      toast.error("Failed to update stage");
    }
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Finance Tracker</div>
          <h1 className="font-heading text-4xl font-black tracking-tighter mt-1">Client Dashboard</h1>
          <div className="text-sm text-muted-foreground mt-2">Track active clients, contracts, advance payments, balance due, and earnings history.</div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Button onClick={async () => {
            const token = localStorage.getItem("lg_token");
            const res = await fetch(`${API_URL}/clients/export`, { headers: { Authorization: `Bearer ${token}` } });
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "clients.csv";
            a.click();
          }} className="rounded-none border border-border bg-transparent hover:bg-[#121212] uppercase tracking-widest text-xs font-bold">
            Export
          </Button>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger className="rounded-none bg-[#121212] border-border w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none bg-[#0A0A0A] border-border">
              {DURATIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setShowCreate(true)} className="rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-xs font-bold">
            <Plus size={16} className="mr-2" />New Client
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Active Clients" value={summary?.active_clients ?? activeClients.length} icon={Users} accent="text-[#34C759]" />
        <StatCard label="Active Remaining" value={money(activeRemaining)} icon={HandCoins} accent="text-[#FF3B30]" />
        <StatCard label="Closed / Archived" value={closedAndArchived} icon={Calendar} accent="text-[#FFCC00]" />
        <StatCard label="Advance Paid" value={money(summary?.advance_total)} icon={HandCoins} accent="text-[#FFCC00]" />
        <StatCard label="Total Earned" value={money(summary?.total_earned)} icon={CurrencyDollar} accent="text-primary" />
        <StatCard label={`Earned (${duration})`} value={money(summary?.period_earned)} icon={TrendUp} accent="text-white" />
        <StatCard label="Profit Margin" value={money(profitMargin)} icon={CurrencyDollar} accent="text-[#34C759]" />
        <StatCard label="Overdue Alerts" value={alerts.length} icon={Calendar} accent="text-[#FF3B30]" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 border border-border bg-[#121212] p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Active Clients</div>
              <h3 className="font-heading text-xl font-bold tracking-tight mt-1">Contracts & Payment Status</h3>
            </div>
            <Badge className="rounded-none bg-[#0A0A0A] border border-border text-white">{summary?.clients_total ?? clients.length} total</Badge>
          </div>
          {loading ? (
            <div className="text-sm text-muted-foreground py-10">Loading...</div>
          ) : clients.length === 0 ? (
            <div className="text-sm text-muted-foreground py-10">No clients yet. Convert a lead or add one manually.</div>
          ) : (
            <div className="space-y-3">
              {activeClientsSorted.map((client) => (
                <button key={client.id} onClick={() => setSelectedClient(client)} className={`w-full text-left border p-4 bg-[#0A0A0A] hover:border-primary/60 transition-colors ${getUrgencyClass(client)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{client.business_name}</div>
                      <div className="text-xs text-muted-foreground mt-1">{client.contact_name || "No contact name"}</div>
                    </div>
                    <Badge className="rounded-none border border-border bg-transparent text-xs uppercase tracking-widest">{client.status || "active"}</Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs">
                    <Mini label="Contract" value={money(client.contract_amount)} />
                    <Mini label="Advance" value={money(client.advance_paid)} />
                    <Mini label="Paid" value={money(client.amount_paid)} />
                    <Mini label="Due" value={money(client.balance_due)} accent="text-[#FF3B30]" />
                  </div>
                  <div className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground">Time Left · <span className="text-white">{getTimeRemaining(client)}</span></div>
                  {client.due_date && Number(client.balance_due || 0) > 0 && new Date(client.due_date) < new Date() && (
                    <div className="mt-3 text-[10px] uppercase tracking-widest text-[#FF3B30]">Overdue · {client.due_date}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="xl:col-span-5 space-y-6">
          <div className="border border-border bg-[#121212] p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendUp size={18} className="text-primary" />
              <h3 className="font-heading text-xl font-bold tracking-tight">Earnings Trend</h3>
            </div>
            {earningsChart.length === 0 ? (
              <div className="text-sm text-muted-foreground py-10">No payment activity in this period.</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={earningsChart}>
                  <CartesianGrid stroke="#2a2a2a" vertical={false} />
                  <XAxis dataKey="period" stroke="#71717A" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#71717A" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "#0A0A0A", border: "1px solid #333", borderRadius: 0 }} />
                  <Bar dataKey="amount" fill="#007AFF" radius={[0, 0, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="border border-border bg-[#121212] p-6">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={18} className="text-primary" />
              <h3 className="font-heading text-xl font-bold tracking-tight">Earnings Summary</h3>
            </div>
            <div className="space-y-3 text-sm">
              <Row label="Contract Total" value={money(summary?.contract_total)} />
              <Row label="Advance Total" value={money(summary?.advance_total)} />
              <Row label="Remaining" value={money(summary?.balance_total)} />
              <Row label="This Period" value={money(summary?.period_earned)} />
              <Row label="Total Earned" value={money(summary?.total_earned)} strong />
            </div>
          </div>

          <div className="border border-border bg-[#121212] p-6">
            <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">History</div>
            <h3 className="font-heading text-xl font-bold tracking-tight mt-1 mb-4">Payment Timeline</h3>
            {clients.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4">No history yet.</div>
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-auto pr-1">
                {clients.map((client) => (
                  <div key={client.id} className="border border-border p-3 bg-[#0A0A0A]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-sm">{client.business_name}</div>
                      <button onClick={() => setSelectedClient(client)} className="text-[10px] uppercase tracking-widest border border-border px-2 py-1 hover:bg-[#121212]">Open</button>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">{(client.payments || []).length ? `${client.payments.length} payment(s)` : "No payment history"}</div>
                    {(client.payments || []).slice(0, 3).map((payment) => (
                      <div key={payment.id} className="mt-2 text-xs border-t border-border pt-2 flex items-center justify-between gap-3">
                        <span>{payment.note || payment.kind || "payment"}</span>
                        <span className="font-mono">{money(payment.amount)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border border-border bg-[#121212] p-6">
            <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Closed & Archive</div>
            <h3 className="font-heading text-xl font-bold tracking-tight mt-1 mb-4">Client Records</h3>
            {(closedClients.length === 0 && archivedClients.length === 0) ? (
              <div className="text-sm text-muted-foreground py-4">No closed or archived clients yet.</div>
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-auto pr-1">
                {[...closedClients, ...archivedClients].map((client) => (
                  <button key={client.id} onClick={() => setSelectedClient(client)} className="w-full text-left border border-border p-3 bg-[#0A0A0A] hover:border-primary/60 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-sm">{client.business_name}</div>
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{client.status || "closed"}</div>
                      </div>
                      <div className="font-mono text-xs">{money(client.balance_due)}</div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground line-clamp-2">{client.requirements || client.notes || "No requirements stored."}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border border-border bg-[#121212] p-6">
            <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Alerts</div>
            <h3 className="font-heading text-xl font-bold tracking-tight mt-1 mb-4">Overdue Clients</h3>
            {alerts.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4">No overdue balances.</div>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <div key={alert.id} className="border border-[#FF3B30] bg-[#FF3B30]/10 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{alert.business_name}</div>
                      <div className="font-mono text-[#FF3B30]">{money(alert.balance_due)}</div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Due {alert.due_date} · {alert.days_overdue} day(s) overdue</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="rounded-none bg-[#0A0A0A] border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight">Add Client</DialogTitle>
          </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input placeholder="Business name" value={form.business_name} onChange={(e) => setForm((p) => ({ ...p, business_name: e.target.value }))} className="rounded-none bg-[#121212] border-border md:col-span-2" />
                <Input placeholder="Contact name" value={form.contact_name} onChange={(e) => setForm((p) => ({ ...p, contact_name: e.target.value }))} className="rounded-none bg-[#121212] border-border" />
                <Input placeholder="Contract amount" type="number" value={form.contract_amount} onChange={(e) => setForm((p) => ({ ...p, contract_amount: e.target.value }))} className="rounded-none bg-[#121212] border-border" />
                <Input placeholder="Advance paid" type="number" value={form.advance_paid} onChange={(e) => setForm((p) => ({ ...p, advance_paid: e.target.value }))} className="rounded-none bg-[#121212] border-border" />
                <Input placeholder="Contract start date" type="date" value={form.contract_start_date} onChange={(e) => setForm((p) => ({ ...p, contract_start_date: e.target.value }))} className="rounded-none bg-[#121212] border-border" />
                <Input placeholder="Contract end date" type="date" value={form.contract_end_date} onChange={(e) => setForm((p) => ({ ...p, contract_end_date: e.target.value }))} className="rounded-none bg-[#121212] border-border" />
                <Textarea placeholder="Client requirements / scope" value={form.requirements} onChange={(e) => setForm((p) => ({ ...p, requirements: e.target.value }))} rows={3} className="rounded-none bg-[#121212] border-border md:col-span-2" />
                <Input placeholder="Delivered URL" value={form.delivered_url} onChange={(e) => setForm((p) => ({ ...p, delivered_url: e.target.value }))} className="rounded-none bg-[#121212] border-border md:col-span-2" />
                <Textarea placeholder="Delivery notes" value={form.delivery_notes} onChange={(e) => setForm((p) => ({ ...p, delivery_notes: e.target.value }))} rows={3} className="rounded-none bg-[#121212] border-border md:col-span-2" />
                <Textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={4} className="rounded-none bg-[#121212] border-border md:col-span-2" />
              </div>
          <div className="flex gap-2 justify-end mt-4">
            <Button onClick={() => setShowCreate(false)} className="rounded-none border border-border bg-transparent hover:bg-[#121212] uppercase tracking-widest text-xs font-bold">Cancel</Button>
            <Button onClick={createClient} disabled={creating} className="rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-xs font-bold">Create</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedClient} onOpenChange={(open) => !open && setSelectedClient(null)}>
        <DialogContent className="rounded-none bg-[#0A0A0A] border-border max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight">{selectedClient?.business_name}</DialogTitle>
          </DialogHeader>
          {selectedClient && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Mini label="Contract" value={money(selectedClient.contract_amount)} />
                <Mini label="Advance" value={money(selectedClient.advance_paid)} />
                <Mini label="Paid" value={money(selectedClient.amount_paid)} />
                <Mini label="Remaining" value={money(selectedClient.balance_due)} accent="text-[#FF3B30]" />
              </div>
              <div className="border border-border p-4 bg-[#121212] text-sm text-muted-foreground">Time Left: <span className="text-white">{getTimeRemaining(selectedClient)}</span></div>
              <div className="border border-border p-4 bg-[#121212] text-sm text-muted-foreground space-y-1">
                <div>Stage: <span className="text-white">{selectedClient.status || "active"}</span></div>
                <div>Confirmed Deal: <span className="text-white">{money(selectedClient.confirmed_deal_amount || selectedClient.contract_amount)}</span></div>
                <div>Onboarding Notes: <span className="text-white whitespace-pre-wrap">{selectedClient.onboarding_notes || "-"}</span></div>
              </div>
              {selectedClient && (
                <div className={`border p-4 text-sm ${getUrgencyClass(selectedClient)}`}>
                  Urgency: <span className="text-white">{getTimeRemaining(selectedClient)}</span>
                </div>
              )}
              <div className="border border-border p-4 bg-[#121212] space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Client Record</div>
                    <div className="text-sm text-white mt-1">{selectedClient.status || "active"}</div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button onClick={async () => {
                      const res = await api.post(`/clients/${selectedClient.id}/close`);
                      setSelectedClient(res.data);
                      load(duration);
                    }} className="rounded-none border border-border bg-transparent hover:bg-[#0A0A0A] uppercase tracking-widest text-xs font-bold">Close</Button>
                    <Button onClick={async () => {
                      const res = await api.post(`/clients/${selectedClient.id}/archive`);
                      setSelectedClient(res.data);
                      load(duration);
                    }} className="rounded-none border border-border bg-transparent hover:bg-[#0A0A0A] uppercase tracking-widest text-xs font-bold">Archive</Button>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">Created: {selectedClient.created_at ? new Date(selectedClient.created_at).toLocaleString() : "-"}</div>
                <div className="text-xs text-muted-foreground">Start: {selectedClient.contract_start_date || "-"}</div>
                <div className="text-xs text-muted-foreground">End: {selectedClient.contract_end_date || "-"}</div>
                <div className="text-xs text-muted-foreground">Closed: {selectedClient.closed_at ? new Date(selectedClient.closed_at).toLocaleString() : "-"}</div>
                <div className="text-xs text-muted-foreground">Archived: {selectedClient.archived_at ? new Date(selectedClient.archived_at).toLocaleString() : "-"}</div>
                <div className="text-xs text-muted-foreground">Duration: {selectedClient.contract_start_date && selectedClient.contract_end_date ? `${selectedClient.contract_start_date} to ${selectedClient.contract_end_date}` : "-"}</div>
                <div className="grid grid-cols-1 gap-2">
                  <Button onClick={() => setStage("onboarding")} className="rounded-none border border-border bg-transparent hover:bg-[#0A0A0A] uppercase tracking-widest text-xs font-bold w-full">Move to Onboarding</Button>
                  <Button onClick={() => setStage("active")} className="rounded-none border border-border bg-transparent hover:bg-[#0A0A0A] uppercase tracking-widest text-xs font-bold w-full">Mark Active</Button>
                  <Button onClick={async () => {
                    const res = await api.post(`/clients/${selectedClient.id}/close`);
                    setSelectedClient(res.data);
                    load(duration);
                  }} className="rounded-none bg-[#34C759] hover:bg-[#34C759]/90 text-black uppercase tracking-widest text-xs font-bold w-full">Complete & Close</Button>
                </div>
                <Button onClick={() => setEditForm({
                  id: selectedClient.id,
                  business_name: selectedClient.business_name || "",
                  contact_name: selectedClient.contact_name || "",
                  contract_amount: selectedClient.contract_amount ?? "",
                  cost_amount: selectedClient.cost_amount ?? "",
                  due_date: selectedClient.due_date || "",
                  contract_start_date: selectedClient.contract_start_date || "",
                  contract_end_date: selectedClient.contract_end_date || "",
                  requirements: selectedClient.requirements || "",
                  delivered_url: selectedClient.delivered_url || "",
                  delivery_notes: selectedClient.delivery_notes || "",
                  notes: selectedClient.notes || "",
                  status: selectedClient.status || "active",
                })} className="rounded-none border border-border bg-transparent hover:bg-[#0A0A0A] uppercase tracking-widest text-xs font-bold w-full">Edit Record</Button>
                {(selectedClient.status || "").toLowerCase() === "active" && (
                  <Button onClick={async () => {
                    const res = await api.post(`/clients/${selectedClient.id}/close`);
                    setSelectedClient(res.data);
                    load(duration);
                  }} className="rounded-none bg-[#34C759] hover:bg-[#34C759]/90 text-black uppercase tracking-widest text-xs font-bold w-full">Project Complete</Button>
                )}
              </div>
              <div className="border border-border p-4 bg-[#121212] space-y-3">
                <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Requirements</div>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedClient.requirements || "No requirements saved."}</div>
                <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground pt-2">Delivered URL</div>
                <div className="text-sm break-all text-primary">{selectedClient.delivered_url || "No URL saved."}</div>
                <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground pt-2">Delivery Notes</div>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedClient.delivery_notes || "No delivery notes saved."}</div>
              </div>
              <div className="border border-border p-4 bg-[#121212] space-y-3">
                <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Meetings</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input placeholder="Meeting title" value={meetingForm.title} onChange={(e) => setMeetingForm((p) => ({ ...p, title: e.target.value }))} className="rounded-none bg-[#0A0A0A] border-border md:col-span-2" />
                  <Input type="date" value={meetingForm.meeting_at} onChange={(e) => setMeetingForm((p) => ({ ...p, meeting_at: e.target.value }))} className="rounded-none bg-[#0A0A0A] border-border" />
                  <Input placeholder="Meeting summary" value={meetingForm.summary} onChange={(e) => setMeetingForm((p) => ({ ...p, summary: e.target.value }))} className="rounded-none bg-[#0A0A0A] border-border md:col-span-2" />
                  <Textarea placeholder="Requirements captured" value={meetingForm.requirements} onChange={(e) => setMeetingForm((p) => ({ ...p, requirements: e.target.value }))} rows={3} className="rounded-none bg-[#0A0A0A] border-border md:col-span-2" />
                  <Textarea placeholder="Next steps" value={meetingForm.next_steps} onChange={(e) => setMeetingForm((p) => ({ ...p, next_steps: e.target.value }))} rows={3} className="rounded-none bg-[#0A0A0A] border-border md:col-span-2" />
                </div>
                <div className="flex justify-end">
                  <Button onClick={addMeeting} className="rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-xs font-bold">Save Meeting</Button>
                </div>
                <div className="space-y-2">
                  {(selectedClient.meetings || []).map((meeting) => (
                    <div key={meeting.id} className="border border-border p-3 bg-[#0A0A0A] text-sm">
                      <div className="font-medium">{meeting.title}</div>
                      <div className="text-xs text-muted-foreground">{meeting.meeting_at ? new Date(meeting.meeting_at).toLocaleString() : "No date"}</div>
                      <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{meeting.summary || ""}</div>
                      <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{meeting.requirements || ""}</div>
                      <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{meeting.next_steps || ""}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border border-border p-4 bg-[#121212]">
                <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-2">Add Payment</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input placeholder="Amount" type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="rounded-none bg-[#0A0A0A] border-border" />
                  <Input placeholder="Note" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} className="rounded-none bg-[#0A0A0A] border-border md:col-span-2" />
                </div>
                <div className="flex justify-end mt-3">
                  <Button onClick={addPayment} className="rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-xs font-bold">Save Payment</Button>
                </div>
              </div>
              <div>
                <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-2">Payment History</div>
                <div className="space-y-2">
                  {(selectedClient.payments || []).length === 0 ? (
                    <div className="text-sm text-muted-foreground">No payments recorded.</div>
                  ) : selectedClient.payments.map((payment) => (
                    <div key={payment.id} className="border border-border bg-[#121212] p-3 flex items-center justify-between gap-3 text-sm">
                      <div>
                        <div className="font-medium">{payment.note || payment.kind || "payment"}</div>
                        <div className="text-xs text-muted-foreground font-mono">{payment.paid_at ? new Date(payment.paid_at).toLocaleString() : "No date"}</div>
                      </div>
                      <div className="font-mono">{money(payment.amount)}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border border-border p-4 bg-[#121212]">
                <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-2">Notes</div>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedClient.notes || "No notes saved."}</div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editForm} onOpenChange={(open) => !open && setEditForm(null)}>
        <DialogContent className="rounded-none bg-[#0A0A0A] border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight">Edit Client</DialogTitle>
          </DialogHeader>
          {editForm && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input value={editForm.business_name} onChange={(e) => setEditForm((p) => ({ ...p, business_name: e.target.value }))} className="rounded-none bg-[#121212] border-border md:col-span-2" />
              <Input value={editForm.contact_name} onChange={(e) => setEditForm((p) => ({ ...p, contact_name: e.target.value }))} className="rounded-none bg-[#121212] border-border" />
              <Input type="number" value={editForm.contract_amount} onChange={(e) => setEditForm((p) => ({ ...p, contract_amount: e.target.value }))} className="rounded-none bg-[#121212] border-border" />
              <Input type="number" value={editForm.cost_amount} onChange={(e) => setEditForm((p) => ({ ...p, cost_amount: e.target.value }))} className="rounded-none bg-[#121212] border-border" />
              <Input type="date" value={editForm.due_date} onChange={(e) => setEditForm((p) => ({ ...p, due_date: e.target.value }))} className="rounded-none bg-[#121212] border-border" />
              <Input value={editForm.delivered_url} onChange={(e) => setEditForm((p) => ({ ...p, delivered_url: e.target.value }))} className="rounded-none bg-[#121212] border-border md:col-span-2" />
              <Textarea value={editForm.requirements} onChange={(e) => setEditForm((p) => ({ ...p, requirements: e.target.value }))} rows={3} className="rounded-none bg-[#121212] border-border md:col-span-2" />
              <Textarea value={editForm.delivery_notes} onChange={(e) => setEditForm((p) => ({ ...p, delivery_notes: e.target.value }))} rows={3} className="rounded-none bg-[#121212] border-border md:col-span-2" />
              <Textarea value={editForm.notes} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} rows={3} className="rounded-none bg-[#121212] border-border md:col-span-2" />
            </div>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <Button onClick={() => setEditForm(null)} className="rounded-none border border-border bg-transparent hover:bg-[#121212] uppercase tracking-widest text-xs font-bold">Cancel</Button>
            <Button onClick={async () => {
              if (!editForm) return;
              try {
                const { id, ...payload } = editForm;
                await api.patch(`/clients/${id}`, {
                  ...payload,
                  contract_amount: payload.contract_amount === "" ? null : Number(payload.contract_amount),
                  cost_amount: payload.cost_amount === "" ? null : Number(payload.cost_amount),
                });
                setEditForm(null);
                toast.success("Client updated");
                load(duration);
              } catch {
                toast.error("Failed to update client");
              }
            }} className="rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-xs font-bold">Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }) {
  return (
    <div className="border border-border p-5 bg-[#121212]">
      <div className="flex items-center justify-between">
        <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">{label}</div>
        <Icon size={18} className="text-muted-foreground" />
      </div>
      <div className={`font-heading text-3xl font-black tracking-tighter mt-2 ${accent || ""}`}>{value}</div>
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-b-0 last:pb-0">
      <span className={`text-xs uppercase tracking-widest text-muted-foreground ${strong ? "text-white" : ""}`}>{label}</span>
      <span className={`font-mono ${strong ? "text-white" : ""}`}>{value}</span>
    </div>
  );
}

function Mini({ label, value, accent }) {
  return (
    <div className="border border-border p-3 bg-[#121212]">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`font-mono text-base mt-1 ${accent || ""}`}>{value}</div>
    </div>
  );
}

function money(value) {
  const num = Number(value || 0);
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
