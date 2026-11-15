import { connection } from "next/server";
import { GuestMessageDraft, MessagesClient, type ConversationSummary } from "@/components/MessagesClient";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ conversation?: string | string[] }> }) {
  await connection();
  const [{ supabase, user }, params] = await Promise.all([getAuthenticatedUser(), searchParams]);
  if (!supabase || !user) return <main className="messages-page"><header className="messages-header"><a href="/">← CINEVA</a><div><p className="eyebrow">PRIVATE INBOX</p><h1>Messages</h1></div><a href="/account">Account</a></header><GuestMessageDraft /></main>;
  const { data: profile } = await supabase.from("profiles").select("account_status").eq("id", user.id).maybeSingle();
  if (profile?.account_status !== "active") return <main className="auth-page"><section className="auth-card"><h1>Messaging unavailable</h1><p>Your account is not active. Contact CINEVA support if you think this is a mistake.</p></section></main>;

  const { data: rows, error } = await supabase.from("conversations")
    .select("id,conversation_type,direct_user_low,direct_user_high,updated_at")
    .order("updated_at", { ascending: false });
  const conversations: ConversationSummary[] = (rows ?? []).map((row) => ({
    id: row.id,
    type: row.conversation_type,
    otherUserId: row.direct_user_low === user.id ? row.direct_user_high : row.direct_user_low,
    updatedAt: row.updated_at,
  }));
  const ids = conversations.map((conversation) => conversation.id);
  const { data: latestMessages } = ids.length ? await supabase.from("messages").select("id,conversation_id,sender_id,body,created_at,deleted_at").in("conversation_id", ids).order("created_at", { ascending: false }).limit(300) : { data: [] };
  const previews: Record<string, string> = {};
  for (const message of latestMessages ?? []) if (!previews[message.conversation_id]) previews[message.conversation_id] = message.deleted_at ? "Message removed" : message.body?.slice(0, 100) ?? "Attachment";
  const requestedConversation = typeof params.conversation === "string" && /^[0-9a-f-]{36}$/i.test(params.conversation) ? params.conversation : undefined;
  const initialConversationId = conversations.some((conversation) => conversation.id === requestedConversation) ? requestedConversation : undefined;
  return <main className="messages-page"><header className="messages-header"><a href="/">← CINEVA</a><div><p className="eyebrow">PRIVATE INBOX</p><h1>Messages</h1></div><a href="/account">My account</a></header>{error ? <p className="auth-error" role="alert">Conversations could not be loaded.</p> : <MessagesClient initialConversations={conversations} initialPreviews={previews} initialConversationId={initialConversationId} />}</main>;
}
