import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <main className="messages-page"><p className="auth-error">Announcement is temporarily unavailable.</p></main>;
  const { data, error } = await supabase.from("announcements").select("id,title,body,published_at").eq("id", id).eq("status", "published").maybeSingle();
  if (error) return <main className="messages-page"><p className="auth-error">Announcement could not be loaded.</p></main>;
  if (!data) notFound();
  return <main className="messages-page"><article className="announcement-card announcement-detail"><Link href="/announcements">← All announcements</Link><p className="eyebrow">{data.published_at ? new Date(data.published_at).toLocaleDateString() : "CINEVA"}</p><h1>{data.title}</h1><p>{data.body}</p></article></main>;
}
