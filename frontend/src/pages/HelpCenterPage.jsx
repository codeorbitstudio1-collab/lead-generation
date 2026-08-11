import React from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const FLOW = [
  { step: "1", title: "Choose a source", body: "Use Google Maps, Open Web, or Public Directories depending on the category and market." },
  { step: "2", title: "Search and filter", body: "Set location, category, radius, and website filters to find the right prospects." },
  { step: "3", title: "Review priority queue", body: "Work the highest-score leads first so time goes to the best opportunities." },
  { step: "4", title: "Enrich and contact", body: "Discover emails, log calls, send outreach, and update lead status." },
  { step: "5", title: "Convert to client", body: "When a lead is ready, move it into the client dashboard and track delivery." },
];

const SECTIONS = [
  {
    title: "Lead Generation",
    items: [
      { name: "New Search", text: "Find leads by category and location. Choose Maps, Web, or Directory source." },
      { name: "Priority Queue", text: "Shows the best leads first based on website, email, rating, freshness, and outreach history." },
      { name: "Leads", text: "Manage all lead records, add notes, update emails, bulk edit, and delete." },
    ],
  },
  {
    title: "Outreach",
    items: [
      { name: "Outreach", text: "Track sent emails, replies, and per-lead contact history." },
      { name: "Templates", text: "Create reusable email templates and A/B groups for testing." },
      { name: "Setup Planner", text: "Generate a campaign plan, checklist, and draft outreach from a new brief." },
    ],
  },
  {
    title: "Operations",
    items: [
      { name: "Schedules", text: "Run recurring searches automatically at a chosen UTC time." },
      { name: "Client Dashboard", text: "Track converted work, payments, onboarding, and contracts." },
      { name: "Settings", text: "Store API keys and email credentials needed for live searching and outreach." },
    ],
  },
  {
    title: "Special Pipelines",
    items: [
      { name: "Freelance", text: "Discover and manage freelance project opportunities and enrich company contacts." },
      { name: "LinkedIn", text: "Track contract roles, status, and contact enrichment for LinkedIn-based leads." },
      { name: "Dashboard", text: "High-level metrics and recent search history for quick review." },
    ],
  },
];

