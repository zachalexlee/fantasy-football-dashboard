"use client";

import { useEffect, useRef, useState } from "react";
import { timeAgo } from "@/lib/format";

type TeamOption = { id: string; name: string; ownerName: string | null };
type Identity = { name: string; email: string; teamId: string | null; teamName: string | null };
type Message = { id: string; name: string; teamName: string | null; body: string; createdAt: string };

const STORAGE_KEY = "ffl_chat_identity_v1";

function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}

// A stable per-name color so each manager reads consistently in the thread.
function hue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

function LoginForm({
  teams,
  onDone,
}: {
  teams: TeamOption[];
  onDone: (id: Identity) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [teamId, setTeamId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const teamName = teams.find((t) => t.id === teamId)?.name ?? null;
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, teamId: teamId || null, teamName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sign-in failed.");
      const id: Identity = { name: name.trim(), email: email.trim().toLowerCase(), teamId: teamId || null, teamName };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(id));
      } catch {
        /* private mode — identity just won't persist */
      }
      onDone(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mx-auto max-w-sm space-y-3 p-5">
      <div>
        <h3 className="font-bold">Join the smack talk</h3>
        <p className="text-xs text-muted">Just a name, email, and your team so everyone knows who&apos;s who.</p>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink2">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full rounded-lg border border-hairline bg-surface px-3 py-2 outline-none focus:border-accent"
          placeholder="Your name"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink2">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-lg border border-hairline bg-surface px-3 py-2 outline-none focus:border-accent"
          placeholder="you@email.com"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-ink2">Your team</span>
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="w-full rounded-lg border border-hairline bg-surface px-3 py-2 outline-none focus:border-accent"
        >
          <option value="">Pick your team…</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.ownerName ? ` — ${t.ownerName}` : ""}
            </option>
          ))}
        </select>
      </label>
      {err && <p className="text-sm text-bad">{err}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-accent px-3 py-2 font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Joining…" : "Enter the chat"}
      </button>
    </form>
  );
}

export default function ChatRoom({ teams }: { teams: TeamOption[] }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIdentity(loadIdentity());
    setReady(true);
  }, []);

  // Poll for new messages while signed in.
  useEffect(() => {
    if (!identity) return;
    let alive = true;
    async function pull() {
      try {
        const res = await fetch("/api/chat", { cache: "no-store" });
        const data = await res.json();
        if (alive && res.ok) setMessages(data.messages ?? []);
      } catch {
        /* keep last-good */
      }
    }
    pull();
    const t = setInterval(pull, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [identity]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = input.trim();
    if (!body || !identity) return;
    setSending(true);
    setErr(null);
    // Optimistic append.
    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      name: identity.name,
      teamName: identity.teamName,
      body,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setInput("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identity.email, name: identity.name, teamName: identity.teamName, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Message failed.");
      setMessages((m) => m.map((x) => (x.id === optimistic.id ? data.message : x)));
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setInput(body);
      setErr(e instanceof Error ? e.message : "Message failed.");
    } finally {
      setSending(false);
    }
  }

  function signOut() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setIdentity(null);
    setMessages([]);
  }

  if (!ready) return null;
  if (!identity) return <LoginForm teams={teams} onDone={setIdentity} />;

  return (
    <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-hairline bg-surface">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
        <div className="text-sm">
          <span className="font-semibold">{identity.name}</span>
          {identity.teamName && <span className="text-muted"> · {identity.teamName}</span>}
        </div>
        <button onClick={signOut} className="text-xs font-semibold text-muted hover:text-ink">
          Sign out
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="pt-8 text-center text-sm text-muted">
            No trash talk yet. Be the first to pop off. 🏈
          </p>
        )}
        {messages.map((m) => {
          const mine = m.name === identity.name && m.teamName === identity.teamName;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <div className="mb-0.5 flex items-baseline gap-1.5 text-xs">
                <span className="font-bold" style={{ color: `hsl(${hue(m.name)} 70% 45%)` }}>
                  {m.name}
                </span>
                {m.teamName && <span className="text-muted">{m.teamName}</span>}
                <span className="text-muted">· {timeAgo(m.createdAt)}</span>
              </div>
              <div
                className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                  mine ? "bg-accent text-white" : "bg-surface2 text-ink"
                }`}
              >
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="border-t border-hairline p-3">
        {err && <p className="mb-2 text-xs text-bad">{err}</p>}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={500}
            placeholder="Talk your talk…"
            className="flex-1 rounded-full border border-hairline bg-surface px-4 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
