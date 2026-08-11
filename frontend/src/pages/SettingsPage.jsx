import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Key, CheckCircle, WarningCircle, EnvelopeSimple } from "@phosphor-icons/react";

export default function SettingsPage() {
  const [status, setStatus] = useState(null);
  const [googleKey, setGoogleKey] = useState("");
  const [gmailEmail, setGmailEmail] = useState("");
  const [gmailPass, setGmailPass] = useState("");
  const [senderName, setSenderName] = useState("");
  const [emailSignature, setEmailSignature] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/settings").then((r) => {
    setStatus(r.data);
    setGmailEmail(r.data.gmail_email || "");
    setSenderName(r.data.sender_name || "");
    setEmailSignature(r.data.email_signature || "");
  });

  useEffect(() => { load(); }, []);

  const saveGoogle = async () => {
    if (!googleKey.trim()) return toast.error("Enter a key");
    setSaving(true);
    try {
      await api.post("/settings", { google_maps_api_key: googleKey });
      toast.success("Google Maps key saved");
      setGoogleKey("");
      load();
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  const saveGmail = async () => {
    if (!gmailEmail.trim()) return toast.error("Enter your Gmail address");
    setSaving(true);
    try {
      const payload = { gmail_email: gmailEmail, sender_name: senderName, email_signature: emailSignature };
      if (gmailPass.trim()) payload.gmail_app_password = gmailPass;
      await api.post("/settings", payload);
      toast.success("Gmail settings saved");
      setGmailPass("");
      load();
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  const saveOpenAI = async () => {
    if (!openaiKey.trim()) return toast.error("Enter a key");
    setSaving(true);
    try {
      await api.post("/settings", { openai_api_key: openaiKey });
      toast.success("OpenAI API key saved");
      setOpenaiKey("");
      load();
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Configuration</div>
        <h1 className="font-heading text-4xl font-black tracking-tighter mt-1">Settings</h1>
      </div>

      {/* Google Maps API Key */}
      <div className="border border-border bg-[#121212] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Key size={20} className="text-primary" />
          <h3 className="font-heading text-xl font-bold tracking-tight">Google Maps API Key</h3>
        </div>
        {status && (
          <div className={`border p-3 mb-4 flex items-center gap-2 text-sm ${status.using_mock ? "border-[#FFCC00] bg-[#FFCC00]/10 text-[#FFCC00]" : "border-[#34C759] bg-[#34C759]/10 text-[#34C759]"}`} data-testid="api-status">
            {status.using_mock ? <WarningCircle size={18} /> : <CheckCircle size={18} />}
            <span>{status.using_mock ? "Using demo data. Add key below for live results." : `Live mode${status.masked_key ? ` — ${status.masked_key}` : ""}`}</span>
          </div>
        )}
        <p className="text-sm text-muted-foreground mb-4">
          Get key at <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="text-primary hover:underline">console.cloud.google.com</a>. Enable <span className="font-mono text-white">Places API (New)</span> + <span className="font-mono text-white">Geocoding API</span>.
        </p>
        <div className="flex gap-2">
          <Input data-testid="api-key-input" type="password" value={googleKey} onChange={(e) => setGoogleKey(e.target.value)} placeholder="AIzaSy..." className="rounded-none bg-[#0A0A0A] border-border font-mono" />
          <Button onClick={saveGoogle} disabled={saving} data-testid="save-api-key" className="rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-xs font-bold px-6">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Gmail SMTP */}
      <div className="border border-border bg-[#121212] p-6">
        <div className="flex items-center gap-2 mb-4">
          <EnvelopeSimple size={20} className="text-primary" />
          <h3 className="font-heading text-xl font-bold tracking-tight">Gmail SMTP · For Outreach</h3>
        </div>
        {status && (
          <div className={`border p-3 mb-4 flex items-center gap-2 text-sm ${status.email_configured ? "border-[#34C759] bg-[#34C759]/10 text-[#34C759]" : "border-[#FFCC00] bg-[#FFCC00]/10 text-[#FFCC00]"}`} data-testid="gmail-status">
            {status.email_configured ? <CheckCircle size={18} /> : <WarningCircle size={18} />}
            <span>{status.email_configured ? `Email configured (${status.gmail_email})` : "Not configured — add credentials to send outreach emails"}</span>
          </div>
        )}
        <p className="text-sm text-muted-foreground mb-4">
          Generate an <span className="font-mono text-white">App Password</span> at <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-primary hover:underline">myaccount.google.com/apppasswords</a> (2FA required).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Gmail Address</label>
            <Input data-testid="gmail-email-input" value={gmailEmail} onChange={(e) => setGmailEmail(e.target.value)} placeholder="you@gmail.com" className="rounded-none bg-[#0A0A0A] border-border mt-1 font-mono" />
          </div>
          <div>
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">App Password (16 chars)</label>
            <Input data-testid="gmail-pass-input" type="password" value={gmailPass} onChange={(e) => setGmailPass(e.target.value)} placeholder={status?.has_gmail_password ? "•••• already saved ••••" : "abcd efgh ijkl mnop"} className="rounded-none bg-[#0A0A0A] border-border mt-1 font-mono" />
          </div>
          <div className="md:col-span-2">
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Sender Display Name</label>
            <Input data-testid="sender-name-input" value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder='e.g. "Alex — Web Design Services"' className="rounded-none bg-[#0A0A0A] border-border mt-1" />
          </div>
          <div className="md:col-span-2">
            <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Email Signature (one line per item)</label>
            <Textarea
              data-testid="email-signature-input"
              value={emailSignature}
              onChange={(e) => setEmailSignature(e.target.value)}
              placeholder={"DevOps Engineer\nFull Stack Engineer"}
              className="rounded-none bg-[#0A0A0A] border-border mt-1 font-mono min-h-[90px]"
            />
            <p className="text-xs text-muted-foreground mt-1">Signature lines appear under your name. Leave blank to use the default: <span className="font-mono text-white">DevOps Engineer</span> / <span className="font-mono text-white">Full Stack Engineer</span>.</p>
          </div>
        </div>
        <Button onClick={saveGmail} disabled={saving} data-testid="save-gmail" className="mt-4 rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-xs font-bold">
          {saving ? "Saving..." : "Save Gmail Settings"}
        </Button>
      </div>

      {/* OpenAI API Key (for AI outreach) */}
      <div className="border border-border bg-[#121212] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Key size={20} className="text-primary" />
          <h3 className="font-heading text-xl font-bold tracking-tight">OpenAI API Key · For AI Outreach</h3>
        </div>
        <div className={`border p-3 mb-4 flex items-center gap-2 text-sm ${status?.has_openai_key ? "border-[#34C759] bg-[#34C759]/10 text-[#34C759]" : "border-[#FFCC00] bg-[#FFCC00]/10 text-[#FFCC00]"}`} data-testid="openai-status">
          {status?.has_openai_key ? <CheckCircle size={18} /> : <WarningCircle size={18} />}
          <span>{status?.has_openai_key ? "OpenAI configured — used to generate outreach emails and AI responses." : "Not configured — add an OpenAI API key to power AI email generation and the outreach assistant."}</span>
        </div>
        <div className="flex gap-2">
          <Input
            type="password"
            data-testid="openai-key-input"
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            placeholder={status?.has_openai_key ? "•••• already saved ••••" : "sk-..."}
            className="rounded-none bg-[#0A0A0A] border-border font-mono"
          />
          <Button onClick={saveOpenAI} disabled={saving} data-testid="save-openai" className="rounded-none bg-primary hover:bg-primary/90 uppercase tracking-widest text-xs font-bold px-6">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Get a key at <a href="https://platform.openai.com/" target="_blank" rel="noreferrer" className="text-primary hover:underline">platform.openai.com</a>. Used for the LLM chat model that writes outreach emails and replies to you in the AI agent chat.
        </p>
      </div>
    </div>
  );
}
