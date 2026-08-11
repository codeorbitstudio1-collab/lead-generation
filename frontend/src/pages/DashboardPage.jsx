import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Target } from "@phosphor-icons/react";

const Kpi = ({ label, value, sub, accent, testId }) => (
  <div className="border border-border p-6 bg-[#121212] h-full" data-testid={testId}>
    <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">{label}</div>
    <div className={`font-heading text-4xl font-black tracking-tighter mt-2 ${accent || ""}`}>{value}</div>
    {sub && <div className="text-xs text-muted-foreground mt-2 font-mono">{sub}</div>}
  </div>
);

const STATUS_COLORS = { new: "#71717A", contacted: "#FFCC00", interested: "#007AFF", converted: "#34C759", rejected: "#FF3B30", onboarding: "#AF52DE", active: "#34C759", closed: "#FF9F0A", archived: "#8E8E93" };

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [priorities, setPriorities] = useState([]);
  const [prioritySummary, setPrioritySummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get("/analytics/summary"), api.get("/leads/priorities?limit=5")])
      .then(([analytics, priorityResp]) => {
        setData(analytics.data);
        setPriorities(priorityResp.data.priorities || []);
        setPrioritySummary(priorityResp.data.summary || null);
      })
      .catch(() => toast.error("Failed to load analytics"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-muted-foreground">Loading...</div>;
  if (!data) return null;

  const statusData = Object.entries(data.by_status).map(([name, value]) => ({ name, value }));

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Overview</div>
          <h1 className="font-heading text-4xl font-black tracking-tighter mt-1">Lead Dashboard</h1>
        </div>
        <Link to="/search" data-testid="cta-new-search" className="px-5 py-3 bg-primary text-white text-xs uppercase tracking-widest font-bold btn-sharp hover:bg-primary/90">
          New Search →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Kpi testId="kpi-total" label="Total Leads" value={data.total_leads} sub="all-time" />
        <Kpi testId="kpi-hot" label="Hot Leads (No Website)" value={data.no_website_leads} sub="primary targets" accent="text-[#FF3B30]" />
        <Kpi testId="kpi-converted" label="Converted" value={data.by_status.converted} sub="closed deals" accent="text-[#34C759]" />
        <Kpi testId="kpi-rate" label="Conversion Rate" value={`${data.conversion_rate}%`} sub="overall" accent="text-primary" />
      </div>

      {prioritySummary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Kpi testId="kpi-priority-total" label="Scored Leads" value={prioritySummary.total} sub="ranked queue" />
          <Kpi testId="kpi-priority-hot" label="Priority Hot" value={prioritySummary.hot} sub="score 70+" accent="text-[#FF3B30]" />
          <Kpi testId="kpi-priority-warm" label="Priority Warm" value={prioritySummary.warm} sub="score 40-69" accent="text-[#FFCC00]" />
          <Kpi testId="kpi-priority-cool" label="Priority Cool" value={prioritySummary.cool} sub="score < 40" accent="text-muted-foreground" />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 border border-border bg-[#121212] p-6" data-testid="chart-categories">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Breakdown</div>
              <h3 className="font-heading text-xl font-bold tracking-tight mt-1">Leads by Category</h3>
            </div>
            <Target size={20} className="text-muted-foreground" />
          </div>
          {data.categories.length === 0 ? (
            <div className="text-sm text-muted-foreground py-12 text-center">No leads yet. Start a search to populate.</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.categories}>
                <XAxis dataKey="category" stroke="#71717A" fontSize={11} />
                <YAxis stroke="#71717A" fontSize={11} />
                <Tooltip contentStyle={{ background: "#0A0A0A", border: "1px solid #333", borderRadius: 0 }} />
                <Bar dataKey="count" fill="#007AFF" />
                <Bar dataKey="no_website" fill="#FF3B30" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="xl:col-span-4 border border-border bg-[#121212] p-6" data-testid="chart-status">
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Pipeline</div>
          <h3 className="font-heading text-xl font-bold tracking-tight mt-1 mb-4">Lead Status</h3>
          <div className="space-y-2">
            {statusData.map((s) => (
              <div key={s.name} className="flex items-center justify-between border-b border-border py-2 last:border-b-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2" style={{ background: STATUS_COLORS[s.name] }} />
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">{s.name}</span>
                </div>
                <span className="font-mono text-lg font-medium">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border border-border bg-[#121212] p-6" data-testid="recent-searches">
        <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Activity</div>
        <h3 className="font-heading text-xl font-bold tracking-tight mt-1 mb-4">Recent Searches</h3>
        {data.recent_searches.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6">No searches yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.2em] uppercase text-muted-foreground border-b border-border">
                <th className="pb-2">Location</th>
                <th className="pb-2">Category</th>
                <th className="pb-2">Found</th>
                <th className="pb-2 text-[#FF3B30]">Hot</th>
                <th className="pb-2">Source</th>
                <th className="pb-2">When</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_searches.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-b-0">
                  <td className="py-3 font-medium">{s.location}</td>
                  <td className="py-3 font-mono text-xs">{s.category}</td>
                  <td className="py-3 font-mono">{s.total_found}</td>
                  <td className="py-3 font-mono text-[#FF3B30]">{s.hot_leads}</td>
                  <td className="py-3 text-xs text-muted-foreground">{s.source}</td>
                  <td className="py-3 text-xs text-muted-foreground font-mono">{new Date(s.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {priorities.length > 0 && (
        <div className="border border-border bg-[#121212] p-6" data-testid="priority-queue">
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Priority Queue</div>
          <h3 className="font-heading text-xl font-bold tracking-tight mt-1 mb-4">Next best leads</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            {priorities.map((lead) => (
              <div key={lead.lead_id} className="border border-border p-4 bg-[#0A0A0A]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-heading font-bold leading-tight">{lead.name}</div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{lead.category} · {lead.location}</div>
                  </div>
                  <div className="text-xl font-black font-mono text-primary">{lead.score}</div>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">{lead.next_action}</div>
                <div className="mt-3 flex gap-1 flex-wrap">
                  {lead.reasons.map((reason) => (
                    <span key={reason} className="text-[10px] border border-border px-2 py-0.5 uppercase tracking-widest">{reason}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
