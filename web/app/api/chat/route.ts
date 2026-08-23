import { NextResponse } from "next/server";
import { chatEnabled, insertMessage, listMessages } from "@/lib/chatServer";

export const dynamic = "force-dynamic";

const MAX_BODY = 500;

export async function GET() {
  if (!chatEnabled()) return NextResponse.json({ messages: [] });
  try {
    return NextResponse.json({ messages: await listMessages(120) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!chatEnabled())
    return NextResponse.json({ error: "Chat is not configured." }, { status: 503 });

  let payload: { email?: string; name?: string; teamName?: string | null; body?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const email = (payload.email ?? "").trim().toLowerCase();
  const name = (payload.name ?? "").trim();
  const body = (payload.body ?? "").trim();
  const teamName = payload.teamName?.trim() || null;

  if (!email || !name)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!body) return NextResponse.json({ error: "Say something." }, { status: 400 });
  if (body.length > MAX_BODY)
    return NextResponse.json({ error: `Keep it under ${MAX_BODY} characters.` }, { status: 400 });

  try {
    const message = await insertMessage({ email, name, teamName, body });
    return NextResponse.json({ message });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
