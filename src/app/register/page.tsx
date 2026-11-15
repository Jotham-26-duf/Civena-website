import Link from "next/link";
import { signUp } from "@/app/actions/auth";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { connection } from "next/server";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  await connection();
  const params = await searchParams;
  const { user } = await getAuthenticatedUser();
  let next = "/account";
  if (params.next) {
    try { const target = new URL(params.next, "https://cineva.invalid"); if (params.next.startsWith("/") && target.origin === "https://cineva.invalid") next = `${target.pathname}${target.search}${target.hash}`; } catch { /* Fall back to the account page. */ }
  }
  if (user) redirect(next);
  return <main className="auth-page"><section className="auth-card"><Link href="/" className="brand"><span className="brand-icon">C</span><span><b>CINEVA</b><small>FILMS STREAMING</small></span></Link><p className="eyebrow">JOIN CINEVA</p><h1>Create your account</h1>{params.error && <p className="auth-error" role="alert">{params.error}</p>}<form action={signUp}><input type="hidden" name="next" value={next} /><label>Full name<input name="displayName" autoComplete="name" minLength={2} maxLength={80} required /></label><label>Email address<input name="email" type="email" autoComplete="email" required /></label><label>Password<input name="password" type="password" autoComplete="new-password" minLength={10} required /></label><label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required /></label><PendingSubmitButton pendingLabel="Creating account…">Create account</PendingSubmitButton></form><p>Already registered? <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></p></section></main>;
}
