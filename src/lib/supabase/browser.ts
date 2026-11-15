"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getSupabaseEnvironment } from "./environment";

let browserClient: SupabaseClient<Database> | undefined;

export function createSupabaseBrowserClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient;
  const environment = getSupabaseEnvironment();
  if (!environment) throw new Error("Supabase is not configured. Set the project base URL and publishable key.");
  browserClient = createBrowserClient<Database>(environment.url, environment.publishableKey);
  return browserClient;
}
