import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Crosshair } from "@phosphor-icons/react";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@leadfinder.io");
  const [password, setPassword] = useState("Admin@123");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Signed in");
      nav("/");
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || "Login failed";
      toast.error(typeof msg === "string" ? msg : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#0A0A0A] text-white">
      <div className="hidden lg:flex flex-1 relative overflow-hidden border-r border-border">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "url(https://images.unsplash.com/photo-1645668160759-55565bd94987?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAxODF8MHwxfHNlYXJjaHwzfHxkYXJrJTIwdGFjdGljYWwlMjBhYnN0cmFjdCUyMGJhY2tncm91bmR8ZW58MHx8fHwxNzg1MTAzMzY4fDA&ixlib=rb-4.1.0&q=85)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0A0A0A]" />
        <div className="relative z-10 p-12 flex flex-col justify-between">
          <div className="flex items-center gap-2">
            <Crosshair size={28} weight="bold" className="text-primary" />
            <div className="font-heading text-xl font-black tracking-tighter">LEADGEN</div>
          </div>
          <div>
            <h1 className="font-heading text-5xl font-black tracking-tighter leading-none">
              STOP<br />SEARCHING.<br />
              <span className="text-primary">START CLOSING.</span>
            </h1>
            <p className="mt-6 text-muted-foreground max-w-md text-sm leading-relaxed">
              Automated Google Maps prospecting. Find local businesses without websites in seconds. Schedule daily 10AM sweeps. Convert cold outreach into closed deals.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-4">
              {["MAPS API", "AUTO SWEEP", "CSV EXPORT"].map((t) => (
                <div key={t} className="border border-border p-3">
                  <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Feature</div>
                  <div className="text-xs font-mono mt-1">{t}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-6" data-testid="login-form">
          <div>
            <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Access</div>
            <h2 className="font-heading text-3xl font-black tracking-tighter mt-1">Sign in to your command center</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Email</label>
              <Input
                data-testid="login-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="rounded-none mt-1 bg-[#121212] border-border"
                required
              />
            </div>
            <div>
              <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Password</label>
              <Input
                data-testid="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="rounded-none mt-1 bg-[#121212] border-border"
                required
              />
            </div>
          </div>
          <Button
            type="submit"
            disabled={loading}
            data-testid="login-submit"
            className="w-full rounded-none bg-primary hover:bg-primary/90 h-11 font-heading font-bold tracking-wider uppercase text-sm btn-sharp"
          >
            {loading ? "Signing in..." : "Enter"}
          </Button>
          <div className="text-xs text-muted-foreground text-center">
            No account?{" "}
            <Link to="/register" className="text-primary hover:underline" data-testid="link-register">
              Create one
            </Link>
          </div>
          <div className="border border-border p-3 text-[10px] tracking-widest uppercase text-muted-foreground">
            Demo · admin@leadfinder.io / Admin@123
          </div>
        </form>
      </div>
    </div>
  );
}
