import Link from "next/link";
import { signIn } from "@/app/actions/auth";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { connection } from "next/server";

function returnPath(value?: string) {
  if (!value) return "/account";
  try {
    const target = new URL(value, "https://cineva.invalid");
    return value.startsWith("/") && target.origin === "https://cineva.invalid" ? `${target.pathname}${target.search}${target.hash}` : "/account";
  } catch { return "/account"; }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; next?: string }> }) {
  await connection();
  const params = await searchParams;
  const { user } = await getAuthenticatedUser();
  const next = returnPath(params.next);
  if (user) redirect(next);
  const nextQuery = `?next=${encodeURIComponent(next)}`;
  return <main className="auth-page"><section className="auth-card"><Link href="/" className="brand"><span className="brand-icon">C</span><span><b>CINEVA</b><small>FILMS STREAMING</small></span></Link><p className="eyebrow">WELCOME BACK</p><h1>Sign in</h1>{params.error && <p className="auth-error" role="alert">{params.error}</p>}{params.message && <p className="auth-success" role="status">{params.message}</p>}<form action={signIn}><input type="hidden" name="next" value={next} /><label>Email<input name="email" type="email" autoComplete="email" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" required /></label><button className="primary" type="submit">Sign in</button></form><p><Link href={`/forgot-password${nextQuery}`}>Forgot your password?</Link></p><p>New to CINEVA? <Link href={`/register${nextQuery}`}>Create an account</Link></p></section></main>;
}
