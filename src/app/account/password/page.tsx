import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { updatePassword } from "@/app/actions/auth";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export default async function UpdatePasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await connection();
  const [{ user }, params] = await Promise.all([getAuthenticatedUser(), searchParams]);
  if (!user) redirect("/login");
  return <main className="auth-page"><section className="auth-card"><Link href="/account">Back to account</Link><p className="eyebrow">SECURITY</p><h1>Choose a new password</h1>{params.error && <p className="auth-error" role="alert">{params.error}</p>}<form action={updatePassword}><label>New password<input name="password" type="password" autoComplete="new-password" minLength={10} required /></label><button className="primary" type="submit">Update password</button></form></section></main>;
}
