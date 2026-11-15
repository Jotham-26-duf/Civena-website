"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export async function markNotificationRead(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const requestedDestination = String(formData.get("destination") ?? "");
  let destination = "/notifications?message=Notification%20marked%20as%20read.";
  if (requestedDestination.startsWith("/") && !requestedDestination.startsWith("//") && !requestedDestination.startsWith("/\\")) {
    try {
      const url = new URL(requestedDestination, "https://cineva.invalid");
      if (url.origin === "https://cineva.invalid") {
        const conversation = url.pathname.match(/^\/messages\/([0-9a-f-]{36})$/i);
        if (conversation) { url.pathname = "/messages"; url.searchParams.set("conversation", conversation[1]); }
        destination = `${url.pathname}${url.search}${url.hash}`;
      }
    } catch { /* Invalid redirect target falls back to the notifications page. */ }
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/notifications?error=Invalid%20notification.");
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) redirect("/notifications?error=Private%20notifications%20were%20not%20changed.");
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("recipient_id", user.id);
  if (error) redirect("/notifications?error=Notification%20could%20not%20be%20updated.");
  revalidatePath("/notifications");
  redirect(destination);
}

export async function markAllNotificationsRead() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) redirect("/notifications?error=Private%20notifications%20were%20not%20changed.");
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", user.id).is("read_at", null);
  if (error) redirect("/notifications?error=Notifications%20could%20not%20be%20updated.");
  revalidatePath("/notifications");
  redirect("/notifications?message=All%20notifications%20marked%20as%20read.");
}
