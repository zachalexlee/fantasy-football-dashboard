import { NextResponse } from "next/server";
import { chatEnabled, upsertUser } from "@/lib/chatServer";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  if (!chatEnabled())
    return NextResponse.json({ error: "Chat is not configured." }, { status: 503 });

  let payload: { name?: string; email?: string; teamId?: string | null; teamName?: string | null };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const name = (payload.name ?? "").trim();
  const email = (payload.email ?? "").trim().toLowerCase();
  const teamId = payload.teamId?.trim() || null;
  const teamName = payload.teamName?.trim() || null;

  if (!name) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  if (!EMAIL_RE.test(email))
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });

  try {
    await upsertUser({ email, name, teamId, teamName });
    return NextResponse.json({ user: { name, email, teamId, teamName } });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
