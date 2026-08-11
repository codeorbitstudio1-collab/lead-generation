import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AppLayout from "@/components/AppLayout";
import AgentChat from "@/components/AgentChat";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import DashboardPage from "@/pages/DashboardPage";
import ClientDashboardPage from "@/pages/ClientDashboardPage";
import SearchPage from "@/pages/SearchPage";
import LeadsPage from "@/pages/LeadsPage";
import SchedulesPage from "@/pages/SchedulesPage";
import SettingsPage from "@/pages/SettingsPage";
import OutreachPage from "@/pages/OutreachPage";
import TemplatesPage from "@/pages/TemplatesPage";
import FreelanceProjectsPage from "@/pages/FreelanceProjectsPage";
import LinkedInDashboardPage from "@/pages/LinkedInDashboardPage";
import LinkedInProjectDetailPage from "@/pages/LinkedInProjectDetailPage";
import SetupPlannerPage from "@/pages/SetupPlannerPage";
import HelpCenterPage from "@/pages/HelpCenterPage";
import "@/App.css";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A] text-muted-foreground text-xs tracking-widest uppercase">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout>{children}<AgentChat /></AppLayout>;
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, message: "" }; }
  static getDerivedStateFromError(err) { return { hasError: true, message: err?.message || "Something went wrong" }; }
  componentDidCatch(error, info) { console.error(error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A] text-white p-8">
          <div className="max-w-md w-full">
            <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Something went wrong</div>
            <h1 className="font-heading text-2xl font-black tracking-tighter mt-2 mb-2">An error occurred on this screen</h1>
            <p className="text-sm text-muted-foreground mb-4">{this.state.message}</p>
            <button onClick={() => { this.setState({ hasError: false, message: "" }); window.location.hash = "#/"; window.location.reload(); }} className="px-4 py-2 bg-primary text-white text-xs uppercase tracking-widest font-bold rounded-none">Back to Dashboard</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/" element={<Protected><DashboardPage /></Protected>} />
            <Route path="/client-dashboard" element={<Protected><ClientDashboardPage /></Protected>} />
            <Route path="/search" element={<Protected><SearchPage /></Protected>} />
            <Route path="/leads" element={<Protected><LeadsPage /></Protected>} />
            <Route path="/outreach" element={<Protected><OutreachPage /></Protected>} />
            <Route path="/templates" element={<Protected><TemplatesPage /></Protected>} />
            <Route path="/freelance" element={<Protected><FreelanceProjectsPage /></Protected>} />
            <Route path="/linkedin" element={<Protected><LinkedInDashboardPage /></Protected>} />
            <Route path="/linkedin/:id" element={<Protected><LinkedInProjectDetailPage /></Protected>} />
            <Route path="/setup-planner" element={<Protected><SetupPlannerPage /></Protected>} />
            <Route path="/help" element={<Protected><HelpCenterPage /></Protected>} />
            <Route path="/schedules" element={<Protected><SchedulesPage /></Protected>} />
            <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="top-right" richColors closeButton />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
