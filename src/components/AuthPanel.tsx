"use client";

import { useState } from "react";
import { api } from "@/lib/api";

type AuthUser = { id: string; username: string; email: string };

type Props = {
  onAuthed: (user: AuthUser) => void;
};

export function AuthPanel({ onAuthed }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      const url = "/api/auth/chat-login";
      const payload = { email, password };
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
      <p className="mt-2 text-sm text-white/70">Sign in with your Chat account to use the same identity and profile.</p>

      <div className="mt-4 space-y-3">
        <input className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>

      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

      <button onClick={submit} disabled={loading} className="mt-5 w-full rounded-xl bg-brass px-4 py-2 font-medium text-slate disabled:opacity-60">
        {loading ? "Please wait..." : "Enter Arena"}
      </button>
    </div>
  );
}
