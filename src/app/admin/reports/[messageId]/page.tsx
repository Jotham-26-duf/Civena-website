import { redirect } from "next/navigation";
import Link from "next/link";
import { connection } from "next/server";
import { ReportedMessageReview } from "@/components/ReportedMessageReview";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export default async function ReportedMessagePage({ params }: { params: Promise<{ messageId: string }> }) {
  await connection();
  const [{ supabase, user }, { messageId }] = await Promise.all([getAuthenticatedUser(), params]);
  if (!supabase || !user) redirect("/login");
  const { data: allowed } = await supabase.rpc("has_permission", { permission_name: "messages.moderate" });
  if (!allowed) redirect("/account?error=Audited%20moderator%20access%20required.");
  return <main className="admin-page"><Link href="/admin">← Admin dashboard</Link><p className="eyebrow">AUDITED EXCEPTIONAL ACCESS</p><h1>Reported private message</h1><p>The message is retrieved only through the permission-checked, audit-writing database function. Access requires an active report.</p><ReportedMessageReview messageId={messageId} /></main>;
}
