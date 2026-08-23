import ChatRoom from "@/components/ChatRoom";
import { getBundle } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Chat() {
  const bundle = await getBundle();
  const teams = [...bundle.teams]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({ id: t.id, name: t.name, ownerName: t.ownerName ?? null }));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight">League Chat</h2>
        <p className="text-sm text-ink2">
          Smack talk central — sign in with your name and team so everyone knows who&apos;s
          running their mouth.
        </p>
      </div>

      <ChatRoom teams={teams} />

      {bundle.demo && (
        <p className="text-xs text-muted">
          Demo mode: chat needs the live league connected so real team names populate the sign-in.
        </p>
      )}
    </div>
  );
}
