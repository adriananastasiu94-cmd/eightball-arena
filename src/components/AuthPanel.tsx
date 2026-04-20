"use client";

import { useState } from "react";
import { api } from "@/lib/api";

type AuthUser = { id: string; username: string; email: string };

type Props = {
  onAuthed: (user: AuthUser) => void;
};

export function AuthPanel({ onAuthed }: Props) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      const url = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
      const payload = mode === "login" ? { email, password } : { email, username, password };
      const data = await api<{ user: AuthUser }>(url, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      onAuthed(data.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-slate/80 p-6 shadow-glow">
      <h1 className="text-2xl font-semibold tracking-tight text-white">Eightball Arena</h1>
      <p className="mt-2 text-sm text-white/70">Original competitive web pool built for smooth, fair 1v1 matches.</p>

      <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-1">
        <button onClick={() => setMode("login")} className={`rounded-lg px-3 py-2 text-sm ${mode === "login" ? "bg-white/20 text-white" : "text-white/70"}`}>
          Login
        </button>
        <button onClick={() => setMode("signup")} className={`rounded-lg px-3 py-2 text-sm ${mode === "signup" ? "bg-white/20 text-white" : "text-white/70"}`}>
          Sign Up
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <input className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {mode === "signup" && (
          <input className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
        )}
        <input className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>

      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

      <button onClick={submit} disabled={loading} className="mt-5 w-full rounded-xl bg-brass px-4 py-2 font-medium text-slate disabled:opacity-60">
        {loading ? "Please wait..." : mode === "login" ? "Enter Arena" : "Create Account"}
      </button>
    </div>
  );
}