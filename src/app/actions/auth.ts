"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function rawField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function authErrorPath(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function safeReturnPath(value: string): string | null {
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  try {
    const target = new URL(value, "https://cineva.invalid");
    return target.origin === "https://cineva.invalid" ? `${target.pathname}${target.search}${target.hash}` : null;
  } catch {
    return null;
  }
}

type SignInResult = { error?: string; next?: string };

function signInError(error: { code?: string; name?: string; status?: number; message?: string }): string {
  const code = error.code?.toLowerCase();
  if (code === "email_not_confirmed") return "Please confirm your email address using the link we sent before signing in.";
  if (code === "invalid_credentials" || code === "invalid_grant") return "Email or password was not accepted.";
  if (error.status === 429 || code?.includes("rate_limit")) return "Too many sign-in attempts. Please wait a moment and try again.";
  if (error.name === "AuthRetryableFetchError" || error.status === 0 || /fetch|network|timeout/i.test(error.message ?? "")) {
    return "We could not reach the sign-in service. Check your connection and try again.";
  }
  if (typeof error.status === "number" && error.status >= 500) return "The sign-in service is temporarily unavailable. Please try again later.";
  return "We could not sign you in right now. Please try again later.";
}

async function authenticate(formData: FormData): Promise<SignInResult> {
  const email = field(formData, "email").toLowerCase();
  // Passwords are intentionally not trimmed: whitespace may be part of a valid password.
  const password = rawField(formData, "password");
  const next = safeReturnPath(field(formData, "next")) ?? undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) return { error: "Enter a valid email and password." };

  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { error: "Sign-in is unavailable because CINEVA authentication is not configured." };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const message = signInError(error);
      if (message !== "Email or password was not accepted.") {
        console.error("CINEVA sign-in request failed", { name: error.name, code: error.code, status: error.status });
      }
      return { error: message };
    }
    return { next };
  } catch (error) {
    const details = error && typeof error === "object" ? error as { name?: string; code?: string; status?: number; message?: string } : {};
    console.error("CINEVA sign-in could not reach Supabase", { name: details.name, code: details.code, status: details.status });
    return { error: "Sign-in is temporarily unavailable. Please try again later." };
  }
}

async function callbackUrl(next: string): Promise<string | undefined> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim() || requestHeaders.get("host");
  if (!host || /[^a-zA-Z0-9.:[\]-]/.test(host)) return undefined;
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const protocol = isLocal && forwardedProtocol === "http" ? "http" : "https";
  const url = new URL("/auth/callback", `${protocol}://${host}`);
  url.searchParams.set("next", next);
  return url.toString();
}

export async function signUp(formData: FormData) {
  const displayName = field(formData, "displayName");
  const email = field(formData, "email").toLowerCase();
  const password = rawField(formData, "password");
  const confirmPassword = rawField(formData, "confirmPassword");
  if (displayName.length < 2 || displayName.length > 80) authErrorPath("/register", "Enter a display name between 2 and 80 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) authErrorPath("/register", "Enter a valid email address.");
  if (password.length < 10) authErrorPath("/register", "Use a password with at least 10 characters.");
  if (password !== confirmPassword) authErrorPath("/register", "Your passwords do not match.");

  const next = safeReturnPath(field(formData, "next")) ?? "/account";
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) authErrorPath("/register", "Supabase is not configured. Add the project base URL before registering.");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName }, emailRedirectTo: await callbackUrl(next) },
    });
    if (error) {
      const code = error.code?.toLowerCase();
      if (code === "weak_password" || code === "password_too_short") authErrorPath("/register", "Choose a stronger password and try again.");
      if (code === "email_exists" || code === "user_already_exists") authErrorPath("/register", "An account may already use this email. Try signing in or resetting your password.");
      if (error.status === 429) authErrorPath("/register", "Too many attempts. Please wait a moment and try again.");
      console.error("CINEVA sign-up request failed", { code: error.code, status: error.status });
      authErrorPath("/register", "Your account could not be created. Check your details and try again.");
    }
    if (!data.session) authErrorPath("/register", "Your account was created, but Supabase requires email confirmation. Disable email confirmations in the Supabase Dashboard to sign in immediately.");
    redirect(next);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const details = error && typeof error === "object" ? error as { name?: string; code?: string; status?: number; message?: string } : {};
    console.error("CINEVA sign-up could not reach Supabase", { name: details.name, code: details.code, status: details.status });
    if (/SUPABASE.*(configured|project base URL|publishable key)/i.test(details.message ?? "")) authErrorPath("/register", "CINEVA authentication is not fully configured. Please contact support.");
    authErrorPath("/register", "Registration is temporarily unavailable. Check your connection and try again.");
  }
}

export async function signIn(formData: FormData) {
  const result = await authenticate(formData);
  const next = safeReturnPath(field(formData, "next"));
  if (result.error) {
    const query = new URLSearchParams({ error: result.error });
    if (next) query.set("next", next);
    redirect(`/login?${query.toString()}`);
  }
  redirect(result.next ?? "/account");
}

export async function signInFromModal(previousState: { error?: string; success?: boolean }, formData: FormData) {
  void previousState;
  const result = await authenticate(formData);
  return result.error ? { error: result.error } : { success: true as const };
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    let signOutFailed = false;
    try {
      const { error } = await supabase.auth.signOut();
      signOutFailed = Boolean(error);
    } catch {
      signOutFailed = true;
    }
    if (signOutFailed) {
      // A failed global sign-out can leave this browser's cookie session active.
      // Fall back to clearing this device's session even if Supabase is unreachable.
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // Do not expose auth internals; the local cleanup was still attempted.
      }
    }
  }
  redirect("/");
}

export async function requestPasswordReset(formData: FormData) {
  const email = field(formData, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) authErrorPath("/forgot-password", "Enter a valid email address.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) authErrorPath("/forgot-password", "Supabase is not configured. Add the project base URL first.");
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: await callbackUrl("/account/password") });
  if (error) authErrorPath("/forgot-password", "The reset email could not be sent. Try again later.");
  redirect("/forgot-password?message=If%20that%20account%20exists%2C%20a%20reset%20email%20has%20been%20sent.");
}

export async function updatePassword(formData: FormData) {
  const password = rawField(formData, "password");
  if (password.length < 10) authErrorPath("/account/password", "Use a password with at least 10 characters.");
  const { supabase, user } = await (async () => {
    const client = await createSupabaseServerClient();
    if (!client) return { supabase: null, user: null };
    const { data: { user } } = await client.auth.getUser();
    return { supabase: client, user };
  })();
  if (!supabase || !user) redirect("/login?error=Sign%20in%20through%20your%20password%20reset%20email%20first.");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) authErrorPath("/account/password", "The password could not be updated.");
  redirect("/account?message=Password%20updated.");
}

export async function updateDisplayName(formData: FormData) {
  const displayName = field(formData, "displayName");
  if (displayName.length < 2 || displayName.length > 80) redirect("/account?error=Display%20name%20must%20be%202%E2%80%9380%20characters.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/account?error=Supabase%20is%20not%20configured.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", user.id);
  if (error) redirect("/account?error=Profile%20could%20not%20be%20saved.");
  redirect("/account?message=Profile%20updated.");
}