export default function HelpCenterPage() {
  return (
    <TooltipProvider>
    <div className="p-8 space-y-8 max-w-6xl">
      <div>
        <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Help Center</div>
        <h1 className="font-heading text-4xl font-black tracking-tighter mt-1">How to use the platform</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
          This page explains the full workflow, every major feature, and how the team should use the system to generate and close leads.
        </p>
      </div>

      <section className="border border-border bg-[#121212] p-6">
        <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Recommended Flow</div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4">
          {FLOW.map((item) => (
            <div key={item.step} className="border border-border bg-[#0A0A0A] p-4">
              <div className="text-[10px] uppercase tracking-widest text-primary">Step {item.step}</div>
              <div className="font-heading text-lg font-bold mt-1">{item.title}</div>
              <div className="text-sm text-muted-foreground mt-2 leading-relaxed">{item.body}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="border border-border bg-[#121212] p-6">
        <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Flow Map</div>
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-5 gap-3 items-stretch">
          {[
            ["Sources", "Maps, Web, Directory"],
            ["Search", "Location + category"],
            ["Score", "Hot leads first"],
            ["Contact", "Email, calls, notes"],
            ["Convert", "Client pipeline"],
          ].map((item, idx) => (
            <div key={item[0]} className="relative border border-border bg-[#0A0A0A] p-4">
              <div className="text-[10px] uppercase tracking-widest text-primary">0{idx + 1}</div>
              <div className="font-heading text-lg font-bold mt-1">{item[0]}</div>
              <div className="text-sm text-muted-foreground mt-2 leading-relaxed">{item[1]}</div>
              {idx < 4 && <div className="hidden lg:block absolute top-1/2 -right-3 w-6 h-px bg-border" />}
            </div>
          ))}
        </div>
      </section>

      <section className="border border-border bg-[#121212] p-6">
        <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Feature Guide</div>
        <Accordion type="single" collapsible className="mt-4 space-y-3">
          {SECTIONS.map((section) => (
            <AccordionItem key={section.title} value={section.title} className="border border-border px-4 bg-[#0A0A0A]">
              <AccordionTrigger className="text-left font-heading text-xl font-bold tracking-tight py-4 hover:no-underline">{section.title}</AccordionTrigger>
              <AccordionContent className="pb-4">
                <div className="space-y-3">
                  {section.items.map((item) => (
                    <div key={item.name} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                      <div className="text-sm font-semibold">{item.name}</div>
                      <div className="text-sm text-muted-foreground mt-1 leading-relaxed">{item.text}</div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-border bg-[#121212] p-6">
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Lead Sources in Detail</div>

          <div className="mt-4 border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#0A0A0A] text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Source</th>
                  <th className="text-left p-3">Best Use</th>
                  <th className="text-left p-3">Data Strength</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="p-3 font-medium">Google Maps</td>
                  <td className="p-3 text-muted-foreground">Fast local prospecting</td>
                  <td className="p-3 text-muted-foreground">Business details, ratings, phone, website</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="p-3 font-medium">Open Web</td>
                  <td className="p-3 text-muted-foreground">Website and contact discovery</td>
                  <td className="p-3 text-muted-foreground">Public site links, emails, contact pages</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="p-3 font-medium">Public Directories</td>
                  <td className="p-3 text-muted-foreground">Backup discovery and volume expansion</td>
                  <td className="p-3 text-muted-foreground">Directory listings, linked sites, public contacts</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="p-3 font-medium">Social Profiles</td>
                  <td className="p-3 text-muted-foreground">Brand and founder discovery</td>
                  <td className="p-3 text-muted-foreground">LinkedIn, Facebook, Instagram, and social profile URLs</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="p-3 font-medium">Review Platforms</td>
                  <td className="p-3 text-muted-foreground">High-intent businesses with active presence</td>
                  <td className="p-3 text-muted-foreground">Yelp, TripAdvisor, Trustpilot, and Clutch-style listings</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="p-3 font-medium">Job Boards</td>
                  <td className="p-3 text-muted-foreground">Growth and hiring signals</td>
                  <td className="p-3 text-muted-foreground">Greenhouse, Lever, Workable, Ashby, and similar hiring pages</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-4 space-y-5">
            <div className="border border-border bg-[#0A0A0A] p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="font-heading text-lg font-bold">Google Maps</div>
                <span className="text-[10px] uppercase tracking-widest text-primary border border-primary px-2 py-0.5">Local Search</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Use this when you want real local businesses by city, neighborhood, or service area. It is the fastest way to build a list of nearby prospects and it is strongest for service businesses, shops, agencies, clinics, restaurants, and any category with a physical presence.
              </p>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="border border-border p-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Best for</div>
                  <div className="mt-1">High-volume local prospecting, website-less leads, and quick category scans.</div>
                </div>
                <div className="border border-border p-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">What you get</div>
                  <div className="mt-1">Business name, address, phone, website, rating, review count, and discovered email if available.</div>
                </div>
              </div>
              <div className="mt-3 text-sm text-muted-foreground leading-relaxed">
                Use `Only businesses without a website` when the offer is about building websites, SEO, or outreach to businesses that are likely missing digital presence.
              </div>
            </div>

            <div className="border border-border bg-[#0A0A0A] p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="font-heading text-lg font-bold">Open Web</div>
                <span className="text-[10px] uppercase tracking-widest text-[#34C759] border border-[#34C759] px-2 py-0.5">Website Prospecting</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Use this when you need a wider net than Maps. It searches public web results for businesses in a category and tries to find their site and contact details. This is useful for niches where businesses are active online but not always easy to find through Maps alone.
              </p>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="border border-border p-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Best for</div>
                  <div className="mt-1">Service categories, agencies, niche companies, and public contact discovery.</div>
                </div>
                <div className="border border-border p-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">What you get</div>
                  <div className="mt-1">Public website links plus emails discovered from contact pages when available.</div>
                </div>
              </div>
              <div className="mt-3 text-sm text-muted-foreground leading-relaxed">
                Use this source when you want a category-based list and you care more about contact data than map location ranking.
              </div>
            </div>

            <div className="border border-border bg-[#0A0A0A] p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="font-heading text-lg font-bold">Public Directories</div>
                <span className="text-[10px] uppercase tracking-widest text-[#FFCC00] border border-[#FFCC00] px-2 py-0.5">Directory Mining</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Use this when you want to mine public directory-style listings. It is good for categories where users actively list businesses in directory sites and where the same business may appear in multiple indexed places.
              </p>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="border border-border p-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Best for</div>
                  <div className="mt-1">Alternative discovery when Maps coverage is thin or too competitive.</div>
                </div>
                <div className="border border-border p-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">What you get</div>
                  <div className="mt-1">Directory listing pages, public site links, and any contact details exposed on the listing or linked site.</div>
                </div>
              </div>
              <div className="mt-3 text-sm text-muted-foreground leading-relaxed">
                Use it as a backup and expansion source when your main search source is not giving enough volume.
              </div>
            </div>

            <div className="border border-border bg-[#0A0A0A] p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="font-heading text-lg font-bold">Social Profiles</div>
                <span className="text-[10px] uppercase tracking-widest text-[#007AFF] border border-[#007AFF] px-2 py-0.5">Brand Discovery</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Use this for finding company pages, founders, and active brand profiles on social platforms. It is helpful when you want to identify businesses that are visible online but may not have a strong website.
              </p>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="border border-border p-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Best for</div>
                  <div className="mt-1">B2B prospecting, agencies, creators, and founder-led businesses.</div>
                </div>
                <div className="border border-border p-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">What you get</div>
                  <div className="mt-1">Profile URLs and public brand discovery signals you can use for manual outreach.</div>
                </div>
              </div>
            </div>

            <div className="border border-border bg-[#0A0A0A] p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="font-heading text-lg font-bold">Review Platforms</div>
                <span className="text-[10px] uppercase tracking-widest text-[#AF52DE] border border-[#AF52DE] px-2 py-0.5">Intent Signal</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Use this when you want businesses that already care about reputation and customer feedback. Review platforms can surface businesses with active operations and strong intent to improve their digital presence.
              </p>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="border border-border p-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Best for</div>
                  <div className="mt-1">Higher-intent prospects, service businesses, hospitality, and reputation-focused categories.</div>
                </div>
                <div className="border border-border p-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">What you get</div>
                  <div className="mt-1">Review pages, listing URLs, and a strong signal that the business is active online.</div>
                </div>
              </div>
            </div>

            <div className="border border-border bg-[#0A0A0A] p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="font-heading text-lg font-bold">Job Boards</div>
                <span className="text-[10px] uppercase tracking-widest text-[#34C759] border border-[#34C759] px-2 py-0.5">Buying Signal</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Use this source when a company is actively hiring. Hiring usually means growth, budget, and a real need for support services, tools, or marketing.
              </p>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="border border-border p-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Best for</div>
                  <div className="mt-1">B2B outreach, agencies, software services, and growth-stage targets.</div>
                </div>
                <div className="border border-border p-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">What you get</div>
                  <div className="mt-1">Hiring pages, company career links, and a strong growth signal for outreach.</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border border-border bg-[#121212] p-6">
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">What To Do First</div>
          <ol className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground list-decimal pl-5">
            <li>Set API keys and email settings in `Settings`.</li>
            <li>Run a search for the target category and location.</li>
            <li>Use the priority queue to work the best leads first.</li>
            <li>Send outreach and log every reply or call.</li>
            <li>Move converted leads into the client pipeline.</li>
          </ol>
        </div>
      </section>

      <section className="border border-border bg-[#121212] p-6">
        <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Email Rules</div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-border bg-[#0A0A0A] p-4">
            <div className="font-heading text-lg font-bold">Different body per source</div>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              The email body should change depending on where the lead came from. For example, Maps leads should sound local, Social leads should mention brand presence, and Job Board leads should sound growth-oriented.
            </p>
          </div>
          <div className="border border-border bg-[#0A0A0A] p-4">
            <div className="font-heading text-lg font-bold">Same signature for all</div>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Keep one signature block for every email. Use this format (customize it in <span className="text-white">Settings</span>):
            </p>
            <div className="mt-3 border border-border p-3 text-sm leading-relaxed bg-[#121212]">
              <div>Your Name</div>
              <div>DevOps Engineer</div>
              <div>Full Stack Engineer</div>
              <div>your@email.com</div>
            </div>
          </div>
        </div>
      </section>
    </div>
    </TooltipProvider>
  );
}
