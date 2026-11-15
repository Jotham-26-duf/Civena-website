import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/auth";
import { connection } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  await connection();
  const params = await searchParams;
  const { user } = await getAuthenticatedUser();
  if (user) redirect("/account");
  return <main className="auth-page"><section className="auth-card"><Link href="/" className="brand"><span className="brand-icon">C</span><span><b>CINEVA</b><small>FILMS STREAMING</small></span></Link><p className="eyebrow">ACCOUNT RECOVERY</p><h1>Reset your password</h1>{params.error && <p className="auth-error" role="alert">{params.error}</p>}{params.message && <p className="auth-success" role="status">{params.message}</p>}<form action={requestPasswordReset}><label>Email<input name="email" type="email" autoComplete="email" required /></label><button className="primary" type="submit">Send recovery email</button></form><p><Link href="/login">Back to sign in</Link></p></section></main>;
}
