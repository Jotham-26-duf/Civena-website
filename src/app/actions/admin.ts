"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/server";

async function requirePermission(permission: string) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) redirect("/login");
  const [{ data: active }, { data: allowed }] = await Promise.all([
    supabase.rpc("is_active_user"),
    supabase.rpc("has_permission", { permission_name: permission }),
  ]);
  if (!active || !allowed) redirect("/account?error=You%20do%20not%20have%20permission%20to%20do%20that.");
  return supabase;
}

export async function changeAccountStatus(formData: FormData) {
  const targetUser = String(formData.get("targetUser") ?? "");
  const nextStatus = String(formData.get("nextStatus") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(targetUser) || !["active", "suspended", "closed"].includes(nextStatus)) redirect("/admin?error=Invalid%20account%20change.");
  const supabase = await requirePermission("users.manage");
  const { error } = await supabase.rpc("set_account_status", { target_user: targetUser, next_status: nextStatus });
  if (error) redirect("/admin?error=Account%20status%20could%20not%20be%20changed.");
  revalidatePath("/admin");
  redirect("/admin?message=Account%20status%20updated.");
}

export async function changeUserRole(formData: FormData) {
  const targetUser = String(formData.get("targetUser") ?? "");
  const roleName = String(formData.get("roleName") ?? "");
  const shouldHaveRole = String(formData.get("shouldHaveRole") ?? "") === "true";
  if (!/^[0-9a-f-]{36}$/i.test(targetUser) || !["moderator", "administrator"].includes(roleName)) redirect("/admin?error=Invalid%20role%20change.");
  const supabase = await requirePermission("users.manage");
  const { error } = await supabase.rpc("set_user_role", { target_user: targetUser, role_name: roleName, should_have_role: shouldHaveRole });
  if (error) redirect("/admin?error=Role%20could%20not%20be%20changed.");
  revalidatePath("/admin");
  redirect("/admin?message=Role%20updated.");
}

export async function moderateReport(formData: FormData) {
  const reportId = String(formData.get("reportId") ?? "");
  const reportKind = String(formData.get("reportKind") ?? "");
  const nextStatus = String(formData.get("nextStatus") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(reportId) || !["report", "message_report"].includes(reportKind) || !["open", "reviewing", "resolved", "dismissed"].includes(nextStatus)) redirect("/admin?error=Invalid%20report%20change.");
  const supabase = await requirePermission("reports.review");
  const { error } = await supabase.rpc("moderate_content", { target_kind: reportKind, target_id: reportId, next_status: nextStatus, action_reason: "Reviewed in CINEVA admin dashboard" });
  if (error) redirect("/admin?error=Report%20could%20not%20be%20updated.");
  revalidatePath("/admin");
  redirect("/admin?message=Report%20updated.");
}

export async function createCatalogItem(formData: FormData) {
  const contentType = String(formData.get("contentType") ?? "");
  const legacyId = Number(formData.get("legacyId"));
  const title = String(formData.get("title") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  if (!["movie", "series"].includes(contentType) || !Number.isSafeInteger(legacyId) || legacyId < 1 || title.length < 1 || title.length > 200 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) redirect("/admin?error=Enter%20a%20valid%20type%2C%20legacy%20ID%2C%20title%20and%20slug.");
  const supabase = await requirePermission("content.manage");
  const { error } = await supabase.from("content_items").insert({ content_type: contentType, legacy_id: legacyId, title, slug, status: "draft" });
  if (error) redirect("/admin?error=Catalogue%20record%20could%20not%20be%20created.");
  revalidatePath("/");
  revalidatePath("/movies");
  revalidatePath("/series");
  redirect("/admin?message=Draft%20catalogue%20record%20created.");
}

export async function updateCatalogItem(formData: FormData) {
  const contentId = String(formData.get("contentId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const status = String(formData.get("status") ?? "");
  const featured = formData.get("featured") === "true";
  if (!/^[0-9a-f-]{36}$/i.test(contentId) || title.length < 1 || title.length > 200 || !["draft", "published", "archived"].includes(status)) redirect("/admin?error=Invalid%20catalogue%20update.");
  const supabase = await requirePermission("content.manage");
  const { error } = await supabase.from("content_items").update({ title, description: description || null, status, is_featured: featured }).eq("id", contentId);
  if (error) redirect("/admin?error=Catalogue%20record%20could%20not%20be%20updated.");
  revalidatePath("/");
  revalidatePath("/movies");
  revalidatePath("/series");
  redirect("/admin?message=Catalogue%20record%20updated.");
}

export async function readReportedMessage(formData: FormData) {
  const messageId = String(formData.get("messageId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) return { error: "Invalid message reference." };
  const supabase = await requirePermission("messages.moderate");
  const { data, error } = await supabase.rpc("get_reported_message_for_moderation", { target_message_id: messageId });
  if (error) return { error: "Message is no longer eligible for reported-message review." };
  return { message: data };
}

export async function createAnnouncement(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || title.length > 180 || !body || body.length > 10000) redirect("/admin?error=Enter%20a%20title%20and%20body%20within%20the%20allowed%20lengths.");
  const supabase = await requirePermission("announcements.manage");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const status = String(formData.get("status") ?? "draft") === "published" ? "published" : "draft";
  const { error } = await supabase.from("announcements").insert({ title, body, status, created_by: user.id, published_at: status === "published" ? new Date().toISOString() : null });
  if (error) redirect("/admin?error=Announcement%20could%20not%20be%20created.");
  revalidatePath("/admin"); revalidatePath("/announcements");
  redirect("/admin?message=Announcement%20created.");
}

export async function updateAnnouncement(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const status = String(formData.get("status") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !title || title.length > 180 || !body || body.length > 10000 || !["draft", "published", "archived"].includes(status)) redirect("/admin?error=Invalid%20announcement%20update.");
  const supabase = await requirePermission("announcements.manage");
  const { data: existing } = await supabase.from("announcements").select("status,published_at").eq("id", id).maybeSingle();
  if (!existing) redirect("/admin?error=Announcement%20not%20found.");
  const publishedAt = status === "published" ? existing.published_at ?? new Date().toISOString() : null;
  const { error } = await supabase.from("announcements").update({ title, body, status, published_at: publishedAt, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) redirect("/admin?error=Announcement%20could%20not%20be%20updated.");
  revalidatePath("/admin"); revalidatePath("/announcements"); revalidatePath(`/announcements/${id}`);
  redirect("/admin?message=Announcement%20updated.");
}

export async function deleteAnnouncement(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/admin?error=Invalid%20announcement.");
  const supabase = await requirePermission("announcements.manage");
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) redirect("/admin?error=Announcement%20could%20not%20be%20deleted.");
  revalidatePath("/admin"); revalidatePath("/announcements");
  redirect("/admin?message=Announcement%20deleted.");
}

export async function moderateDiscussionItem(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["review", "comment"].includes(kind) || !["pending", "published", "hidden", "removed"].includes(status)) redirect("/admin?error=Invalid%20moderation%20request.");
  const supabase = await requirePermission("comments.moderate");
  const { error } = await supabase.rpc("moderate_content", { target_kind: kind, target_id: id, next_status: status, action_reason: "Reviewed in CINEVA admin dashboard" });
  if (error) redirect("/admin?error=Discussion%20item%20could%20not%20be%20updated.");
  revalidatePath("/admin");
  redirect("/admin?message=Discussion%20item%20updated.");
}
