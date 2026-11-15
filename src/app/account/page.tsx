import { redirect } from "next/navigation";
import Link from "next/link";
import { connection } from "next/server";
import { signOut, updateDisplayName } from "@/app/actions/auth";
import { ProfileImageForm } from "@/components/ProfileImageForm";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { Suspense } from "react";

async function AccountContent({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  await connection();
  const [{ supabase, user }, params] = await Promise.all([getAuthenticatedUser(), searchParams]);
  if (!supabase || !user) redirect("/login?next=%2Faccount");
  const [profileResult, favoriteResult] = await Promise.all([
    supabase.from("profiles").select("display_name, profile_picture_asset_id, account_status, registered_at").eq("id", user.id).maybeSingle(),
    supabase.from("favorites").select("content_id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  const profile = profileResult.data;
  const favoriteCount = favoriteResult.count;
  let profileImageUrl: string | null = null;
  let imageError = false;
  if (profile?.profile_picture_asset_id) {
    const { data: asset, error: assetError } = await supabase.from("media_assets").select("bucket, object_key").eq("id", profile.profile_picture_asset_id).maybeSingle();
    imageError = Boolean(assetError);
    if (asset?.bucket && asset.object_key) {
      const { data, error } = await supabase.storage.from(asset.bucket).createSignedUrl(asset.object_key, 60 * 10);
      profileImageUrl = data?.signedUrl ?? null;
      imageError = imageError || Boolean(error);
    }
  }
  const displayName = profile?.display_name ?? "";
  return <main className="auth-page"><section className="auth-card account-card"><Link href="/">← CINEVA home</Link><p className="eyebrow">YOUR ACCOUNT</p><h1>{displayName || "CINEVA member"}</h1>{params.error && <p className="auth-error" role="alert">{params.error}</p>}{params.message && <p className="auth-success" role="status">{params.message}</p>}{profileResult.error ? <p className="auth-error" role="alert">Your profile could not be loaded. Refresh the page or try again later.</p> : !profile ? <p className="auth-error" role="alert">Your profile record is missing. Contact CINEVA support to restore it.</p> : null}{favoriteResult.error ? <p className="auth-error" role="alert">Your favorites could not be loaded.</p> : null}{imageError && <p className="auth-error" role="alert">Your profile image could not be loaded. You can upload it again.</p>}<dl><dt>Email</dt><dd>{user.email}</dd><dt>Account status</dt><dd>{profile?.account_status ?? (profileResult.error ? "Unavailable" : "Profile missing")}</dd><dt>Favorites</dt><dd>{favoriteResult.error ? "Unavailable" : favoriteCount ?? 0}</dd><dt>Your user ID</dt><dd>{user.id}</dd></dl>{profile && <><form action={updateDisplayName}><label>Display name<input name="displayName" defaultValue={displayName} minLength={2} maxLength={80} required /></label><button className="primary" type="submit">Save profile</button></form><ProfileImageForm currentImage={profileImageUrl} /></>}<p><Link href="/messages">Private messages</Link></p><p><Link href="/notifications">Notifications</Link></p><p><Link href="/announcements">Announcements</Link></p><p><Link href="/account/password">Change password</Link></p><form action={signOut}><button className="secondary" type="submit">Sign out</button></form></section></main>;
}

export default function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  return <Suspense fallback={<main className="auth-page"><section className="auth-card account-card"><p className="eyebrow">YOUR ACCOUNT</p><p className="empty">Loading your account…</p></section></main>}><AccountContent searchParams={searchParams} /></Suspense>;
}
