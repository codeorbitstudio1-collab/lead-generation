import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MagnifyingGlass, WarningCircle, MapPin } from "@phosphor-icons/react";
import CategoryCombobox from "@/components/CategoryCombobox";

const POPULAR = ["restaurant", "spa", "beauty_salon", "hotel", "cafe", "gym", "bakery", "hair_care", "moving_company", "lodging", "web_design", "digital_marketing", "software_development"];
const SOURCES = [
  { id: "maps", label: "Google Maps" },
  { id: "web", label: "Open Web" },
  { id: "directory", label: "Public Directories" },
  { id: "social", label: "Social Profiles" },
  { id: "reviews", label: "Review Platforms" },
  { id: "jobs", label: "Job Boards" },
];

const SOURCE_HINTS = {
  restaurant: ["maps", "reviews"],
  cafe: ["maps", "reviews"],
  spa: ["maps", "reviews"],
  beauty_salon: ["maps", "social"],
  web_design: ["web", "directory", "social"],
  digital_marketing: ["web", "social"],
  software_development: ["web", "social"],
  startup: ["web", "social", "jobs"],
  recruiting: ["jobs", "web"],
  hiring: ["jobs", "web"],
  moving_company: ["maps", "directory"],
  plumber: ["maps", "directory"],
  electrician: ["maps", "directory"],
};

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const [location, setLocation] = useState(searchParams.get("location") || "");
  const [category, setCategory] = useState(searchParams.get("category") || "restaurant");
  const [radius, setRadius] = useState(5000);
  const [noWebsiteOnly, setNoWebsiteOnly] = useState(searchParams.get("no_website") === "1");
  const [selectedSources, setSelectedSources] = useState(["maps"]);
  const [sourceTab, setSourceTab] = useState("combined");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [activeSourceTab, setActiveSourceTab] = useState("all");
  const nav = useNavigate();

  const onSearch = async (e) => {
    e.preventDefault();
    if (!location.trim()) return toast.error("Enter a location");
    if (selectedSources.length === 0) return toast.error("Choose at least one source");
    setLoading(true);
    try {
      const { data } = await api.post("/search", { location, category, radius_meters: Number(radius), no_website_only: noWebsiteOnly, discovery_modes: selectedSources, discovery_mode: selectedSources.length === 1 ? selectedSources[0] : "all" });
      setResult(data);
      setActiveSourceTab("all");
      if (data.is_mock) toast.warning("Demo data — add Google API key in Settings");
      else toast.success(`Found ${data.results.length} businesses`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const toggleSource = (id) => {
    setSelectedSources((prev) => {
      if (id === "all") return prev.length === SOURCES.length ? [] : SOURCES.map((s) => s.id);
      const next = prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id];
      return next.filter((v, i, arr) => arr.indexOf(v) === i);
    });
  };

  const selectRecommended = () => setSelectedSources(sourceHint);
  const selectAllSources = () => setSelectedSources(SOURCES.map((s) => s.id));
  const clearSources = () => setSelectedSources([]);

  const sourceHint = SOURCE_HINTS[category] || ["maps", "web"];
  const groupedResults = result?.results ? result.results.reduce((acc, item) => {
    const mode = item.source_mode || item.source || "other";
    if (!acc[mode]) acc[mode] = [];
    acc[mode].push(item);
    return acc;
  }, {}) : {};
  const tabList = ["all", ...SOURCES.map((s) => s.id)];
  const visibleResults = activeSourceTab === "all" ? (result?.results || []) : (groupedResults[activeSourceTab] || []);

  return (
    <div className="p-8 space-y-8">
      <div>
        <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Prospect</div>
        <h1 className="font-heading text-4xl font-black tracking-tighter mt-1">New Search</h1>
      </div>

      <form onSubmit={onSearch} className="border border-border bg-[#121212] p-6 space-y-4" data-testid="search-form">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-5">
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Location</label>
            <div className="relative mt-1">
              <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                data-testid="search-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Bangalore, Chandigarh, Mumbai"
                className="rounded-none bg-[#0A0A0A] border-border pl-9"
              />
            </div>
          </div>
          <div className="md:col-span-4">
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Category</label>
            <div className="mt-1">
              <CategoryCombobox value={category} onChange={setCategory} dataTestId="search-category" placeholder="All categories" />
            </div>
          </div>
          <div className="md:col-span-3">
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Radius (m)</label>
            <Input
              data-testid="search-radius"
              type="number"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              className="rounded-none bg-[#0A0A0A] border-border mt-1"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none" data-testid="no-website-toggle">
            <input
              type="checkbox"
              checked={noWebsiteOnly}
              onChange={(e) => setNoWebsiteOnly(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-xs uppercase tracking-widest">Only businesses without a website (hot leads)</span>
          </label>
        </div>

        <Tabs value={sourceTab} onValueChange={setSourceTab} className="space-y-4">
          <TabsList className="w-full h-auto flex flex-wrap gap-2 bg-transparent p-0 justify-start">
            <TabsTrigger value="combined" className="rounded-none border border-border data-[state=active]:border-primary data-[state=active]:bg-primary/10 uppercase tracking-widest text-[10px] px-3 py-2">Combined</TabsTrigger>
            {SOURCES.map((src) => (
              <TabsTrigger key={src.id} value={src.id} className="rounded-none border border-border data-[state=active]:border-primary data-[state=active]:bg-primary/10 uppercase tracking-widest text-[10px] px-3 py-2">{src.label}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="combined" className="mt-0 border border-border bg-[#0A0A0A] p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Selected sources</div>
                <div className="text-sm text-white mt-1">{selectedSources.length ? selectedSources.map((id) => SOURCES.find((s) => s.id === id)?.label).filter(Boolean).join(", ") : "None selected"}</div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={selectRecommended} className="px-3 py-2 text-xs uppercase tracking-widest border border-primary text-primary">Recommended</button>
                <button type="button" onClick={selectAllSources} className="px-3 py-2 text-xs uppercase tracking-widest border border-border text-muted-foreground">All</button>
                <button type="button" onClick={clearSources} className="px-3 py-2 text-xs uppercase tracking-widest border border-border text-muted-foreground">Clear</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2" data-testid="search-source-group">
              {SOURCES.map((src) => (
                <label key={src.id} className={`flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-widest border cursor-pointer ${selectedSources.includes(src.id) ? "border-primary text-white bg-primary/10" : "border-border text-muted-foreground"}`}>
                  <Checkbox checked={selectedSources.includes(src.id)} onCheckedChange={() => toggleSource(src.id)} className="rounded-none" />
                  {src.label}
                </label>
              ))}
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              Combined mode runs every selected source together and merges the results into one pipeline.
            </div>
          </TabsContent>

          {SOURCES.map((src) => (
            <TabsContent key={src.id} value={src.id} className="mt-0 border border-border bg-[#0A0A0A] p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Source Tab</div>
                  <div className="font-heading text-lg font-bold mt-1">{src.label}</div>
                </div>
                <button type="button" onClick={() => toggleSource(src.id)} className="px-3 py-2 text-xs uppercase tracking-widest border border-border text-muted-foreground">{selectedSources.includes(src.id) ? "Disable" : "Enable"}</button>
              </div>
              {src.id === "maps" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="border border-border p-3">
                    <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Radius</div>
                    <Input type="number" value={radius} onChange={(e) => setRadius(e.target.value)} className="rounded-none bg-[#121212] border-border mt-2" />
                  </div>
                  <div className="border border-border p-3 text-muted-foreground leading-relaxed">
                    Best for local businesses, physical locations, and website-less prospects.
                  </div>
                </div>
              )}
              {src.id === "web" && <div className="text-sm text-muted-foreground leading-relaxed">Best when you want public websites, contact pages, and broader category coverage.</div>}
              {src.id === "directory" && <div className="text-sm text-muted-foreground leading-relaxed">Best for directory listings and alternate discovery when Maps is weak.</div>}
              {src.id === "social" && <div className="text-sm text-muted-foreground leading-relaxed">Best for brand pages, founder discovery, and social presence signals.</div>}
              {src.id === "reviews" && <div className="text-sm text-muted-foreground leading-relaxed">Best for active businesses with strong reputation and intent signals.</div>}
              {src.id === "jobs" && <div className="text-sm text-muted-foreground leading-relaxed">Best for companies actively hiring, which often indicates growth and budget for services.</div>}
              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={() => toggleSource(src.id)} className="px-3 py-2 text-xs uppercase tracking-widest border border-border text-muted-foreground">{selectedSources.includes(src.id) ? "Disable" : "Enable"}</button>
                <button type="button" onClick={selectRecommended} className="px-3 py-2 text-xs uppercase tracking-widest border border-primary text-primary">Use Recommended</button>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <div className="border border-border bg-[#0A0A0A] p-3 text-xs text-muted-foreground leading-relaxed">
          Recommended for <span className="text-white uppercase tracking-widest">{category.replace(/_/g, " ")}</span>: <span className="text-primary uppercase tracking-widest">{sourceHint.map((s) => SOURCES.find((x) => x.id === s)?.label || s).join(", ")}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground py-2">Quick:</span>
            {POPULAR.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setCategory(p)}
                data-testid={`quick-${p}`}
                className={`px-2 py-1 text-xs border ${category === p ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-white"}`}
              >
                {p.replace(/_/g, " ")}
              </button>
            ))}
          </div>
          <Button type="submit" disabled={loading} data-testid="search-submit" className="rounded-none bg-primary hover:bg-primary/90 h-11 px-6 font-heading font-bold tracking-wider uppercase btn-sharp">
            <MagnifyingGlass size={16} className="mr-2" />
            {loading ? "Fetching..." : "Fetch Leads"}
          </Button>
        </div>
      </form>

      {result && (
        <div className="border border-border bg-[#121212] p-6" data-testid="search-results">
          {result.is_mock && (
            <div className="border border-[#FFCC00] bg-[#FFCC00]/10 p-3 mb-4 flex items-center gap-2 text-sm">
              <WarningCircle size={18} className="text-[#FFCC00]" />
              <span>Showing demo data. Add your Google Maps API key in Settings for live results.</span>
            </div>
          )}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Results</div>
              <h3 className="font-heading text-xl font-bold tracking-tight mt-1">
                {result.search.total_found} businesses · <span className="text-[#FF3B30]">{result.search.hot_leads} hot leads</span>
              </h3>
              {result.source_summary && (
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                  {Object.entries(result.source_summary).map(([k, v]) => (
                    <span key={k} className="border border-border px-2 py-1">
                      {k}: {v}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={() => nav("/leads")} data-testid="view-all-leads" className="rounded-none bg-white text-black hover:bg-white/90 uppercase tracking-widest text-xs font-bold">
              View in Leads →
            </Button>
          </div>
          <Tabs value={activeSourceTab} onValueChange={setActiveSourceTab} className="space-y-4">
            <TabsList className="w-full h-auto flex flex-wrap gap-2 bg-transparent p-0 justify-start">
              {tabList.map((tab) => (
                <TabsTrigger key={tab} value={tab} className="rounded-none border border-border data-[state=active]:border-primary data-[state=active]:bg-primary/10 uppercase tracking-widest text-[10px] px-3 py-2">
                  {tab === "all" ? `All (${result.results.length})` : `${tab} (${groupedResults[tab]?.length || 0})`}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value={activeSourceTab} className="mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {visibleResults.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No results in this bucket.</div>
                ) : visibleResults.map((r, idx) => (
                  <div key={r.place_id || idx} className="border border-border p-4 animate-in-up" style={{ animationDelay: `${idx * 40}ms` }}>
                    <div className="flex items-start justify-between mb-2 gap-2">
                      <div className="font-heading font-bold text-base leading-tight">{r.name}</div>
                      {!r.website ? (
                        <span className="text-[10px] tracking-widest uppercase bg-[#FF3B30] text-white px-2 py-0.5 shrink-0">Hot</span>
                      ) : (
                        <span className="text-[10px] tracking-widest uppercase bg-[#34C759] text-black px-2 py-0.5 shrink-0">Web</span>
                      )}
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-primary mb-1">{r.source_mode || r.source || "source"}</div>
                    <div className="text-xs text-muted-foreground mb-3">{r.address}</div>
                    <div className="text-xs font-mono space-y-1">
                      {r.phone && <div>📞 {r.phone}</div>}
                      {r.rating && <div className="text-[#FFCC00]">★ {r.rating} ({r.user_ratings_total || 0})</div>}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
