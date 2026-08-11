import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { MagnifyingGlass, Table, ChartBar, Clock, GearSix, SignOut, Crosshair, EnvelopeSimple, FileText, CurrencyDollar, Briefcase, LinkedinLogo, BookOpenText } from "@phosphor-icons/react";

const NAV = [
  { to: "/", label: "Lead Dashboard", icon: ChartBar, testId: "nav-dashboard" },
  { to: "/client-dashboard", label: "Client Dashboard", icon: CurrencyDollar, testId: "nav-client-dashboard" },
  { to: "/setup-planner", label: "Setup Planner", icon: Crosshair, testId: "nav-setup-planner" },
  { to: "/search", label: "New Search", icon: MagnifyingGlass, testId: "nav-search" },
  { to: "/leads", label: "Leads", icon: Table, testId: "nav-leads" },
  { to: "/outreach", label: "Outreach", icon: EnvelopeSimple, testId: "nav-outreach" },
  { to: "/templates", label: "Templates", icon: FileText, testId: "nav-templates" },
  { to: "/freelance", label: "Freelance", icon: Briefcase, testId: "nav-freelance" },
  { to: "/linkedin", label: "LinkedIn", icon: LinkedinLogo, testId: "nav-linkedin" },
  { to: "/schedules", label: "Schedules", icon: Clock, testId: "nav-schedules" },
  { to: "/help", label: "Help Center", icon: BookOpenText, testId: "nav-help" },
  { to: "/settings", label: "Settings", icon: GearSix, testId: "nav-settings" },
];

const Sidebar = () => {
  const { user, logout } = useAuth();
  return (
    <aside className="w-60 border-r border-border bg-[#0A0A0A] flex flex-col h-screen sticky top-0" data-testid="app-sidebar">
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-2">
          <Crosshair size={24} weight="bold" className="text-primary" />
          <div>
            <div className="font-heading text-lg font-black tracking-tighter leading-none">LEADGEN</div>
            <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mt-1">COMMAND CENTER</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 py-4">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              data-testid={item.testId}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-3 text-sm font-medium border-l-2 transition-colors ${
                  isActive
                    ? "border-primary bg-[#121212] text-white"
                    : "border-transparent text-muted-foreground hover:text-white hover:bg-[#121212]"
                }`
              }
            >
              <Icon size={18} weight="regular" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
      <div className="p-4 border-t border-border">
        <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-2">Operator</div>
        <div className="text-sm font-medium truncate" data-testid="user-email">{user?.email}</div>
        <button
          onClick={logout}
          data-testid="logout-btn"
          className="mt-3 w-full flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-widest border border-border hover:bg-[#121212] btn-sharp"
        >
          <SignOut size={14} />
          Sign Out
        </button>
      </div>
    </aside>
  );
};

export default function AppLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-[#0A0A0A] text-white">
      <Sidebar />
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
