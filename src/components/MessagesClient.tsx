"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { clearGuestMessageDraft, readGuestMessageDraft, writeGuestMessageDraft } from "@/lib/guest-persistence";
import Link from "next/link";

export type ConversationSummary = { id: string; type: string; otherUserId: string | null; updatedAt: string };
type MessageRow = { id: string; conversation_id: string; sender_id: string; body: string | null; created_at: string; edited_at: string | null; deleted_at: string | null; message_read_receipts: { user_id: string; read_at: string }[] };
type Recipient = { user_id: string; display_name: string };

export function MessagesClient({ initialConversations, initialPreviews, initialConversationId }: { initialConversations: ConversationSummary[]; initialPreviews: Record<string, string>; initialConversationId?: string }) {
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState(initialConversations.some((conversation) => conversation.id === initialConversationId) ? initialConversationId! : initialConversations[0]?.id ?? "");
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [previews, setPreviews] = useState(initialPreviews);
  const [viewerId, setViewerId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [recipientQuery, setRecipientQuery] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [searchingRecipients, setSearchingRecipients] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState("");
  const pageOffset = useRef(0);
  const loadSequence = useRef(0);
  const activeConversation = useMemo(() => conversations.find((conversation) => conversation.id === activeId), [conversations, activeId]);

  const loadMessages = useCallback(async (conversationId: string, older = false) => {
    const sequence = ++loadSequence.current;
    const supabase = createSupabaseBrowserClient();
    if (!older) setLoading(true);
    setError("");
    const from = older ? pageOffset.current : 0;
    const { data, error: queryError } = await supabase.from("messages")
      .select("id,conversation_id,sender_id,body,created_at,edited_at,deleted_at,message_read_receipts(user_id,read_at)")
      .eq("conversation_id", conversationId).order("created_at", { ascending: false }).range(from, from + 49);
    if (queryError) {
      if (sequence !== loadSequence.current) return;
      setError("Messages could not be loaded. Your session or conversation access may have expired.");
      setLoading(false);
      return;
    }
    if (sequence !== loadSequence.current) return;
    const batch = (data ?? []).reverse() as MessageRow[];
    setHasOlder(batch.length === 50);
    pageOffset.current = from + batch.length;
    if (older) setMessages((current) => [...batch, ...current.filter((message) => !batch.some((item) => item.id === message.id))]);
    else {
      setMessages(batch);
      const latest = batch.at(-1);
      if (latest) {
        setPreviews((current) => ({ ...current, [conversationId]: latest.deleted_at ? "Message removed" : latest.body?.slice(0, 100) ?? "Attachment" }));
        setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, updatedAt: latest.created_at } : item).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      }
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const unreadRows = batch.filter((message) => message.sender_id !== user.id && !message.message_read_receipts.some((receipt) => receipt.user_id === user.id));
      if (sequence === loadSequence.current && unreadRows.length) {
        await supabase.from("message_read_receipts").insert(unreadRows.map((message) => ({ message_id: message.id, user_id: user.id })));
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const draft = readGuestMessageDraft();
    if (draft) setMessageText(draft);
  }, []);

  useEffect(() => {
    let mounted = true;
    const supabase = createSupabaseBrowserClient();
    void supabase.auth.getUser().then(({ data, error: authError }) => {
      if (mounted && !authError && data.user) setViewerId(data.user.id);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    pageOffset.current = 0;
    void loadMessages(activeId);
    const supabase = createSupabaseBrowserClient();
    let refreshTimer: number | undefined;
    const refreshSoon = () => { window.clearTimeout(refreshTimer); refreshTimer = window.setTimeout(() => { void loadMessages(activeId); }, 200); };
    const channel = supabase.channel(`conversation:${activeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${activeId}` }, refreshSoon)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_read_receipts" }, refreshSoon)
      .subscribe((status) => { if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setError("Live updates lost connection. Reload the conversation to refresh."); });
    return () => { window.clearTimeout(refreshTimer); void supabase.removeChannel(channel); };
  }, [activeId, loadMessages]);

  useEffect(() => {
    if (!activeId || !viewerId || !activeConversation?.otherUserId) { setBlocked(false); return; }
    const supabase = createSupabaseBrowserClient();
    void supabase.from("message_blocks").select("blocker_id,blocked_id")
      .or(`and(blocker_id.eq.${viewerId},blocked_id.eq.${activeConversation.otherUserId}),and(blocker_id.eq.${activeConversation.otherUserId},blocked_id.eq.${viewerId})`)
      .limit(1).then(({ data }) => setBlocked(Boolean(data?.length)));
  }, [activeId, activeConversation?.otherUserId, viewerId]);

  async function findRecipients(formData: FormData) {
    const query = String(formData.get("recipientQuery") ?? "").trim();
    if (query.length < 2 || query.length > 80) { setError("Search using at least 2 characters."); return; }
    setError("");
    const supabase = createSupabaseBrowserClient();
    setSearchingRecipients(true);
    const { data, error: searchError } = await supabase.rpc("search_message_recipients", { search_term: query });
    setSearchingRecipients(false);
    if (searchError) { setRecipients([]); setError("People could not be searched. Check that messaging discovery is available."); return; }
    setRecipients(data ?? []);
    if (!data?.length) setNotice("No active members matched that name.");
  }

  async function beginConversation(target: string, displayName: string) {
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { data, error: createError } = await supabase.rpc("create_direct_conversation", { target_user_id: target });
    if (createError || !data) { setError("Conversation could not be opened. The member may be inactive or have blocked messaging."); return; }
    const item = { id: data, type: "direct", otherUserId: target, updatedAt: new Date().toISOString() };
    setConversations((current) => [item, ...current.filter((conversation) => conversation.id !== item.id)]);
    setActiveId(item.id);
    setNotice(`Conversation opened with ${displayName}.`);
    setRecipients([]);
    setRecipientQuery("");
  }

  async function startSupportConversation() {
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { data: supportId, error: supportError } = await supabase.rpc("get_support_contact_id");
    if (supportError || !supportId) { setError("Support contact lookup is not available until the support-contact migration is applied."); return; }
    const { data, error: createError } = await supabase.rpc("create_direct_conversation", { target_user_id: supportId });
    if (createError || !data) { setError("A support conversation could not be opened."); return; }
    const item = { id: data, type: "direct", otherUserId: supportId, updatedAt: new Date().toISOString() };
    setConversations((current) => [item, ...current.filter((conversation) => conversation.id !== item.id)]);
    setActiveId(item.id);
  }

  async function sendMessage(formData: FormData) {
    const body = String(formData.get("body") ?? "").trim();
    if (!body || body.length > 5000 || !activeId || sending) return;
    setSending(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) { setError("Your message draft is still saved on this device. It was not sent."); setSending(false); return; }
    const { error: insertError } = await supabase.from("messages").insert({ conversation_id: activeId, sender_id: user.id, body });
    if (insertError) setError("Message was not sent. Check that both accounts are active and no block is in place.");
    else { clearGuestMessageDraft(); setMessageText(""); await loadMessages(activeId); }
    setSending(false);
  }

  async function toggleBlock() {
    if (!viewerId || !activeId || !activeConversation?.otherUserId) return;
    const supabase = createSupabaseBrowserClient();
    const result = blocked
      ? await supabase.from("message_blocks").delete().eq("blocker_id", viewerId).eq("blocked_id", activeConversation.otherUserId)
      : await supabase.from("message_blocks").insert({ blocker_id: viewerId, blocked_id: activeConversation.otherUserId });
    if (result.error) { setError("Block setting could not be changed."); return; }
    setBlocked(!blocked);
    setNotice(blocked ? "User unblocked." : "User blocked. New messages will be rejected by database policy.");
  }

  async function reportMessage(messageId: string) {
    if (!viewerId) return;
    const reason = window.prompt("Why are you reporting this message?")?.trim();
    if (!reason) return;
    const supabase = createSupabaseBrowserClient();
    const { error: reportError } = await supabase.from("message_reports").insert({ reporter_id: viewerId, message_id: messageId, reason: reason.slice(0, 160) });
    setNotice(reportError ? "Message report could not be submitted." : "Message reported to the moderation team.");
  }

  return (
    <section className="messenger">
      <aside className="conversation-list">
        <form action={findRecipients}>
          <label>Find a member to message
            <input name="recipientQuery" value={recipientQuery} onChange={(event) => setRecipientQuery(event.target.value)} placeholder="Search display name" minLength={2} maxLength={80} />
          </label>
          <button className="secondary" type="submit" disabled={searchingRecipients || recipientQuery.trim().length < 2}>{searchingRecipients ? "Searching…" : "Search members"}</button>
        </form>
        {recipients.map((recipient) => <button className="conversation-item" type="button" key={recipient.user_id} onClick={() => void beginConversation(recipient.user_id, recipient.display_name)}><b>{recipient.display_name}</b><small>Start a private conversation</small></button>)}
        <button className="primary" type="button" onClick={() => void startSupportConversation()}>Message CINEVA support</button>
        <div className="conversation-items">
          {conversations.map((conversation) => (
            <button type="button" key={conversation.id} className={activeId === conversation.id ? "conversation-item active" : "conversation-item"} onClick={() => setActiveId(conversation.id)}>
              <b>{conversation.type === "group" ? "Group conversation" : "Private conversation"}</b>
              <small>{previews[conversation.id] ?? "No messages yet"}</small>
              <small>{conversation.updatedAt.slice(0, 10)}</small>
            </button>
          ))}
          {!conversations.length && <p className="empty">No conversations yet. Search for a member or contact support.</p>}
        </div>
      </aside>
      <section className="message-panel">
        {activeId ? <>
          <header>
            <div><p className="eyebrow">PRIVATE CONVERSATION</p><h2>{activeConversation?.type === "group" ? "Group conversation" : "Direct conversation"}</h2></div>
            {activeConversation?.otherUserId && activeConversation.otherUserId !== viewerId && <button type="button" className="secondary" onClick={() => void toggleBlock()}>{blocked ? "Unblock user" : "Block user"}</button>}
          </header>
          {error && <p className="auth-error" role="alert">{error}</p>}
          {loading && <p className="empty">Loading messages…</p>}
          {hasOlder && <button className="secondary older-messages" onClick={() => void loadMessages(activeId, true)}>Load older messages</button>}
          <div className="message-history">
            {messages.map((message) => (
              <article key={message.id} className={message.sender_id === viewerId ? "message-bubble own" : "message-bubble"}>
                <p>{message.deleted_at ? "Message removed" : message.body}</p>
                <time dateTime={message.created_at}>{message.created_at.slice(0, 16).replace("T", " ")} UTC</time>
                {message.sender_id === viewerId && message.message_read_receipts.some((receipt) => receipt.user_id !== viewerId) && <small>Read</small>}
                {message.sender_id !== viewerId && !message.deleted_at && <button type="button" onClick={() => void reportMessage(message.id)}>Report</button>}
              </article>
            ))}
            {!loading && !messages.length && <p className="empty">Send the first message in this conversation.</p>}
          </div>
          <form action={sendMessage} className="send-message">
            <textarea name="body" value={messageText} onChange={(event) => { setMessageText(event.target.value); writeGuestMessageDraft(event.target.value); }} maxLength={5000} rows={3} placeholder={blocked ? "Unblock this user to start a new message" : "Write a private message…"} disabled={blocked || sending} required />
            <button className="primary" type="submit" disabled={blocked || sending || !messageText.trim()}>{sending ? "Sending…" : "Send message"}</button>
          </form>
        </> : <div className="empty-state"><h2>Your private inbox</h2><p>Choose a conversation or start a direct chat.</p></div>}
        {notice && <p className="auth-success" role="status">{notice}</p>}
      </section>
    </section>
  );
}

export function GuestMessageDraft() {
  const [messageText, setMessageText] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => { setMessageText(readGuestMessageDraft()); }, []);

  function saveDraft(formData: FormData) {
    const body = String(formData.get("body") ?? "").trim();
    if (!body || body.length > 5000) { setError("Enter a message draft up to 5,000 characters."); return; }
    if (!writeGuestMessageDraft(body)) { setError("The draft could not be saved. Check browser storage settings and keep this page open."); return; }
    setMessageText(body);
    setError("");
    setNotice("Draft saved on this device. Private messages can be sent after you sign in.");
  }

  return <section className="messenger">
    <aside className="conversation-list"><div><p className="eyebrow">PRIVATE INBOX</p><h2>Your messages</h2><p>Private conversations need an account so CINEVA can protect who can read them.</p></div></aside>
    <section className="message-panel">
      <div className="empty-state"><h2>Start with a draft</h2><p>Your text stays on this device until you are ready to send it from an account.</p></div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && <p className="auth-success" role="status">{notice}</p>}
      <form action={saveDraft} className="send-message">
        <textarea name="body" value={messageText} onChange={(event) => { setMessageText(event.target.value); if (!writeGuestMessageDraft(event.target.value)) setError("Your draft could not be saved on this device."); else setError(""); }} maxLength={5000} rows={4} placeholder="Write a private message draft…" required />
        <button className="primary" type="submit" disabled={!messageText.trim()}>Save draft</button>
      </form>
      <p><Link href="/account">Open your account to sign in</Link></p>
    </section>
  </section>;
}
