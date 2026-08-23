// Server-side chat access. The web app only holds the Supabase anon key, so
// chat writes go through PostgREST as the anon role — RLS (migration 0007)
// permits read + append on the chat tables and nothing else. All validation
// happens here in the route handlers, not in the browser.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const chatEnabled = () => Boolean(URL && KEY);

export type ChatMessage = {
  id: string;
  name: string;
  teamName: string | null;
  body: string;
  createdAt: string;
};

async function rest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY!,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

export async function listMessages(limit = 100): Promise<ChatMessage[]> {
  // Grab the most recent `limit`, then present oldest-first.
  const res = await rest(
    `chat_messages?select=id,name,team_name,body,created_at&order=created_at.desc&limit=${limit}`
  );
  if (!res.ok) throw new Error(`chat list ${res.status}`);
  const rows = (await res.json()) as Record<string, unknown>[];
  return rows
    .map((r) => ({
      id: r.id as string,
      name: r.name as string,
      teamName: (r.team_name as string) ?? null,
      body: r.body as string,
      createdAt: r.created_at as string,
    }))
    .reverse();
}

export async function insertMessage(msg: {
  email: string;
  name: string;
  teamName: string | null;
  body: string;
}): Promise<ChatMessage> {
  const res = await rest(`chat_messages`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_email: msg.email,
      name: msg.name,
      team_name: msg.teamName,
      body: msg.body,
    }),
  });
  if (!res.ok) throw new Error(`chat insert ${res.status}: ${await res.text()}`);
  const [row] = (await res.json()) as Record<string, unknown>[];
  return {
    id: row.id as string,
    name: row.name as string,
    teamName: (row.team_name as string) ?? null,
    body: row.body as string,
    createdAt: row.created_at as string,
  };
}

export async function upsertUser(u: {
  email: string;
  name: string;
  teamId: string | null;
  teamName: string | null;
}): Promise<void> {
  const res = await rest(`chat_users?on_conflict=email`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      email: u.email,
      name: u.name,
      team_id: u.teamId,
      team_name: u.teamName,
      last_seen: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`chat user upsert ${res.status}: ${await res.text()}`);
}
