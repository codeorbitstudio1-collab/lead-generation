import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Crosshair } from "@phosphor-icons/react";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const nav = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be 8+ characters");
    setLoading(true);
    try {
      await register(email, password, name);
      toast.success("Account created");
      nav("/");
    } catch (err) {
      const msg = err.response?.data?.detail || "Registration failed";
      toast.error(typeof msg === "string" ? msg : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A] text-white p-8">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-6" data-testid="register-form">
        <div className="flex items-center gap-2 justify-center">
          <Crosshair size={28} weight="bold" className="text-primary" />
          <div className="font-heading text-xl font-black tracking-tighter">LEADGEN</div>
        </div>
        <div>
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">New Operator</div>
          <h2 className="font-heading text-3xl font-black tracking-tighter mt-1">Create your account</h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Name</label>
            <Input data-testid="reg-name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-none mt-1 bg-[#121212] border-border" />
          </div>
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Email</label>
            <Input data-testid="reg-email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-none mt-1 bg-[#121212] border-border" required />
          </div>
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Password</label>
            <Input data-testid="reg-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-none mt-1 bg-[#121212] border-border" required />
          </div>
        </div>
        <Button type="submit" disabled={loading} data-testid="reg-submit" className="w-full rounded-none bg-primary hover:bg-primary/90 h-11 font-heading font-bold tracking-wider uppercase text-sm btn-sharp">
          {loading ? "Creating..." : "Create Account"}
        </Button>
        <div className="text-xs text-muted-foreground text-center">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline" data-testid="link-login">Sign in</Link>
        </div>
      </form>
    </div>
  );
}
