import Link from "next/link";
import { connection } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AnnouncementsPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <main className="messages-page"><h1>CINEVA announcements</h1><p className="auth-error">Announcements are temporarily unavailable.</p></main>;
  const { data, error } = await supabase.from("announcements").select("id,title,body,published_at,created_at").eq("status", "published").order("published_at", { ascending: false }).limit(100);
  return <main className="messages-page"><header className="messages-header"><Link href="/">← CINEVA</Link><div><p className="eyebrow">CINEVA UPDATES</p><h1>Announcements</h1></div><Link href="/account">My account</Link></header>{error ? <p className="auth-error" role="alert">Announcements could not be loaded.</p> : !data?.length ? <p className="empty">There are no announcements yet.</p> : <section className="announcement-list">{data.map((item) => <article className="announcement-card" key={item.id}><p className="eyebrow">{item.published_at ? new Date(item.published_at).toLocaleDateString() : "CINEVA"}</p><h2><Link href={`/announcements/${item.id}`}>{item.title}</Link></h2><p>{item.body.length > 260 ? `${item.body.slice(0, 260)}…` : item.body}</p><Link className="text-button" href={`/announcements/${item.id}`}>Read announcement</Link></article>)}</section>}</main>;
}
