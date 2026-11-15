import Link from "next/link";
import { connection } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { markAllNotificationsRead, markNotificationRead } from "@/app/actions/notifications";

function localDestination(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  try { const url = new URL(value, "https://cineva.invalid"); if (url.origin !== "https://cineva.invalid") return null; const conversation = url.pathname.match(/^\/messages\/([0-9a-f-]{36})$/i); if (conversation) return `/messages?conversation=${encodeURIComponent(conversation[1])}`; return `${url.pathname}${url.search}${url.hash}`; } catch { return null; }
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  await connection();
  const [{ supabase, user }, params] = await Promise.all([getAuthenticatedUser(), searchParams]);
  if (!supabase || !user) return <main className="messages-page"><header className="messages-header"><Link href="/">← CINEVA</Link><div><p className="eyebrow">YOUR UPDATES</p><h1>Notifications</h1></div><Link href="/account">Account</Link></header><section className="empty-state"><h2>No guest notifications</h2><p>Notifications are private account updates. Public CINEVA news is available in <Link href="/announcements">Announcements</Link>.</p></section></main>;
  const { data: notifications, error } = await supabase.from("notifications").select("id,title,message,notification_type,action_url,created_at,read_at").eq("recipient_id", user.id).order("created_at", { ascending: false }).limit(100);
  return <main className="messages-page"><header className="messages-header"><Link href="/">← CINEVA</Link><div><p className="eyebrow">YOUR UPDATES</p><h1>Notifications</h1></div><Link href="/account">My account</Link></header>
    {params.error && <p className="auth-error" role="alert">{params.error}</p>}{params.message && <p className="auth-success" role="status">{params.message}</p>}
    {error ? <p className="auth-error" role="alert">Notifications could not be loaded. Refresh the page or sign in again.</p> : <>
      {!!notifications?.some((item) => !item.read_at) && <form action={markAllNotificationsRead} className="notification-actions"><button className="secondary">Mark all as read</button></form>}
      {!notifications?.length ? <p className="empty">You don’t have any notifications yet.</p> : <section className="notification-list">{notifications.map((item) => {
        const destination = localDestination(item.action_url);
        return <article className={`notification-card ${item.read_at ? "is-read" : "is-unread"}`} key={item.id}><div><p className="eyebrow">{item.notification_type.replaceAll("_", " ")}</p><h2>{item.title}</h2><p>{item.message}</p><time>{new Date(item.created_at).toLocaleString()}</time></div><div className="notification-card-actions">{destination && (item.read_at ? <Link className="secondary" href={destination}>Open</Link> : <form action={markNotificationRead}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="destination" value={destination} /><button className="secondary">Open</button></form>)}{!item.read_at && <form action={markNotificationRead}><input type="hidden" name="id" value={item.id} /><button className="secondary">Mark read</button></form>}</div></article>;
      })}</section>}
    </>}
  </main>;
}
